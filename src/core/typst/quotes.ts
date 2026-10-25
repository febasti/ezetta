import type { Tree } from '@lezer/common'
import type { EditInput, EditResult } from './edit'
import { insideOpaque } from './edit'
import { balanced, parseArgs } from './args'
import { groupSource } from './citations'
import type { Citation } from './citations'
import { setNamed } from './figures'
import type { TextEdit } from './figures'
import { parseTypst } from './parser'
import { countWords } from './text'

/**
 * Quotes. One element, `quote`, for three kinds of quotation:
 *
 *   `Er sagte #quote[Text im Satz] @kant1781[S. 12].`   in the text: Typst sets the quotation marks of
 *       the language, and the citation follows the closing mark like any citation
 *   `#quote(block: true, attribution: [@kant1781[S. 12]])[Zitierter Text.]`   a block quote: a longer
 *       passage that is still part of the text, set off as an indented paragraph
 *   `#quote(block: true, attribution: [Goethe, _Faust_])[Motto.] <epigraph>`   an epigraph (motto), at
 *       the start of a chapter: set apart, with a free-text source under it
 *
 * The source of a block quote is its `attribution`: ordinary markup in brackets, in which citations
 * are written as everywhere else, so they are never inside the quoted text. The label `<epigraph>`
 * marks the third kind, so a sheet stays plain Typst and the template decides how each looks.
 *
 * The file never holds quotation marks of its own. The editor draws the marks of an inline quote as
 * decoration only.
 */

export interface Quote {
  /** The whole expression, `#quote(…)[…]`. */
  from: number
  to: number
  block: boolean
  /** End of `#quote(…)[` and start of the closing `]`. */
  openTo: number
  closeFrom: number
  /** The extent of `(…)` after the name, or null without arguments. */
  args: { from: number; to: number } | null
  /** Inline quotes around this one, so a quote in a quote gets the inner marks. */
  depth: number
  /** Words of the quoted text. */
  words: number
  /** An epigraph (motto): a block quote with `<epigraph>` right behind it. */
  epigraph: boolean
  /** The end of the quote with that label (equal to `to` for a quote without one). */
  end: number
  /**
   * The source of the quote: the argument `attribution: […]`, and what is between its brackets.
   * Null without one, and for an attribution that is not written in brackets.
   */
  attribution: { from: number; to: number; innerFrom: number; innerTo: number } | null
}

const BLOCK_ARG = /block\s*:\s*true/
const EPIGRAPH_LABEL = /^[ \t]*<epigraph>/

/**
 * `blockMarks`: block quotes get quotation marks too (a project setting), so an inline quote inside
 * one is nested in it and gets the inner marks, as in Typst.
 */
export function scanQuotes(
  tree: Tree,
  doc: string,
  options: { blockMarks?: boolean } = {},
): Quote[] {
  const out: Quote[] = []
  let depth = 0
  const inline: boolean[] = []
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'Expression') return undefined
      const node = ref.node
      const name = node.getChild('FuncName')
      const fn = name ? doc.slice(name.from, name.to) : ''
      if (fn === 'footnote') return false // formats inside a note stay as they are
      const content = node.getChild('Content')
      const marks = content?.getChildren('ContentMark') ?? []
      const open = marks[0]
      const close = marks.length > 1 ? marks[marks.length - 1] : undefined
      if (fn !== 'quote' || !open || !close) {
        inline.push(false)
        return undefined
      }
      const args = node.getChild('Args')
      const block = args !== null && BLOCK_ARG.test(doc.slice(args.from, args.to))
      let attribution: Quote['attribution'] = null
      if (block && args) {
        const found = parseArgs(doc, args.from, args.to - 1).find((a) => a.name === 'attribution')
        if (found && doc[found.valueFrom] === '[' && doc[found.valueTo - 1] === ']')
          attribution = {
            from: found.from,
            to: found.to,
            innerFrom: found.valueFrom + 1,
            innerTo: found.valueTo - 1,
          }
      }
      const label = block ? EPIGRAPH_LABEL.exec(doc.slice(node.to, node.to + 40)) : null
      out.push({
        from: node.from,
        to: node.to,
        block,
        openTo: open.to,
        closeFrom: close.from,
        args: args ? { from: args.from, to: args.to } : null,
        depth: block ? 0 : depth,
        words: block ? 0 : countWords(doc.slice(open.to, close.from)),
        epigraph: label !== null,
        end: node.to + (label ? label[0].length : 0),
        attribution,
      })
      const nests = !block || options.blockMarks === true
      inline.push(nests)
      if (nests) depth += 1
      return undefined
    },
    leave: (ref) => {
      if (ref.name === 'Expression' && inline.pop()) depth -= 1
    },
  })
  return out
}

