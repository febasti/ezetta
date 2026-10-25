import type { SyntaxNode, Tree } from '@lezer/common'
import { balanced, typstString } from './args'
import { figureSource, newFigureId } from './figures'
import { newId } from './ids'
import { formulaSource } from './math'
import { newTable, tableSource } from './tables'
import { findFootnotes, footnoteAt } from './footnotes'

/**
 * Editing commands for the supported elements. Pure functions: they take the text,
 * its syntax tree, and the selection, and return text changes plus the selection afterwards. The
 * editor applies them as one normal transaction, so undo and redo work. They write exactly the
 * syntax the parser reads and use the parser's nodes to find what is already there.
 */

export interface EditInput {
  doc: string
  tree: Tree
  from: number
  to: number
}

/** A change in coordinates of the original text. Changes in a result never overlap. */
export interface TextChange {
  from: number
  to: number
  insert: string
}

export interface EditResult {
  changes: TextChange[]
  /** The selection after the changes, in coordinates of the new text. */
  anchor: number
  head: number
}

export type InlineKind =
  'emphasis' | 'strong' | 'highlight' | 'subscript' | 'superscript' | 'smallcaps'

export type ParagraphStyle =
  | { kind: 'text' }
  | { kind: 'heading'; level: number }
  | { kind: 'bullet' }
  | { kind: 'numbered' }
  | { kind: 'quote' }
  | { kind: 'epigraph' }

/** The deepest heading level the editor offers. */
export const MAX_HEADING_LEVEL = 4

/**
 * What the heading button sets next: heading 1, 2, 3, 4, and then a plain paragraph again. A list
 * item or a quote starts at heading 1.
 */
export function nextHeadingStyle(current: ParagraphStyle): ParagraphStyle {
  if (current.kind !== 'heading') return { kind: 'heading', level: 1 }
  return current.level >= MAX_HEADING_LEVEL
    ? { kind: 'text' }
    : { kind: 'heading', level: Math.max(1, current.level) + 1 }
}

export const QUOTE_OPEN = '#quote(block: true)['

const WORD = /[\p{L}\p{N}]/u
const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c)
const isBlank = (c: string | undefined): boolean => c !== undefined && /\s/.test(c)

/** Where `pos` ends up after `changes` (sorted, non-overlapping). `assoc` decides at insertions. */
export function mapThrough(changes: readonly TextChange[], pos: number, assoc: 1 | -1 = 1): number {
  let shift = 0
  for (const change of changes) {
    const delta = change.insert.length - (change.to - change.from)
    if (pos < change.from) break
    if (pos === change.from && change.to === change.from) {
      if (assoc < 0) break // stay in front of an insertion exactly here
      shift += delta
      continue
    }
    if (pos >= change.to) {
      shift += delta
      continue
    }
    // Inside a replaced range: snap to its start or end.
    return change.from + shift + (assoc > 0 ? change.insert.length : 0)
  }
  return pos + shift
}

function result(
  changes: TextChange[],
  from: number,
  to: number,
  fromAssoc: 1 | -1 = 1,
  toAssoc: 1 | -1 = -1,
  caretAssoc: 1 | -1 = 1,
): EditResult {
  const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to)
  if (from === to) {
    const pos = mapThrough(sorted, from, caretAssoc)
    return { changes: sorted, anchor: pos, head: pos }
  }
  return {
    changes: sorted,
    anchor: mapThrough(sorted, from, fromAssoc),
    head: mapThrough(sorted, to, toAssoc),
  }
}

const noChange = (input: EditInput): EditResult => ({
  changes: [],
  anchor: input.from,
  head: input.to,
})

// --- finding things ----------------------------------------------------------------------------------

/** Nodes around a position, also those that end exactly there (a caret at the end of a line). */
function ancestorsEitherSide(tree: Tree, pos: number): SyntaxNode[] {
  return [...ancestors(tree, pos, 1), ...ancestors(tree, pos, -1)]
}

function ancestors(tree: Tree, pos: number, side: 1 | -1 = 1): SyntaxNode[] {
  const out: SyntaxNode[] = []
  for (let node: SyntaxNode | null = tree.resolve(pos, side); node; node = node.parent)
    out.push(node)
  return out
}

/** The innermost node with one of `names` that contains the whole range. */
function enclosing(input: EditInput, names: readonly string[]): SyntaxNode | null {
  for (const node of ancestors(input.tree, input.from, 1)) {
    if (names.includes(node.name) && node.from <= input.from && node.to >= input.to) return node
  }
  return null
}

function funcName(doc: string, expression: SyntaxNode): string {
  const name = expression.getChild('FuncName')
  return name ? doc.slice(name.from, name.to) : ''
}

