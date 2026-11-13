import type { SyntaxNode, Tree } from '@lezer/common'
import { insideOpaque } from './edit'
import type { EditInput, EditResult } from './edit'

/**
 * Paragraphs as Typst reads them: an empty line ends a paragraph, a single line break is a space
 * inside it, and a backslash at the end of a line is a line break the reader sees. Enter writes a
 * new paragraph (an empty line), Shift+Enter a line break; Backspace at the start of a paragraph and
 * Delete at its end take the empty line between two paragraphs away in one press, so the two become
 * one, as in a word processor. In code, math, raw text and comments each key is left to the editor.
 */

const blankLine = (text: string): boolean => text.trim() === ''

interface Line {
  from: number
  to: number
  text: string
}

function lineAt(doc: string, pos: number): Line {
  const from = doc.lastIndexOf('\n', pos - 1) + 1
  const nl = doc.indexOf('\n', pos)
  const to = nl < 0 ? doc.length : nl
  return { from, to, text: doc.slice(from, to) }
}

/** The line before the one starting at `lineFrom`, or null at the top. */
const lineBefore = (doc: string, lineFrom: number): Line | null =>
  lineFrom === 0 ? null : lineAt(doc, lineFrom - 1)

/** The line after the one ending at `lineTo`, or null at the end. */
const lineAfter = (doc: string, lineTo: number): Line | null =>
  lineTo >= doc.length ? null : lineAt(doc, lineTo + 1)

const caretAt = (pos: number): Pick<EditResult, 'anchor' | 'head'> => ({ anchor: pos, head: pos })

/**
 * Enter: a new paragraph. In the middle or at the end of a paragraph the text after the caret moves
 * to a paragraph of its own, behind an empty line; at the start of a paragraph (after an empty line,
 * or at the top) one line break pushes it down, since the empty line is there already. Trailing
 * spaces before the caret go, so no paragraph ends in a space. A selection is replaced.
 */
export function newParagraph(input: EditInput): EditResult | null {
  const { doc, tree, from, to } = input
  if (insideOpaque(tree, from) || insideOpaque(tree, to)) return null
  const line = lineAt(doc, from)
  const before = doc.slice(line.from, from)
  if (blankLine(before)) {
    const above = lineBefore(doc, line.from)
    if (!above || blankLine(above.text))
      return { changes: [{ from, to, insert: '\n' }], ...caretAt(from + 1) }
  }
  let cut = from
  while (cut > line.from && (doc[cut - 1] === ' ' || doc[cut - 1] === '\t')) cut -= 1
  return { changes: [{ from: cut, to, insert: '\n\n' }], ...caretAt(cut + 2) }
}

/**
 * Shift+Enter: a line break inside the paragraph, Typst's backslash at the end of the line. In a
 * list item the next line is indented under the item's text, so it stays in the item; a heading
 * holds no line break, so there it is a new paragraph.
 */
export function lineBreak(input: EditInput): EditResult | null {
  const { doc, tree, from, to } = input
  if (insideOpaque(tree, from) || insideOpaque(tree, to)) return null
  const line = lineAt(doc, from)
  if (/^\s*=+ /.test(line.text)) return newParagraph(input)
  const item = /^\s*(?:[-+]|\d+\.)\s+/.exec(line.text)
  const indent = item && from >= line.from + item[0].length ? ' '.repeat(item[0].length) : ''
  // A backslash needs a space or the end of the line after it, and reads best after a space too.
  const space = from > 0 && !/[ \t\n]/.test(doc[from - 1]!) ? ' ' : ''
  const insert = `${space}\\\n${indent}`
  return { changes: [{ from, to, insert }], ...caretAt(from + insert.length) }
}

/**
 * A line break asked for at the start of a paragraph that follows another behind one empty line (the
 * slash menu opens there): the empty line becomes a line break, so this paragraph goes on as the next
 * line of the one above. Everywhere else it is `lineBreak` at the caret. Null where neither applies
 * (code, math, raw text, comments).
 */
export function lineBreakHere(input: EditInput): EditResult | null {
  const { doc, tree, from, to } = input
  if (from === to && !insideOpaque(tree, from)) {
    const line = lineAt(doc, from)
    const gap = from === line.from ? lineBefore(doc, line.from) : null
    const above = gap && blankLine(gap.text) ? lineBefore(doc, gap.from) : null
    // A heading holds no line break, and a list item would need its indent: those stay apart.
    const plain = above && !blankLine(above.text) && !/^\s*(?:=+|[-+]|\d+\.)\s/.test(above.text)
    if (above && plain && joinable(tree, doc, above, line)) {
      let end = above.to
      while (end > above.from && (doc[end - 1] === ' ' || doc[end - 1] === '\t')) end -= 1
      const insert = ' \\\n'
      return { changes: [{ from: end, to: from, insert }], ...caretAt(end + insert.length) }
    }
  }
  return lineBreak(input)
}

/**
 * Backspace at the start of a paragraph that follows another behind one empty line: the empty line
 * and both line breaks go, so the caret stands at the end of the paragraph above, joined to this
 * one. Null everywhere else (a selection, inside a line, more than one empty line, a list item, where
 * the line above is not text), so the editor's own Backspace runs.
 */
export function joinBackward(input: EditInput): EditResult | null {
  const { doc, tree, from, to } = input
  if (from !== to || insideOpaque(tree, from)) return null
  const line = lineAt(doc, from)
  if (from !== line.from) return null
  const gap = lineBefore(doc, line.from)
  if (!gap || !blankLine(gap.text)) return null
  const above = lineBefore(doc, gap.from)
  if (!above || !joinable(tree, doc, above, line)) return null
  return { changes: [{ from: above.to, to: from, insert: '' }], ...caretAt(above.to) }
}