/** The innermost inline quote around the range (its text or its marks). */
export function inlineQuoteAt(quotes: readonly Quote[], from: number, to = from): Quote | null {
  let found: Quote | null = null
  for (const quote of quotes)
    if (
      !quote.block &&
      quote.from <= from &&
      quote.to >= to &&
      (!found || quote.from >= found.from)
    )
      found = quote
  return found
}

// --- the marks ------------------------------------------------------------------------------------

export { QUOTE_STYLES, QUOTE_STYLE_MARKS, quoteMarks, quoteStyleSetRule } from './quoteStyle'
export type { QuoteMarks, QuoteStyle } from './quoteStyle'

/**
 * From this many words a quote belongs in a block, by convention of the citation style: APA and
 * most German theses 40, MLA more than four lines of prose (about 50 words), Chicago 100. Only a
 * hint, never a rule.
 */
export function blockQuoteWords(citationStyle: string): number {
  if (citationStyle.startsWith('chicago')) return 100
  if (citationStyle === 'mla') return 50
  return 40
}

// --- editing --------------------------------------------------------------------------------------

const none = (input: EditInput): EditResult => ({
  changes: [],
  anchor: input.from,
  head: input.to,
})

const BLANK_LINE = /\n[ \t]*\n/
const BLOCK_PREFIX = /^[ \t]*(?:[-+]|=+|\d+\.)[ \t]/

/** Takes the wrapper off an inline quote, keeping its text. */
export function unwrapInline(quote: Quote): TextEdit[] {
  return [
    { from: quote.from, to: quote.openTo, insert: '' },
    { from: quote.closeFrom, to: quote.to, insert: '' },
  ]
}

/**
 * Takes a quote off and keeps its text: the second Backspace or Delete next to its marks. A block
 * quote's wrapper goes with the line breaks just inside its brackets and an epigraph with its label;
 * its source (the text of its `attribution`) moves behind the text, so nothing is lost.
 */
export function removeQuote(doc: string, quote: Quote): TextEdit[] {
  if (!quote.block) return unwrapInline(quote)
  const openEnd = quote.openTo + (doc[quote.openTo] === '\n' ? 1 : 0)
  const closeStart =
    quote.closeFrom - (quote.closeFrom > openEnd && doc[quote.closeFrom - 1] === '\n' ? 1 : 0)
  const source = quote.attribution
    ? doc.slice(quote.attribution.innerFrom, quote.attribution.innerTo).trim()
    : ''
  return [
    { from: quote.from, to: openEnd, insert: '' },
    { from: closeStart, to: quote.end, insert: source === '' ? '' : ` ${source}` },
  ]
}

/**
 * Enter on an empty last line of a block quote leaves the quote, as Enter in an empty list item
 * ends the list: the empty line moves out, behind the quote, and the caret starts a paragraph there.
 * A quote with nothing else in it goes, source and all. Null where Enter is not a matter of leaving
 * a quote (a selection, text on the caret's line or after it, or the line the quote opens on).
 */
export function leaveBlockQuote(
  doc: string,
  quotes: readonly Quote[],
  from: number,
  to = from,
): EditResult | null {
  if (from !== to) return null
  const quote = quotes
    .filter((q) => q.block && q.openTo <= from && from <= q.closeFrom)
    .reduce<Quote | null>((inner, q) => (inner && inner.from > q.from ? inner : q), null)
  if (!quote) return null
  const lineStart = doc.lastIndexOf('\n', from - 1) + 1
  if (lineStart <= quote.openTo) return null
  if (doc.slice(lineStart, from).trim() !== '' || doc.slice(from, quote.closeFrom).trim() !== '')
    return null
  if (doc.slice(quote.openTo, lineStart).trim() === '')
    return {
      changes: [{ from: quote.from, to: quote.end, insert: '' }],
      anchor: quote.from,
      head: quote.from,
    }
  const cut = { from: lineStart - 1, to: quote.closeFrom, insert: '' }
  const caret = quote.end - (cut.to - cut.from) + 1
  return {
    changes: [cut, { from: quote.end, to: quote.end, insert: '\n' }],
    anchor: caret,
    head: caret,
  }
}