function enclosingFunction(input: EditInput, names: readonly string[]): SyntaxNode | null {
  for (const node of ancestors(input.tree, input.from, 1)) {
    if (
      node.name === 'Expression' &&
      node.from <= input.from &&
      node.to >= input.to &&
      names.includes(funcName(input.doc, node))
    ) {
      return node
    }
  }
  return null
}

const isBlockQuote = (doc: string, expression: SyntaxNode): boolean => {
  if (funcName(doc, expression) !== 'quote') return false
  const args = expression.getChild('Args')
  return (
    args !== null &&
    /block\s*:\s*true/.test(doc.slice(args.from, args.to)) &&
    expression.getChild('Content') !== null
  )
}

function enclosingQuote(input: EditInput): SyntaxNode | null {
  for (const node of ancestors(input.tree, input.from, 1)) {
    if (
      node.name === 'Expression' &&
      node.from <= input.from &&
      node.to >= input.to &&
      isBlockQuote(input.doc, node)
    )
      return node
  }
  return null
}

/** The label that makes a block quote an epigraph (motto), right behind its closing bracket. */
const EPIGRAPH_AFTER = /^[ \t]*<epigraph>/

/** The end of the epigraph label behind a block quote that ends at `to`, or null without one. */
function epigraphLabelEnd(doc: string, to: number): number | null {
  const label = EPIGRAPH_AFTER.exec(doc.slice(to, to + 40))
  return label ? to + label[0].length : null
}

function lineStartOf(doc: string, pos: number): number {
  return doc.lastIndexOf('\n', pos - 1) + 1
}

function lineEndOf(doc: string, pos: number): number {
  const nl = doc.indexOf('\n', pos)
  const end = nl < 0 ? doc.length : nl
  return end > pos && doc[end - 1] === '\r' ? end - 1 : end
}

// --- paragraph style -----------------------------------------------------------------------------------

/** The paragraph style at a position, for the status bar and the style menu. */
export function paragraphStyleAt(tree: Tree, doc: string, pos: number): ParagraphStyle {
  const input: EditInput = { doc, tree, from: pos, to: pos }
  const enclosing = enclosingQuote(input)
  if (enclosing)
    return { kind: epigraphLabelEnd(doc, enclosing.to) === null ? 'quote' : 'epigraph' }
  const lineStart = lineStartOf(doc, pos)
  let at = pos
  while (
    at < doc.length &&
    at - lineStart < 200 &&
    (doc[at] === ' ' || doc[at] === '\t') &&
    at < lineEndOf(doc, pos)
  )
    at += 1
  const probe = Math.max(pos, at)
  for (const node of ancestorsEitherSide(tree, probe)) {
    if (node.name === 'Heading') {
      const mark = node.getChild('HeadingMark')
      return { kind: 'heading', level: mark ? mark.to - mark.from : 1 }
    }
    if (node.name === 'ListItem') {
      const mark = node.getChild('ListMark')
      return { kind: mark && doc[mark.from] === '+' ? 'numbered' : 'bullet' }
    }
  }
  return { kind: 'text' }
}

const sameStyle = (a: ParagraphStyle, b: ParagraphStyle): boolean =>
  a.kind === b.kind && (a.kind !== 'heading' || (b.kind === 'heading' && a.level === b.level))

/**
 * Sets the paragraph style of the selected lines. Choosing the style the lines already have turns
 * them back into plain text. A block quote wraps the lines in `#quote(block: true)[…]`.
 */
export function setParagraphStyle(input: EditInput, style: ParagraphStyle): EditResult {
  const { doc } = input
  const first = lineStartOf(doc, input.from)
  let lastPos = input.to
  if (input.to > input.from && input.to === lineStartOf(doc, input.to)) lastPos = input.to - 1
  const lastEnd = lineEndOf(doc, Math.max(lastPos, first))

  const quote = enclosingQuote(input)

  // A block quote and an epigraph are the same element, told apart by the label behind it: choosing
  // the other one of the two changes the label, choosing the same one takes the quote off.
  const labelEnd = quote ? epigraphLabelEnd(doc, quote.to) : null
  if (style.kind === 'quote') {
    if (!quote) return wrapQuote(input, first, lastEnd)
    return labelEnd === null
      ? unwrapQuote(input, quote)
      : result([{ from: quote.to, to: labelEnd, insert: '' }], input.from, input.to)
  }
  if (style.kind === 'epigraph') {
    if (!quote) return wrapQuote(input, first, lastEnd, true)
    return labelEnd === null
      ? result([{ from: quote.to, to: quote.to, insert: ' <epigraph>' }], input.from, input.to)
      : unwrapQuote(input, quote)
  }
  if (style.kind === 'text' && quote) return unwrapQuote(input, quote)

  const lines: { start: number; end: number }[] = []
  for (let start = first; start <= lastEnd;) {
    const end = lineEndOf(doc, start)
    lines.push({ start, end })
    const next = doc.indexOf('\n', end)
    if (next < 0) break
    start = next + 1
  }
  const single = lines.length === 1
  const counted = lines.filter((l) => single || doc.slice(l.start, l.end).trim() !== '')
  const allHave =
    counted.length > 0 && counted.every((l) => sameStyle(styleOfLine(input, l.start), style))
  const target: ParagraphStyle = allHave ? { kind: 'text' } : style

  const changes: TextChange[] = []
  for (const line of lines) {
    const text = doc.slice(line.start, line.end)
    if (!single && text.trim() === '') continue
    const match = /^([ \t]*)(?:(=+)[ \t]+|([-+])[ \t]+|(=+)$)?/.exec(text)!
    const indent = match[1]!
    const prefix =
      target.kind === 'heading'
        ? `${'='.repeat(target.level)} `
        : target.kind === 'bullet'
          ? `${indent}- `
          : target.kind === 'numbered'
            ? `${indent}+ `
            : ''
    const existing = match[0].length
    if (doc.slice(line.start, line.start + existing) !== prefix) {
      changes.push({ from: line.start, to: line.start + existing, insert: prefix })
    }
  }
  return result(changes, input.from, input.to, -1, 1, 1)
}

