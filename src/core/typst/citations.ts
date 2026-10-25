import type { Tree } from '@lezer/common'
import { balanced, parseArgs, stringValue, typstString } from './args'
import { parseTypst } from './parser'
import type { EditInput, EditResult } from './edit'
import { insideOpaque } from './edit'
import type { TextEdit } from './figures'

/**
 * Citations, in the two forms that are understood:
 *
 *   `@smith2020`  `@smith2020[S. 14]`                                    the short form
 *   `#cite(<smith2020>, supplement: [S. 14], form: "prose")`           the long form
 *
 * Keys that start with a reserved prefix (`fig-`, `tbl-`, `eq-`, `sec-`) are cross-references, not
 * citations. Arguments of `#cite` that the editor has no field for are kept when it is edited.
 *
 * Two markers for the writer are Typst block comments, so the file stays valid Typst and the export
 * never shows them. The `#` right after the comment's opening makes them hard to type by accident:
 *
 *   a block comment `#check: Seitenzahl prüfen` right after a citation (no space between)
 *       marks the citation to check later; the note is optional
 *   a block comment `#cite-needed` marks a place that still needs a citation
 *
 * Typst groups citations that are only separated by white space (a space or one line break), so
 * several works are cited by writing the citations next to each other: `@smith2020 @jones2019`. Any
 * mix of the short and the long form is one group. A group has one form: with different forms in it
 * Typst prints something broken ("Jones, 2019; Smith (2020)"), so the editor keeps them equal.
 *
 * `form: none` prints nothing in the text, but the work still appears in the bibliography.
 */

export interface Citation {
  kind: 'short' | 'long'
  /** The extent of the whole citation. */
  from: number
  to: number
  key: string
  /** The page reference, without the brackets. */
  supplement: string | null
  /** The `form:` as written, `'none'` for `form: none`, or null for the normal form. */
  form: string | null
  /** End including a check comment right after the citation (equal to `to` without one). */
  end: number
  /** The check comment, if the citation is marked for checking. */
  check: { from: number; to: number; note: string | null } | null
  /** Arguments of `#cite` this editor does not know, as written. */
  extra: string[]
  /**
   * Set for a citation in the attribution of a block quote (its source): where that quote starts.
   * The citation is written like any other, inside the brackets of the argument.
   */
  attributionOf?: number
}

const RESERVED = /^(?:fig|tbl|eq|sec)-/
const KEY = /^[\p{L}\p{N}_-][\p{L}\p{N}_:.-]*$/u
const LABEL_ARG = /^<([\p{L}\p{N}_:.-]+)>$/u
const SKIP = new Set([
  'Args',
  'CodeBlock',
  'CodeLine',
  'Raw',
  'BlockComment',
  'LineComment',
  'Math',
])

/** True if a library key can be written as a Typst reference (some BibTeX keys cannot). */
/** The note after the check tag, null when there is none, undefined when it is not a check mark. */
function checkNote(body: string): string | null | undefined {
  const match = /^#\s*check(?::\s*([^]*))?$/.exec(body.trim())
  if (!match) return undefined
  return match[1]?.trim() || null
}

/** The check comment at `from` (spaces and tabs may come before it), if the text there is one. */
function checkAfter(
  tree: Tree,
  doc: string,
  from: number,
): { from: number; to: number; note: string | null } | null {
  let at = from
  while (doc[at] === ' ' || doc[at] === '\t') at += 1
  const node = tree.resolveInner(at, 1)
  if (node.name !== 'BlockComment' || node.from !== at) return null
  const note = checkNote(doc.slice(node.from + 2, node.to - 2))
  return note === undefined ? null : { from: at, to: node.to, note }
}

export const isCitableKey = (key: string): boolean => KEY.test(key) && !RESERVED.test(key)

/** The text between the brackets of a supplement. */
const insideBrackets = (doc: string, from: number, to: number): string =>
  doc.slice(from + 1, to - 1)