/**
 * Inline quote command. With the caret in an inline quote it takes the quote off. A selection of one paragraph
 * is wrapped (spaces at its ends stay outside), and with only a caret an empty quote is inserted
 * with the caret inside. Does nothing in code, math, raw text, or comments, over a blank line, or
 * where the selection would cut another element in two.
 */
export function toggleInlineQuote(input: EditInput): EditResult {
  const { doc, tree, from, to } = input
  const existing = inlineQuoteAt(scanQuotes(tree, doc), from, to)
  // A selection of part of a quote's text is a quote of its own inside it; a caret, or a selection
  // of all of it, takes the quote off.
  const nested =
    existing !== null && from < to && (from > existing.openTo || to < existing.closeFrom)
  if (existing && !nested) {
    // Positions after the pieces that are cut out move up by their length.
    const openLength = existing.openTo - existing.from
    const closeLength = existing.to - existing.closeFrom
    const moved = (pos: number): number =>
      pos -
      Math.min(Math.max(pos - existing.from, 0), openLength) -
      Math.min(Math.max(pos - existing.closeFrom, 0), closeLength)
    return { changes: unwrapInline(existing), anchor: moved(from), head: moved(to) }
  }
  if (insideOpaque(tree, from) || insideOpaque(tree, to)) return none(input)
  if (from === to) {
    const insert = '#quote[]'
    return {
      changes: [{ from, to, insert }],
      anchor: from + insert.length - 1,
      head: from + insert.length - 1,
    }
  }
  const selected = doc.slice(from, to)
  if (BLANK_LINE.test(selected) || selected.trim() === '') return none(input)
  const start = from + (selected.length - selected.trimStart().length)
  const end = to - (selected.length - selected.trimEnd().length)
  const open = '#quote['
  const out = `${doc.slice(0, start)}${open}${doc.slice(start, end)}]${doc.slice(end)}`
  // The text between may hold brackets of its own: only wrap if the result still reads as one quote.
  const made = scanQuotes(parseTypst(out), out).find(
    (q) => q.from === start && q.to === end + open.length + 1,
  )
  if (!made) return none(input)
  return {
    changes: [
      { from: start, to: start, insert: open },
      { from: end, to: end, insert: ']' },
    ],
    anchor: end + open.length + 1,
    head: end + open.length + 1,
  }
}

/**
 * The run of citations right behind `pos` (only spaces between them): where it starts and ends,
 * check comments included. Null when the text there is not a citation.
 */
function citationRunAfter(
  doc: string,
  citations: readonly Pick<Citation, 'from' | 'end'>[],
  pos: number,
): { from: number; to: number } | null {
  let at = pos
  while (doc[at] === ' ' || doc[at] === '\t') at += 1
  const from = at
  let to: number | null = null
  for (;;) {
    const found = citations.find((c) => c.from === at)
    if (!found) break
    to = found.end
    at = found.end
    while (doc[at] === ' ' || doc[at] === '\t') at += 1
  }
  return to === null ? null : { from, to }
}

/**
 * Sets, changes, or removes the source of a block quote (its `attribution`): `source` is what goes
 * between the brackets, ordinary markup such as `@kant1781[S. 12]` or `Goethe, _Faust_`. Null for
 * an empty source removes it. Null back where it does not apply: an inline quote, or brackets in the
 * source that do not match.
 */
export function setAttribution(doc: string, quote: Quote, source: string | null): TextEdit | null {
  if (!quote.block || !quote.args) return null
  if (source !== null && !balanced(source)) return null
  const value = source === null || source.trim() === '' ? null : `[${source}]`
  return setNamed(doc, quote.args.from, quote.args.to - 1, 'attribution', value)
}

/**
 * Adds citations of `keys` to the source of a block quote: at the end of its `attribution`, which is
 * made if the quote has none. `start` is where the first citation begins once the edit is made.
 */