function styleOfLine(input: EditInput, lineStart: number): ParagraphStyle {
  const style = paragraphStyleAt(input.tree, input.doc, lineStart)
  return style.kind === 'quote' || style.kind === 'epigraph' ? { kind: 'text' } : style
}

function wrapQuote(input: EditInput, first: number, lastEnd: number, epigraph = false): EditResult {
  const changes = [
    { from: first, to: first, insert: QUOTE_OPEN },
    { from: lastEnd, to: lastEnd, insert: epigraph ? '] <epigraph>' : ']' },
  ]
  return result(changes, input.from, input.to, 1, -1, input.from === lastEnd ? -1 : 1)
}

function unwrapQuote(input: EditInput, quote: SyntaxNode): EditResult {
  const content = quote.getChild('Content')!
  const marks = content.getChildren('ContentMark')
  const open = marks[0]!
  const close = marks[marks.length - 1]!
  const { doc } = input
  const openEnd = open.to + (doc[open.to] === '\n' ? 1 : 0)
  const closeStart = close.from - (close.from > openEnd && doc[close.from - 1] === '\n' ? 1 : 0)
  // An epigraph takes its label with it.
  const closeEnd = epigraphLabelEnd(doc, quote.to) ?? close.to
  const changes = [
    { from: quote.from, to: openEnd, insert: '' },
    { from: closeStart, to: closeEnd, insert: '' },
  ]
  return result(changes, input.from, input.to)
}

// --- list editing ---------------------------------------------------------------------------------------

/** One nesting level of a list: Typst nests an item that is indented deeper than its parent's marker. */
const LIST_INDENT = '  '
const LIST_LINE = /^([ \t]*)([-+])([ \t]+)/

interface ListLine {
  start: number
  end: number
  /** The leading whitespace, the marker character, and the offset of the item text in the line. */
  indent: string
  marker: string
  contentOffset: number
}

function listLine(input: EditInput, pos: number): ListLine | null {
  const start = lineStartOf(input.doc, pos)
  const end = lineEndOf(input.doc, pos)
  const match = LIST_LINE.exec(input.doc.slice(start, end))
  if (!match || insideOpaque(input.tree, start + match[1]!.length + 1)) return null
  return {
    start,
    end,
    indent: match[1]!,
    marker: match[2]!,
    contentOffset: match[0].length,
  }
}

const indentWidth = (indent: string): number => indent.replace(/\t/g, '    ').length

/** How much of a leading indent one outdent step removes. */
const outdentLength = (indent: string): number =>
  indent.startsWith('\t') ? 1 : Math.min(LIST_INDENT.length, indent.length)

/**
 * Enter in a list item starts the next item at the same level, and the text after the caret moves
 * into it. Enter in an empty item ends the list, or moves the item out one level when it is nested.
 * Returns null where Enter is not a list matter (no list item, a selection, or a caret in the marker).
 */
export function continueList(input: EditInput): EditResult | null {
  if (input.from !== input.to) return null
  const line = listLine(input, input.from)
  if (!line || input.from < line.start + line.contentOffset) return null
  if (input.from === line.end && line.end === line.start + line.contentOffset) {
    const keep = line.indent.length - outdentLength(line.indent)
    const insert = line.indent.length > 0 ? `${line.indent.slice(0, keep)}${line.marker} ` : ''
    return result([{ from: line.start, to: line.end, insert }], input.from, input.to, 1, -1, 1)
  }
  const insert = `\n${line.indent}${line.marker} `
  return result([{ from: input.from, to: input.from, insert }], input.from, input.to)
}