/** Delete at the end of a paragraph that has another behind one empty line: the same join, forward. */
export function joinForward(input: EditInput): EditResult | null {
  const { doc, tree, from, to } = input
  if (from !== to || insideOpaque(tree, from)) return null
  const line = lineAt(doc, from)
  if (from !== line.to || blankLine(line.text)) return null
  const gap = lineAfter(doc, line.to)
  if (!gap || !blankLine(gap.text)) return null
  const below = lineAfter(doc, gap.to)
  if (!below || !joinable(tree, doc, line, below)) return null
  return { changes: [{ from, to: below.from, insert: '' }], ...caretAt(from) }
}

/**
 * Whether the paragraph ending on `upper` and the one starting on `lower` can become one: both are
 * text (or `lower` is still empty), not a list item (whose marker would run into the text), not a heading below (whose marks
 * would), and not a block (a figure, a table, a block quote, a formula), which stops being one in
 * the middle of a line.
 */
function joinable(tree: Tree, doc: string, upper: Line, lower: Line): boolean {
  if (blankLine(upper.text)) return false
  // An empty paragraph (just made with Enter) goes with the empty line before it.
  if (blankLine(lower.text)) return !endsBlock(tree, doc, upper)
  if (isListLine(upper.text) || isListLine(lower.text) || /^\s*=+ /.test(lower.text)) return false
  return !endsBlock(tree, doc, upper) && !startsBlock(tree, doc, lower)
}

/** Blocks that stand on lines of their own when they start a line. */
const BLOCKS = ['Expression', 'CodeLine', 'CodeBlock', 'Math']

/**
 * Whether `line` starts with a block: a call or a formula at the start of the line that fills it
 * (perhaps with a label behind it) or goes on over the next lines.
 */
function startsBlock(tree: Tree, doc: string, line: Line): boolean {
  const start = line.from + (line.text.length - line.text.trimStart().length)
  let node: SyntaxNode | null = tree.resolve(start, 1)
  while (node?.parent && node.parent.name !== 'Document') node = node.parent
  if (!node || node.from !== start || !BLOCKS.includes(node.name)) return false
  if (node.to >= line.to) return true
  return /^\s*(<[^<>\s]+>\s*)?$/.test(doc.slice(node.to, line.to))
}

/** A list item's line: its text after a marker, which a join would run into the paragraph. */
const isListLine = (text: string): boolean => /^\s*([-+]|\d+\.)\s/.test(text)

/**
 * Typing on the empty line after a paragraph (the gap to the next one, or the last line of a sheet
 * that ends in a line break): what is typed would join the paragraph above, as Typst reads a single
 * line break, so it starts a paragraph of its own instead, behind the empty line and in front of an
 * empty line to the text below. `text` is what is about to be typed or pasted at `pos`; null
 * where this is not such a line.
 */
export function typeOnGap(input: EditInput, text: string): EditResult | null {
  const { doc, tree, from, to } = input
  if (from !== to || insideOpaque(tree, from)) return null
  const line = lineAt(doc, from)
  if (line.text !== '') return null
  const above = lineBefore(doc, line.from)
  // After a line break the reader sees (a backslash), the line belongs to the paragraph; after a
  // block (a figure, a table, a block quote, a formula) a paragraph starts anyway.
  if (!above || blankLine(above.text) || /(^|[^\\])\\\s*$/.test(above.text)) return null
  if (endsBlock(tree, doc, above)) return null
  const below = lineAfter(doc, line.to)
  const after = below && !blankLine(below.text) ? '\n' : ''
  const insert = `\n${text}${after}`
  return { changes: [{ from, to, insert }], ...caretAt(from + 1 + text.length) }
}

/**
 * Whether `line` ends with a block that stands on lines of its own: a call (`#figure(…)`,
 * `#quote(block: true)[…]`, a table) or a formula that starts at the start of a line and closes on
 * this one, perhaps with its label behind it. Typst starts a paragraph after such a block without an
 * empty line, and the editor draws the line after it in full.
 */
function endsBlock(tree: Tree, doc: string, line: Line): boolean {
  let end = line.to
  while (end > line.from && /\s/.test(doc[end - 1]!)) end -= 1
  let node: SyntaxNode | null = tree.resolve(end, -1)
  while (node?.parent && node.parent.name !== 'Document') node = node.parent
  if (!node || node.name === 'Document') return false
  if (node.name === 'Label') node = node.prevSibling
  if (
    !node ||
    node.to > end ||
    !['Expression', 'CodeLine', 'CodeBlock', 'Math'].includes(node.name)
  )
    return false
  return doc.slice(doc.lastIndexOf('\n', node.from - 1) + 1, node.from).trim() === ''
}

/**
 * The empty line between two paragraphs that holds `pos`, as the ends the caret goes to instead:
 * `before` is the end of the paragraph above, `after` the start of the line below. The caret never
 * rests on such a line: nothing typed there would belong to it. Null for any other line, and for
 * the last line of a sheet (the place to go on writing at the end) and the line after a block.
 */
export function gapAt(
  input: Pick<EditInput, 'doc' | 'tree'>,
  pos: number,
): {
  before: number
  after: number
} | null {
  const { doc, tree } = input
  const line = lineAt(doc, pos)
  if (!blankLine(line.text) || insideOpaque(tree, pos)) return null
  const above = lineBefore(doc, line.from)
  const below = lineAfter(doc, line.to)
  if (!above || !below || blankLine(above.text)) return null
  if (/(^|[^\\])\\\s*$/.test(above.text) || endsBlock(tree, doc, above)) return null
  return { before: above.to, after: below.from }
}