export function scanCitations(tree: Tree, doc: string): Citation[] {
  const out: Citation[] = []
  tree.iterate({
    enter: (ref) => {
      if (SKIP.has(ref.name)) return false
      if (ref.name === 'Ref') {
        const supplement = ref.node.getChild('Supplement')
        const key = doc.slice(ref.from + 1, supplement ? supplement.from : ref.to)
        if (RESERVED.test(key)) return false
        const check = checkAfter(tree, doc, ref.to)
        out.push({
          kind: 'short',
          from: ref.from,
          to: ref.to,
          end: check ? check.to : ref.to,
          check,
          key,
          supplement: supplement ? insideBrackets(doc, supplement.from, supplement.to) : null,
          form: null,
          extra: [],
        })
        return false
      }
      if (ref.name !== 'Expression') return undefined
      const node = ref.node
      const name = node.getChild('FuncName')
      const fn = name ? doc.slice(name.from, name.to) : ''
      if (fn === 'footnote') return false // citations in a note are shown in its own editor
      const args = node.getChild('Args')
      if (fn === 'quote' && args) {
        // The source of a block quote: ordinary markup in the brackets of `attribution: […]`, which
        // the parser keeps opaque. Its citations are found on their own, and are the quote's.
        const found = parseArgs(doc, args.from, args.to - 1).find((a) => a.name === 'attribution')
        if (found && doc[found.valueFrom] === '[' && doc[found.valueTo - 1] === ']') {
          const inner = doc.slice(found.valueFrom + 1, found.valueTo - 1)
          const base = found.valueFrom + 1
          for (const c of scanCitations(parseTypst(inner), inner))
            out.push({
              ...c,
              from: c.from + base,
              to: c.to + base,
              end: c.end + base,
              check: c.check && { ...c.check, from: c.check.from + base, to: c.check.to + base },
              attributionOf: node.from,
            })
        }
        return undefined
      }
      if (fn !== 'cite' || !args) return undefined
      const list = parseArgs(doc, args.from, args.to - 1)
      const first = list.find((a) => a.name === null)
      const label = first ? LABEL_ARG.exec(doc.slice(first.valueFrom, first.valueTo)) : null
      if (!label) return undefined
      let supplement: string | null = null
      let form: string | null = null
      const extra: string[] = []
      for (const arg of list) {
        if (arg === first) continue
        if (arg.name === 'supplement' && doc[arg.valueFrom] === '[' && doc[arg.valueTo - 1] === ']')
          supplement = insideBrackets(doc, arg.valueFrom, arg.valueTo)
        else if (arg.name === 'form') {
          const text = stringValue(doc, arg.valueFrom, arg.valueTo)
          if (doc.slice(arg.valueFrom, arg.valueTo) === 'none') form = 'none'
          else if (text === null) extra.push(doc.slice(arg.from, arg.to))
          else form = text === 'normal' ? null : text
        } else extra.push(doc.slice(arg.from, arg.to))
      }
      const check = checkAfter(tree, doc, node.to)
      out.push({
        kind: 'long',
        from: node.from,
        to: node.to,
        end: check ? check.to : node.to,
        check,
        key: label[1]!,
        supplement,
        form,
        extra,
      })
      return false
    },
  })
  return out
}

/** Everything a sheet cites, for the list of works: where each work is cited, and the markers. */
export interface CitationOverview {
  /** Every citation, in the order of the text, with where it starts. */
  works: [key: string, at: number][]
  /** Where a place that still needs a citation is marked. */
  missing: number[]
  /** Where a citation is marked for checking later. */
  checks: number[]
  /** Every citation with where it starts and ends (the whole `@key[…]` or `#cite(…)`). */
  spans: [key: string, from: number, to: number][]
}

const OVERVIEW_SKIP = new Set(['Raw', 'Math', 'CodeBlock', 'CodeLine', 'LineComment'])

/**
 * All citations of a text, and the two kinds of marker. Unlike `scanCitations`, which finds what the
 * editor draws as chips, this counts every citation: also those in footnotes, and those in the
 * content of arguments (a figure's caption, a table cell), which the parser keeps opaque.
 */
export function citationOverview(doc: string, tree: Tree = parseTypst(doc)): CitationOverview {
  const out: CitationOverview = { works: [], missing: [], checks: [], spans: [] }
  walkOverview(tree, doc, 0, out, 0)
  return out
}