/**
 * Tab and Shift-Tab on the list items of the selection. An item moves in one level at most below
 * the item above it, so it never floats without a parent. Returns null when no selected line is a
 * list item, and no change when the move is not possible (the key still counts as handled).
 */
export function indentListItems(input: EditInput, direction: 1 | -1): EditResult | null {
  const { doc } = input
  let lastPos = input.to
  if (input.to > input.from && input.to === lineStartOf(doc, input.to)) lastPos = input.to - 1
  const lines: ListLine[] = []
  for (let start = lineStartOf(doc, input.from); start <= lastPos;) {
    const line = listLine(input, start)
    if (line) lines.push(line)
    const next = doc.indexOf('\n', start)
    if (next < 0) break
    start = next + 1
  }
  if (lines.length === 0) return null

  if (direction > 0) {
    const first = lines[0]!
    const parent = previousListLine(input, first)
    if (!parent || indentWidth(first.indent) > indentWidth(parent.indent)) return noChange(input)
    const changes = lines.map((l) => ({ from: l.start, to: l.start, insert: LIST_INDENT }))
    return result(changes, input.from, input.to, 1, -1, 1)
  }
  const changes = lines
    .filter((l) => l.indent.length > 0)
    .map((l) => ({ from: l.start, to: l.start + outdentLength(l.indent), insert: '' }))
  if (changes.length === 0) return noChange(input)
  return result(changes, input.from, input.to, 1, -1, 1)
}

/** The list item above `line` that it could nest under. Blank lines and unrelated text end the search. */
function previousListLine(input: EditInput, line: ListLine): ListLine | null {
  const { doc } = input
  let start = line.start
  while (start > 0) {
    start = lineStartOf(doc, start - 1)
    const text = doc.slice(start, lineEndOf(doc, start))
    if (text.trim() === '') return null
    const above = listLine(input, start)
    if (above) return above
    // A line of text belongs to the item above only when it is indented deeper than this item.
    if (indentWidth(/^[ \t]*/.exec(text)![0]) <= indentWidth(line.indent)) return null
  }
  return null
}

// --- emphasis, strong, highlight, subscript, superscript, small caps ----------------------------------------

/** Kinds with a short form in the markup. The others are only written as a function. */
const DELIMITER: Partial<Record<InlineKind, string>> = {
  emphasis: '_',
  strong: '*',
  highlight: '::',
}
const NODE: Partial<Record<InlineKind, string>> = {
  emphasis: 'Emphasis',
  strong: 'Strong',
  highlight: 'Highlight',
}
const FUNCTION: Partial<Record<InlineKind, string>> = {
  emphasis: 'emph',
  strong: 'strong',
  subscript: 'sub',
  superscript: 'super',
  smallcaps: 'smallcaps',
}

/** Splits [from, to) into the non-blank paragraphs inside it, with surrounding whitespace trimmed. */
function paragraphChunks(doc: string, from: number, to: number): { from: number; to: number }[] {
  const chunks: { from: number; to: number }[] = []
  const text = doc.slice(from, to)
  const blank = /\n[ \t\r]*\n/g
  let start = 0
  const push = (a: number, b: number): void => {
    let s = a
    let e = b
    while (s < e && isBlank(text[s])) s += 1
    while (e > s && isBlank(text[e - 1])) e -= 1
    if (e > s) chunks.push({ from: from + s, to: from + e })
  }
  for (let m = blank.exec(text); m; m = blank.exec(text)) {
    push(start, m.index)
    start = m.index + m[0].length
  }
  push(start, text.length)
  return chunks
}

/**
 * Wraps chunks in the delimiter of `kind`, or in `#emph[…]` where a delimiter inside a word would
 * not work. Kinds without a delimiter (subscript, superscript, small caps) are always a function.
 */
function wrapChunks(
  input: EditInput,
  kind: InlineKind,
  chunks: { from: number; to: number }[],
): TextChange[] {
  const { doc } = input
  const changes: TextChange[] = []
  for (const chunk of chunks) {
    const fn = FUNCTION[kind]
    const delimiter = DELIMITER[kind]
    const intraWord = isWord(doc[chunk.from - 1]) || isWord(doc[chunk.to])
    const [open, close] =
      fn && (intraWord || !delimiter) ? [`#${fn}[`, ']'] : [delimiter!, delimiter!]
    changes.push(
      { from: chunk.from, to: chunk.from, insert: open },
      { from: chunk.to, to: chunk.to, insert: close },
    )
  }
  return changes
}

function findInline(input: EditInput, kind: InlineKind): SyntaxNode | null {
  const nodeName = NODE[kind]
  const node = nodeName ? enclosing(input, [nodeName]) : null
  if (node) return node
  const fn = FUNCTION[kind]
  return fn ? enclosingFunction(input, [fn]) : null
}