export function addSourceCitations(
  doc: string,
  quote: Quote,
  options: { keys: readonly string[]; form?: string | null },
): { edit: TextEdit; start: number } | null {
  if (!quote.block || quote.epigraph || !quote.args || options.keys.length === 0) return null
  const source = quote.attribution
  if (source) {
    const inner = doc.slice(source.innerFrom, source.innerTo)
    const space = inner !== '' && !/\s$/.test(inner) ? ' ' : ''
    const insert = space + groupSource(options, doc.slice(source.innerTo))
    return {
      edit: { from: source.innerTo, to: source.innerTo, insert },
      start: source.innerTo + space.length,
    }
  }
  const text = groupSource(options, ']')
  const edit = setNamed(doc, quote.args.from, quote.args.to - 1, 'attribution', `[${text}]`)
  if (!edit) return null
  return { edit, start: edit.from + edit.insert.indexOf(`[${text}]`) + 1 }
}

/** Makes a block quote an epigraph (the label `<epigraph>` behind it), or takes the label off again. */
export function toggleEpigraph(quote: Quote): TextEdit | null {
  if (!quote.block) return null
  return quote.epigraph
    ? { from: quote.to, to: quote.end, insert: '' }
    : { from: quote.to, to: quote.to, insert: ' <epigraph>' }
}

/**
 * Makes an inline quote a block quote of its own: the paragraph is split before and after it. The
 * citation right behind the quote is its source: it moves into the quote's attribution, where it is
 * not quoted text. Null where that cannot be done safely (the quote is in a list item or a heading).
 * `caret` is where the caret goes: at the end of the quoted text, in the new text.
 */
export function quoteToBlock(
  doc: string,
  quote: Quote,
  citations: readonly Pick<Citation, 'from' | 'end'>[] = [],
): { edit: TextEdit; caret: number } | null {
  if (quote.block) return null
  const before = doc.slice(0, quote.from)
  const lastBlank = [...before.matchAll(new RegExp(BLANK_LINE, 'g'))].at(-1)
  const paragraphStart = lastBlank ? lastBlank.index + lastBlank[0].length : 0
  const rest = doc.slice(quote.to)
  const nextBlank = BLANK_LINE.exec(rest)
  const paragraphEnd = quote.to + (nextBlank ? nextBlank.index : rest.length)
  if (
    BLOCK_PREFIX.test(
      doc.slice(paragraphStart, doc.indexOf('\n', paragraphStart) + 1 || doc.length),
    )
  )
    return null

  const run = citationRunAfter(doc, citations, quote.to)
  const source = run && run.to <= paragraphEnd ? run : null
  const head = before.slice(paragraphStart)
  // A full stop right behind the source belonged to the sentence the quote was in.
  const tailFrom = source ? source.to + (doc[source.to] === '.' ? 1 : 0) : quote.to
  const tail = doc.slice(tailFrom, paragraphEnd)
  const from = quote.from - (head.length - head.trimEnd().length)
  const to = tailFrom + (tail.length - tail.trimStart().length)
  const text = doc.slice(quote.openTo, quote.closeFrom).trim()
  const open = quote.args
    ? `${doc.slice(quote.from, quote.args.from + 1)}block: true, ${doc.slice(quote.args.from + 1, quote.openTo)}`
    : '#quote(block: true)['
  let block = `${open}${text}]`
  if (source) {
    const made = scanQuotes(parseTypst(block), block)[0]
    const edit = made ? setAttribution(block, made, doc.slice(source.from, source.to)) : null
    if (edit) block = block.slice(0, edit.from) + edit.insert + block.slice(edit.to)
  }
  const lead = head.trim() === '' ? '' : '\n\n'
  const insert = `${lead}${block}${tail.trim() === '' ? '' : '\n\n'}`
  return { edit: { from, to, insert }, caret: from + lead.length + block.length - 1 }
}

/**
 * Makes a block quote of one paragraph an inline quote: its source (the citations of its
 * attribution) moves behind the closing mark, where a citation goes in the text. Null for several
 * paragraphs, for an epigraph (it is not part of the text: make it a block quote first), and for an
 * attribution that has anything but citations in it, which would be lost.
 */