function walkOverview(
  tree: Tree,
  doc: string,
  base: number,
  out: CitationOverview,
  depth: number,
): void {
  tree.iterate({
    enter: (ref) => {
      if (OVERVIEW_SKIP.has(ref.name)) return false
      if (ref.name === 'BlockComment') {
        const body = doc.slice(ref.from + 2, ref.to - 2)
        if (/^#\s*cite-needed$/.test(body.trim())) out.missing.push(base + ref.from)
        else if (checkNote(body) !== undefined) out.checks.push(base + ref.from)
        return false
      }
      if (ref.name === 'Ref') {
        const supplement = ref.node.getChild('Supplement')
        const key = doc.slice(ref.from + 1, supplement ? supplement.from : ref.to)
        if (!RESERVED.test(key)) {
          out.works.push([key, base + ref.from])
          out.spans.push([key, base + ref.from, base + ref.to])
        }
        return false
      }
      if (ref.name !== 'Expression') return undefined
      const name = ref.node.getChild('FuncName')
      const fn = name ? doc.slice(name.from, name.to) : ''
      const args = ref.node.getChild('Args')
      if (fn === 'cite' && args) {
        const list = parseArgs(doc, args.from, args.to - 1)
        const first = list.find((a) => a.name === null)
        const label = first ? LABEL_ARG.exec(doc.slice(first.valueFrom, first.valueTo)) : null
        if (label) {
          out.works.push([label[1]!, base + ref.from])
          out.spans.push([label[1]!, base + ref.from, base + ref.to])
        }
        return false
      }
      // The content of arguments (`caption: [Siehe @a]`, table cells) is parsed on its own.
      if (args && depth < 4) {
        for (const arg of parseArgs(doc, args.from, args.to - 1)) {
          if (doc[arg.valueFrom] !== '[' || doc[arg.valueTo - 1] !== ']') continue
          const inner = doc.slice(arg.valueFrom + 1, arg.valueTo - 1)
          if (inner.includes('@') || inner.includes('cite') || inner.includes('/*'))
            walkOverview(parseTypst(inner), inner, base + arg.valueFrom + 1, out, depth + 1)
        }
      }
      return undefined
    },
  })
}

/** A place that still needs a citation: a block comment that says `#cite-needed`. */
export interface MissingCitation {
  from: number
  to: number
}

export function scanMissingCitations(tree: Tree, doc: string): MissingCitation[] {
  const out: MissingCitation[] = []
  tree.iterate({
    enter: (ref) => {
      if (ref.name === 'Expression') {
        const name = ref.node.getChild('FuncName')
        return name && doc.slice(name.from, name.to) === 'footnote' ? false : undefined
      }
      if (ref.name !== 'BlockComment') return undefined
      if (/^#\s*cite-needed$/.test(doc.slice(ref.from + 2, ref.to - 2).trim()))
        out.push({ from: ref.from, to: ref.to })
      return false
    },
  })
  return out
}

export function missingAt(
  markers: readonly MissingCitation[],
  from: number,
  to = from,
): MissingCitation | null {
  return markers.find((m) => m.from <= from && m.to >= to) ?? null
}

/** The citation whose extent (check comment included) contains the range. */
export function citationAt(
  citations: readonly Citation[],
  from: number,
  to = from,
): Citation | null {
  return citations.find((c) => c.from <= from && c.end >= to) ?? null
}

// --- writing --------------------------------------------------------------------------------------

/** True if the short form would be read as written: nothing after it joins the key or the brackets. */
function shortFormHolds(doc: string, to: number, hasSupplement: boolean): boolean {
  const next = doc[to]
  if (next === undefined) return true
  if (/[\p{L}\p{N}_-]/u.test(next)) return false
  if ((next === ':' || next === '.') && /[\p{L}\p{N}_-]/u.test(doc[to + 1] ?? '')) return false
  return hasSupplement || next !== '['
}

/** The source of a citation: the short form when it says everything, otherwise `#cite(…)`. */
export function citationSource(options: {
  key: string
  supplement?: string | null
  form?: string | null
  extra?: readonly string[]
  /** The text right after, so a short form is not made to join it. */
  following?: string
}): string {
  const supplement = options.supplement?.trim() || null
  const form = options.form && options.form !== 'normal' ? options.form : null
  const formArg = form === 'none' ? 'form: none' : form ? `form: ${typstString(form)}` : null
  const extra = options.extra ?? []
  const short = form === null && extra.length === 0 && isCitableKey(options.key)
  if (short && shortFormHolds(options.following ?? '', 0, supplement !== null))
    return `@${options.key}${supplement ? `[${supplement}]` : ''}`
  const args = [
    `<${options.key}>`,
    ...(supplement ? [`supplement: [${supplement}]`] : []),
    ...(formArg ? [formArg] : []),
    ...extra,
  ]
  return `#cite(${args.join(', ')})`
}

export interface CitationPatch {
  key?: string
  supplement?: string | null
  form?: string | null
}

/**
 * One edit that changes a citation's key, page reference, or form. Null when nothing changes, or
 * when the page reference has unbalanced brackets.
 */
export function updateCitation(
  doc: string,
  citation: Citation,
  patch: CitationPatch,
): TextEdit | null {
  const supplement = 'supplement' in patch ? patch.supplement?.trim() || null : citation.supplement
  if (supplement !== null && !balanced(supplement)) return null
  const insert = citationSource({
    key: patch.key ?? citation.key,
    supplement,
    form: 'form' in patch ? patch.form : citation.form,
    extra: citation.extra,
    following: doc.slice(citation.to),
  })
  if (insert === doc.slice(citation.from, citation.to)) return null
  return { from: citation.from, to: citation.to, insert }
}

/** Removes a citation with its check comment. */
export function removeCitation(citation: Citation): TextEdit {
  return { from: citation.from, to: citation.end, insert: '' }
}

/** What may stand between two citations of one group: a space, or one line break. */
const GROUP_GAP = /^[ \t]*(?:\r?\n[ \t]*)?$/

/** The groups of citations in the order of the text: runs of citations that Typst prints together. */
/** `doc` is the text, or a function that reads a part of it (so a large text is not copied). */
export function citationGroups(
  citations: readonly Citation[],
  doc: string | ((from: number, to: number) => string),
): Citation[][] {
  const text = typeof doc === 'string' ? (from: number, to: number) => doc.slice(from, to) : doc
  const groups: Citation[][] = []
  for (const citation of citations) {
    const last = groups.at(-1)
    const previous = last?.at(-1)
    if (last && previous && GROUP_GAP.test(text(previous.end, citation.from))) last.push(citation)
    else groups.push([citation])
  }
  return groups
}

/** The group a citation belongs to (possibly just itself). */
export function groupOf(
  citations: readonly Citation[],
  doc: string | ((from: number, to: number) => string),
  citation: Citation,
): Citation[] {
  return (
    citationGroups(citations, doc).find((group) => group.some((c) => c.from === citation.from)) ?? [
      citation,
    ]
  )
}

/**
 * The form a group should have. The members that are written in the normal form are the ones that
 * join an existing group (a citation typed next to others is a normal one), so the form is the
 * special form the others share. If there are two different special forms, the first one wins.
 */
export function groupForm(group: readonly Citation[]): string | null {
  return group.find((citation) => citation.form !== null)?.form ?? null
}

/** Edits that give every citation of the group `form` (by default the group's own form). */
export function unifyGroup(
  doc: string,
  group: readonly Citation[],
  form: string | null = groupForm(group),
): TextEdit[] {
  const edits: TextEdit[] = []
  for (const citation of group) {
    if (citation.form === form) continue
    const edit = updateCitation(doc, citation, { form })
    if (edit) edits.push(edit)
  }
  return edits
}

/**
 * Removes one work of a group, with the white space that joined it to its neighbour (the one after
 * it, or for the last work the one before it), and its check mark. A group of one is just removed.
 */
export function removeFromGroup(doc: string, group: readonly Citation[], index: number): TextEdit {
  const member = group[index]!
  const next = group[index + 1]
  const previous = group[index - 1]
  if (next) return { from: member.from, to: next.from, insert: '' }
  if (previous) return { from: previous.end, to: member.end, insert: '' }
  return removeCitation(member)
}

/** A marker's note in one line, with nothing in it that would end the comment. */
const cleanNote = (note: string | null | undefined): string | null => {
  const text = (note ?? '')
    .replace(/\s+/g, ' ')
    .replaceAll('*/', '* /')
    .replaceAll('/*', '/ *')
    .trim()
  return text === '' ? null : text
}

/** The check comment for a citation, with or without a note. */
export const checkSource = (note?: string | null): string => {
  const text = cleanNote(note)
  return `/*#check${text ? `: ${text}` : ''}*/`
}

/**
 * Marks a citation for checking later, changes the note, or takes the mark off (`false`). The
 * comment sits right after the citation, with no space, so the export gets no stray space.
 */
export function setCheck(
  doc: string,
  citation: Citation,
  mark: { note?: string | null } | false,
): TextEdit | null {
  if (mark === false)
    return citation.check ? { from: citation.to, to: citation.check.to, insert: '' } : null
  const insert = checkSource(mark.note)
  if (citation.check) {
    const current = doc.slice(citation.check.from, citation.check.to)
    return current === insert ? null : { from: citation.check.from, to: citation.check.to, insert }
  }
  return { from: citation.to, to: citation.to, insert }
}

export const missingSource = (): string => '/*#cite-needed*/'

export function removeMissing(marker: MissingCitation): TextEdit {
  return { from: marker.from, to: marker.to, insert: '' }
}

/** The sources of several citations side by side, which Typst prints as one group. */
export function groupSource(
  options: { keys: readonly string[]; check?: boolean; form?: string | null },
  following: string,
): string {
  const mark = options.check ? checkSource() : ''
  return options.keys
    .map(
      (key, index) =>
        citationSource({
          key,
          form: options.form,
          following: index === options.keys.length - 1 ? following : ' ',
        }) + mark,
    )
    .join(' ')
}

/** Puts citations in the place of a missing-citation marker. */
export function resolveMissing(
  doc: string,
  marker: MissingCitation,
  options: { keys: readonly string[]; check?: boolean; form?: string | null },
): TextEdit {
  const before = doc[marker.from - 1]
  const space = before !== undefined && !/[\s([{"„“‚‘-]/.test(before) ? ' ' : ''
  return {
    from: marker.from,
    to: marker.to,
    insert: space + groupSource(options, doc.slice(marker.to)),
  }
}

/**
 * Adds more works to a citation: citations next to it, with a space between, which Typst prints
 * as one group. They go behind the citation (and its check mark) and take its form, so the group
 * stays uniform.
 */
export function addToCitation(
  doc: string,
  citation: Citation,
  options: { keys: readonly string[]; check?: boolean },
): TextEdit {
  const source = groupSource({ ...options, form: citation.form }, doc.slice(citation.end))
  return { from: citation.end, to: citation.end, insert: ` ${source}` }
}

/**
 * Inserts a missing-citation marker at the end of the selection. There is no space in front of it:
 * the marker is a comment, and a space would stay in the PDF.
 */
export function insertMissing(input: EditInput): EditResult {
  const { to } = input
  if (insideOpaque(input.tree, to)) return { changes: [], anchor: input.from, head: input.to }
  const insert = missingSource()
  return {
    changes: [{ from: to, to, insert }],
    anchor: to + insert.length,
    head: to + insert.length,
  }
}

/**
 * Inserts a citation of `key` at the end of the selection, with a space before it unless it follows
 * a space or an opening bracket (`Wort@key` is not a citation). The caret ends up after it. Does nothing
 * in code, math, raw text, or comments.
 */
export function insertCitation(
  input: EditInput,
  options: { key: string; supplement?: string | null; form?: string | null; check?: boolean },
): EditResult {
  const { doc, to } = input
  if (insideOpaque(input.tree, to) || !isCitableKey(options.key))
    return { changes: [], anchor: input.from, head: input.to }
  const source = citationSource({ ...options, following: doc.slice(to) })
  const before = doc[to - 1]
  const space = before !== undefined && !/[\s([{"„“‚‘-]/.test(before) ? ' ' : ''
  const insert = space + source + (options.check ? checkSource() : '')
  return {
    changes: [{ from: to, to, insert }],
    anchor: to + insert.length,
    head: to + insert.length,
  }
}

/**
 * Inserts citations of several works next to each other, with a space between, which Typst prints
 * as one group: "(Doe, 2018; Jones, 2019)". Keys that cannot be references are left out.
 */
export function insertCitations(
  input: EditInput,
  options: { keys: readonly string[]; check?: boolean; form?: string | null },
): EditResult {
  const { doc, to } = input
  const keys = options.keys.filter(isCitableKey)
  if (insideOpaque(input.tree, to) || keys.length === 0)
    return { changes: [], anchor: input.from, head: input.to }
  const before = doc[to - 1]
  const space = before !== undefined && !/[\s([{"„“‚‘-]/.test(before) ? ' ' : ''
  const insert = space + groupSource({ ...options, keys }, doc.slice(to))
  return {
    changes: [{ from: to, to, insert }],
    anchor: to + insert.length,
    head: to + insert.length,
  }
}