function unwrapInline(input: EditInput, node: SyntaxNode): EditResult {
  if (node.name === 'Expression') {
    const content = node.getChild('Content')!
    const marks = content.getChildren('ContentMark')
    const changes = [
      { from: node.from, to: marks[0]!.to, insert: '' },
      { from: marks[marks.length - 1]!.from, to: marks[marks.length - 1]!.to, insert: '' },
    ]
    return result(changes, input.from, input.to)
  }
  const first = node.firstChild!
  const last = node.lastChild!
  const changes = [
    { from: first.from, to: first.to, insert: '' },
    { from: last.from, to: last.to, insert: '' },
  ]
  return result(changes, input.from, input.to)
}

/** Which inline formats the caret or selection is inside, for the toolbar's pressed states. */
export function formatsAt(input: EditInput): Record<InlineKind, boolean> {
  return {
    emphasis: findInline(input, 'emphasis') !== null,
    strong: findInline(input, 'strong') !== null,
    highlight: findInline(input, 'highlight') !== null,
    subscript: findInline(input, 'subscript') !== null,
    superscript: findInline(input, 'superscript') !== null,
    smallcaps: findInline(input, 'smallcaps') !== null,
  }
}

/**
 * Subscript and superscript exclude each other, and small caps excludes itself: none of these is
 * ever inside one of its own group. Small caps combines with both of the others. Inside one of the
 * group, choosing another switches it and choosing the same one takes it off. Over a selection
 * that holds or touches some of the group, those are taken off first, so the new one wraps text
 * without its own kind in it.
 */
const EXCLUSIVE_GROUPS: readonly (readonly InlineKind[])[] = [
  ['subscript', 'superscript'],
  ['smallcaps'],
]
const EXCLUSIVE: readonly InlineKind[] = EXCLUSIVE_GROUPS.flat()
const EXCLUSIVE_FUNCTIONS = EXCLUSIVE.map((kind) => FUNCTION[kind]!)

function toggleExclusive(input: EditInput, kind: InlineKind): EditResult {
  const { doc } = input
  const group = EXCLUSIVE_GROUPS.find((g) => g.includes(kind))!.map((k) => FUNCTION[k]!)
  const around = enclosingFunction(input, group)
  if (around) {
    if (funcName(doc, around) === FUNCTION[kind]) return unwrapInline(input, around)
    const name = around.getChild('FuncName')!
    return result([{ from: name.from, to: name.to, insert: FUNCTION[kind]! }], input.from, input.to)
  }

  let { from, to } = input
  if (from === to) {
    while (isWord(doc[from - 1])) from -= 1
    while (isWord(doc[to])) to += 1
  }
  // Elements the range overlaps. A range that starts or ends inside the syntax of one grows to
  // cover it, so no change cuts into the syntax.
  let touching = exclusiveWithin(input.tree, doc, from, to)
  for (let again = true; again;) {
    again = false
    for (const element of touching) {
      const open = element.getChild('Content')!.getChildren('ContentMark')[0]!
      if (from > element.from && from < open.to) from = element.from
      if (to > element.from && to < open.to) to = element.to
    }
    const grown = exclusiveWithin(input.tree, doc, from, to)
    if (grown.length !== touching.length) again = true
    touching = grown
  }
  const own = touching.filter((e) => group.includes(funcName(doc, e)))
  const others = touching.filter((e) => !group.includes(funcName(doc, e)))
  const unwrap: TextChange[] = own.flatMap((element) => {
    const marks = element.getChild('Content')!.getChildren('ContentMark')
    const close = marks[marks.length - 1]!
    return [
      { from: element.from, to: marks[0]!.to, insert: '' },
      { from: close.from, to: close.to, insert: '' },
    ]
  })

  const chunks = paragraphChunks(doc, from, to).flatMap((chunk) => splitAround(doc, chunk, others))
  if (chunks.length === 0) {
    const open = `#${FUNCTION[kind]!}[`
    const pos = input.from + open.length
    return {
      changes: [{ from: input.from, to: input.from, insert: `${open}]` }],
      anchor: pos,
      head: pos,
    }
  }
  const changes = [...unwrap, ...wrapChunks(input, kind, chunks)]
  if (input.from === input.to) {
    // The caret stays where it was in the word, inside the new function.
    const pos = mapThrough(unwrap, input.from) + `#${FUNCTION[kind]!}[`.length
    return {
      changes: changes.sort((a, b) => a.from - b.from || a.to - b.to),
      anchor: pos,
      head: pos,
    }
  }
  return result(changes, chunks[0]!.from, chunks[chunks.length - 1]!.to, 1, -1)
}

/**
 * Cuts a chunk where it crosses the edge of an element that stays, so each piece lies wholly
 * inside or wholly outside it and the new wrappers stay balanced: `#super[a#smallcaps[b]]` and
 * `#smallcaps[ c]` instead of one wrapper that opens inside and closes outside.
 */