export function quoteToInline(
  doc: string,
  quote: Quote,
  citations: readonly Pick<Citation, 'from' | 'end'>[] = [],
): TextEdit[] | null {
  if (!quote.block || !quote.args || quote.epigraph) return null
  if (BLANK_LINE.test(doc.slice(quote.openTo, quote.closeFrom))) return null
  let moved: string | null = null
  if (quote.attribution) {
    const { innerFrom, innerTo } = quote.attribution
    const own = citations.filter((c) => c.from >= innerFrom && c.end <= innerTo)
    let others = doc.slice(innerFrom, innerTo)
    for (const c of [...own].sort((a, b) => b.from - a.from))
      others = others.slice(0, c.from - innerFrom) + others.slice(c.end - innerFrom)
    if (others.trim() !== '') return null
    if (own.length > 0) {
      const sorted = [...own].sort((a, b) => a.from - b.from)
      moved = doc.slice(sorted[0]!.from, sorted.at(-1)!.end)
    }
  }
  const text = doc.slice(quote.args.from, quote.args.to)
  let args = text
  for (const name of ['attribution', 'block']) {
    const edit = setNamed(args, 0, args.length - 1, name, null)
    if (edit) args = args.slice(0, edit.from) + edit.insert + args.slice(edit.to)
  }
  if (!/block\s*:/.test(text)) return null
  const edits: TextEdit[] = [
    {
      from: quote.args.from,
      to: quote.args.to,
      insert: parseArgs(args, 0, args.length - 1).length === 0 ? '' : args,
    },
  ]
  if (moved) edits.push({ from: quote.to, to: quote.to, insert: ` ${moved}` })
  return edits
}

// --- quotation marks typed by hand ----------------------------------------------------------------

/**
 * The marks that close a quote when typed, and the marks that may open it: `"` closes a quote opened
 * by `"`, `„`, or `“`; `“` closes `„` (German); `”` closes `“` or `„` (English, or German with the
 * other mark); `«` closes `»` (German, reversed) and `»` closes `«` (French).
 */
const OPENERS: Record<string, readonly string[]> = {
  '"': ['"', '„', '“'],
  '“': ['„'],
  '”': ['“', '„'],
  '«': ['»'],
  '»': ['«'],
}
const ALL_MARKS = new Set(['"', '„', '“', '”', '«', '»'])
/** What may stand right before an opening mark: nothing, a space, or an opening bracket or dash. */
const BEFORE_OPENER = /^[\s([{–—/-]?$/

/**
 * The input rule for quotation marks: the file holds no quotation marks of its own, so
 * the quote the writer types by hand becomes a real quote. Typing the closing mark of a pair, such
 * as the second `"` of `"Text"` or the `“` of `„Text“`, replaces the opening mark and the text by
 * `#quote[Text]`, and the editor draws it as a quote. `typed` is the character about to be inserted
 * at `pos`; the change replaces the text up to `pos`, and the caret goes behind it.
 *
 * It only applies to a clear pair on one line: a closing mark right after a word, an opening mark
 * after a space (or at the start) with a word right behind it, and no other mark between them, so an
 * inch sign (`5"`) or a single stray mark is left alone. Nothing happens in code, math, raw text, or
 * comments, or where the text between has brackets that do not match.
 */
export function quoteInputRule(
  doc: string,
  pos: number,
  typed: string,
  tree?: Tree,
): TextEdit | null {
  const openers = OPENERS[typed]
  if (!openers) return null
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1
  const line = doc.slice(lineStart, pos)
  // A closing mark follows the last word of the quote, not a space.
  if (line === '' || /[\s([{]$/.test(line)) return null
  // The nearest mark before it must be the opening one: any other mark makes the pair unclear.
  let at = -1
  for (let i = line.length - 1; i >= 0; i -= 1)
    if (ALL_MARKS.has(line[i]!)) {
      at = i
      break
    }
  if (at < 0 || !openers.includes(line[at]!)) return null
  const before = line[at - 1] ?? ''
  const text = line.slice(at + 1)
  if (!BEFORE_OPENER.test(before) || text === '' || /^\s/.test(text)) return null
  if (!balanced(text)) return null
  const from = lineStart + at
  if (tree && (insideOpaque(tree, from) || insideOpaque(tree, pos))) return null
  const insert = `#quote[${text}]`
  // The text between may hold markup of its own: only convert if the result reads as one quote.
  const out = `${doc.slice(0, from)}${insert}${doc.slice(pos)}`
  const made = scanQuotes(parseTypst(out), out).find((q) => q.from === from && !q.block)
  if (!made || made.to !== from + insert.length) return null
  return { from, to: pos, insert }
}