function splitAround(
  doc: string,
  chunk: { from: number; to: number },
  others: SyntaxNode[],
): { from: number; to: number }[] {
  let pieces = [chunk]
  for (const element of others) {
    const marks = element.getChild('Content')!.getChildren('ContentMark')
    const open = marks[0]!
    const close = marks[marks.length - 1]!
    pieces = pieces.flatMap((p) => {
      if (element.from < p.from && element.to > p.from && element.to < p.to)
        return [
          { from: p.from, to: close.from },
          { from: element.to, to: p.to },
        ]
      if (element.from > p.from && element.from < p.to && element.to > p.to)
        return [
          { from: p.from, to: element.from },
          { from: open.to, to: p.to },
        ]
      return [p]
    })
  }
  // A piece never starts or ends with the whitespace around the element it was cut at.
  return pieces
    .map((p) => {
      let { from, to } = p
      while (from < to && isBlank(doc[from])) from += 1
      while (to > from && isBlank(doc[to - 1])) to -= 1
      return { from, to }
    })
    .filter((p) => p.to > p.from)
}

/** The subscript, superscript, and small caps elements that overlap [from, to]. */
function exclusiveWithin(tree: Tree, doc: string, from: number, to: number): SyntaxNode[] {
  const found: SyntaxNode[] = []
  tree.iterate({
    from,
    to,
    enter: (ref) => {
      if (ref.name !== 'Expression' || ref.to <= from || ref.from >= to) return undefined
      const node = ref.node
      const marks = node.getChild('Content')?.getChildren('ContentMark') ?? []
      if (EXCLUSIVE_FUNCTIONS.includes(funcName(doc, node)) && marks.length > 1) found.push(node)
      return undefined
    },
  })
  return found
}

/**
 * Toggles an inline format. Inside an existing one it is removed. On a selection it
 * wraps each paragraph of the selection (without the whitespace at its edges). With a caret in or
 * next to a word it wraps the word. On an empty spot it inserts an empty pair with the caret inside.
 */
export function toggleInline(input: EditInput, kind: InlineKind): EditResult {
  if (EXCLUSIVE.includes(kind)) return toggleExclusive(input, kind)
  const existing = findInline(input, kind)
  if (existing) return unwrapInline(input, existing)

  let { from, to } = input
  if (from === to) {
    while (isWord(input.doc[from - 1])) from -= 1
    while (isWord(input.doc[to])) to += 1
  }
  const chunks = paragraphChunks(input.doc, from, to)
  if (chunks.length === 0) {
    const d = DELIMITER[kind]
    const [open, close] = d ? [d, d] : [`#${FUNCTION[kind]!}[`, ']']
    return {
      changes: [{ from: input.from, to: input.from, insert: open + close }],
      anchor: input.from + open.length,
      head: input.from + open.length,
    }
  }
  const changes = wrapChunks(input, kind, chunks)
  const first = chunks[0]!
  const last = chunks[chunks.length - 1]!
  const keepsCaret = input.from === input.to
  if (keepsCaret) {
    // The caret stays where it was in the word, inside the new delimiters.
    const pos = input.from + changes[0]!.insert.length
    return { changes, anchor: pos, head: pos }
  }
  return result(changes, first.from, last.to, 1, -1)
}

// --- link ----------------------------------------------------------------------------------------------------

/** The URL of the `#link("…")` around the range, with the extent of the quoted string. */
export function linkAt(input: EditInput): { url: string; from: number; to: number } | null {
  const link = enclosingFunction(input, ['link'])
  const args = link?.getChild('Args')
  if (!args) return null
  const match = /^\(\s*"((?:[^"\\]|\\.)*)"/.exec(input.doc.slice(args.from, args.to))
  if (!match) return null
  const start = args.from + match[0].indexOf('"')
  return { url: match[1]!.replace(/\\(.)/g, '$1'), from: start, to: start + match[1]!.length + 2 }
}

/** The web address under the caret: a bare URL or the target of a `#link("…")`. */
export function urlAt(input: EditInput): string | null {
  for (const node of ancestors(input.tree, input.from, 1)) {
    if (node.name === 'Url') return input.doc.slice(node.from, node.to)
  }
  return linkAt(input)?.url ?? null
}

/**
 * Cleans an address typed into the link dialog: adds https:// to a bare domain and mailto: to an
 * e-mail address. Returns null for an empty address.
 */
export function normalizeUrl(input: string): string | null {
  const url = input.trim()
  if (url === '' || url === 'https://' || /\s/.test(url)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  if (url.includes('@') && !url.includes('/')) return `mailto:${url}`
  return `https://${url}`
}

/** Makes the selection a link, or changes the URL of the link the caret is in. */
export function setLink(input: EditInput, url: string): EditResult {
  const existing = linkAt(input)
  if (existing) {
    const changes = [{ from: existing.from, to: existing.to, insert: typstString(url) }]
    return result(changes, input.from, input.to)
  }
  const selected = input.doc.slice(input.from, input.to)
  const label =
    selected.trim() !== '' && balanced(selected) && !selected.includes('\n\n') ? selected : url
  const insert = `#link(${typstString(url)})[${label}]`
  const labelStart = input.from + insert.length - label.length - 1
  return {
    changes: [{ from: input.from, to: input.to, insert }],
    anchor: labelStart,
    head: labelStart + label.length,
  }
}

/** Takes the link off the range: the words stay, `#link("…")[` and `]` go. */
export function removeLink(input: EditInput): EditResult {
  const link = enclosingFunction(input, ['link'])
  if (!link?.getChild('Content')) return noChange(input)
  return unwrapInline(input, link)
}

// --- comment -----------------------------------------------------------------------------------------------------

/**
 * Adds a comment. On a selection it first highlights it (unless it already is) and puts
 * the comment right after, so it belongs to the highlight. With a caret it inserts an empty
 * comment. If a comment is already there, the caret just moves into it.
 */
export function insertComment(input: EditInput): EditResult {
  const { doc } = input
  if (enclosing(input, ['BlockComment', 'LineComment'])) return noChange(input)

  const highlight = enclosing(input, ['Highlight'])
  const selecting = input.from !== input.to
  if (!highlight && !selecting) {
    return {
      changes: [{ from: input.from, to: input.from, insert: '/*  */' }],
      anchor: input.from + 3,
      head: input.from + 3,
    }
  }

  // `end` is where the highlighted text ends in the original text.
  let wrapChanges: TextChange[] = []
  let end: number
  if (highlight) {
    end = highlight.to
  } else {
    const chunks = paragraphChunks(doc, input.from, input.to)
    if (chunks.length === 0) return noChange(input)
    wrapChanges = wrapChunks(input, 'highlight', chunks)
    end = chunks[chunks.length - 1]!.to
  }
  const closing = highlight ? 0 : DELIMITER.highlight!.length

  // A comment that already follows the highlight is reused: the caret moves into it.
  let next = end + closing
  if (!highlight) next = end
  while (next < doc.length && (doc[next] === ' ' || doc[next] === '\t')) next += 1
  if (doc.startsWith('/*', next) || doc.startsWith('//', next)) {
    const caret = mapThrough(wrapChanges, next + 2 + (doc[next + 2] === ' ' ? 1 : 0), 1)
    return { changes: wrapChanges, anchor: caret, head: caret }
  }

  const changes: TextChange[] = [...wrapChanges]
  if (highlight) changes.push({ from: end, to: end, insert: ' /*  */' })
  else {
    const last = changes[changes.length - 1]!
    changes[changes.length - 1] = { ...last, insert: `${last.insert} /*  */` }
  }
  const caret = mapThrough(changes, end, -1) + closing + 4
  return { changes, anchor: caret, head: caret }
}

/** Width given to a new figure, and height to a new inline image. */
export const DEFAULT_FIGURE_WIDTH = '75%'
export const DEFAULT_INLINE_HEIGHT = '1em'

/**
 * Inserts an image. A figure goes after the current paragraph with a blank line on both
 * sides, so it stands alone; an inline image goes at the end of the selection. The caret ends up
 * after what was inserted. Does nothing in code, math, raw text, or comments.
 */
export function insertFigure(
  input: EditInput,
  options: { kind: 'figure' | 'inline'; path: string; random?: () => number },
): EditResult {
  const { doc } = input
  if (insideOpaque(input.tree, input.to)) return noChange(input)
  if (options.kind === 'inline') {
    const source = figureSource('inline', { path: options.path, height: DEFAULT_INLINE_HEIGHT })
    const at = input.to
    return {
      changes: [{ from: at, to: at, insert: source }],
      anchor: at + source.length,
      head: at + source.length,
    }
  }
  // An empty path makes a placeholder: a figure whose image is chosen later.
  const source = figureSource('figure', {
    path: options.path,
    width: DEFAULT_FIGURE_WIDTH,
    label: newFigureId(doc, options.random),
  })
  return insertBlock(input, source)
}

/**
 * Puts a block (a figure or a formula) on its own lines: here when the line is empty (with a blank
 * line after it when text follows), otherwise after the paragraph the caret is in. The caret ends
 * up after what was inserted.
 */
function insertBlock(input: EditInput, source: string): EditResult {
  const { doc } = input
  const lineStart = lineStartOf(doc, input.to)
  const lineEnd = lineEndOf(doc, input.to)
  if (doc.slice(lineStart, lineEnd).trim() === '') {
    // On an empty line: put the figure here, with a blank line after it when text follows.
    const nextLineEnd = lineEnd < doc.length ? lineEndOf(doc, lineEnd + 1) : lineEnd
    const followed = lineEnd < doc.length && doc.slice(lineEnd + 1, nextLineEnd).trim() !== ''
    const insert = followed ? `${source}\n` : source
    return {
      changes: [{ from: lineStart, to: lineStart, insert }],
      anchor: lineStart + source.length,
      head: lineStart + source.length,
    }
  }
  // After the paragraph the caret is in: up to the next blank line or the end of the text.
  let end = lineEnd
  for (;;) {
    const next = doc.indexOf('\n', end)
    if (next < 0) break
    const nextEnd = lineEndOf(doc, next + 1)
    if (doc.slice(next + 1, nextEnd).trim() === '') break
    end = nextEnd
  }
  const insert = `\n\n${source}`
  return {
    changes: [{ from: end, to: end, insert }],
    anchor: end + insert.length,
    head: end + insert.length,
  }
}

const OPAQUE = ['Raw', 'Math', 'BlockComment', 'LineComment', 'CodeLine', 'CodeBlock', 'Args']

/** True where the parser sees code, math, raw text, or a comment: nothing can be inserted there. */
export function insideOpaque(tree: Tree, pos: number): boolean {
  return ancestors(tree, pos, 1).some((n) => OPAQUE.includes(n.name) && n.from < pos && n.to > pos)
}

/**
 * Inserts an empty table of `rows` by `columns`, with a header row, as a paragraph of its own (like a
 * figure). The caret ends up after it. Does nothing in code, math, raw text, or comments.
 */
export function insertTable(
  input: EditInput,
  options: { rows: number; columns: number; random?: () => number },
): EditResult {
  if (insideOpaque(input.tree, input.to)) return noChange(input)
  const rows = Math.max(1, Math.min(options.rows, 100))
  const columns = Math.max(1, Math.min(options.columns, 30))
  const label = newId('tbl', input.doc, options.random)
  return insertBlock(input, `${tableSource(newTable(rows, columns, label))} <${label}>`)
}

/** What a new formula holds, so that something is there to see and to replace. */
export const NEW_FORMULA = 'x'

/**
 * Inserts a formula. Inline: a selection of plain text becomes its source, otherwise
 * `$x$` goes at the caret. Block: a `$ x $` paragraph of its own, as for figures. Does nothing in
 * code, math, raw text, or comments.
 */
export function insertFormula(
  input: EditInput,
  options: { display: boolean; random?: () => number },
): EditResult {
  const { doc } = input
  if (insideOpaque(input.tree, input.to) || insideOpaque(input.tree, input.from))
    return noChange(input)
  // A block formula is numbered, so it gets its id at once.
  if (options.display) {
    const label = newId('eq', doc, options.random)
    return insertBlock(input, `${formulaSource(NEW_FORMULA, true)} <${label}>`)
  }
  const selected = doc.slice(input.from, input.to)
  const wrap = selected.trim() !== '' && !/[$\n]/.test(selected)
  const source = formulaSource(wrap ? selected : NEW_FORMULA, false)
  const from = wrap ? input.from : input.to
  return {
    changes: [{ from, to: input.to, insert: source }],
    anchor: from + source.length,
    head: from + source.length,
  }
}

export const FOOTNOTE_OPEN = '#footnote['

/**
 * Inserts an empty footnote after the selection, with the caret inside the brackets.
 * Does nothing where a note is already (the editor opens it instead) and in code, math, raw text,
 * or comments.
 */
export function insertFootnote(input: EditInput): EditResult {
  if (insideOpaque(input.tree, input.to)) return noChange(input)
  if (footnoteAt(findFootnotes(input.tree, input.doc), input.from, input.to)) return noChange(input)
  const at = input.to
  const caret = at + FOOTNOTE_OPEN.length
  return {
    changes: [{ from: at, to: at, insert: `${FOOTNOTE_OPEN}]` }],
    anchor: caret,
    head: caret,
  }
}

/**
 * The input rule for comments: typing the closing `==` of `==text==` turns it into
 * a block comment with the same text. `typed` is the character about to be inserted at `pos`. Returns null when the rule
 * does not apply, or when the spot is code, math, raw text, or already a comment.
 */
export function commentInputRule(
  doc: string,
  pos: number,
  typed: string,
  tree?: Tree,
): TextChange | null {
  if (typed !== '=') return null
  const before = doc.slice(lineStartOf(doc, pos), pos)
  const match = /(^|[^=])==([^\s=](?:[^=\n]*[^\s=])?)=$/.exec(before)
  if (!match) return null
  const start = pos - (match[2]!.length + 3)
  if (tree && insideOpaque(tree, start)) return null
  return { from: start, to: pos, insert: `/* ${match[2]} */` }
}
