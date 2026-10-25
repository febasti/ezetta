import type { SyntaxNode, SyntaxNodeRef, Tree } from '@lezer/common'

/**
 * Footnotes. A note is stored inline, as `#footnote[…]`, at its marker. Their extents
 * come from the parser, never from regular expressions, so notes with nested brackets, code, and
 * citations are found correctly. Notes inside comments, raw text, or math are not notes at all (the
 * parser does not look inside those), and a note inside another note is part of the outer one.
 */

export interface Footnote {
  /** Extent of the whole `#footnote[…]`. */
  from: number
  to: number
  /** The note's text between the brackets. */
  contentFrom: number
  contentTo: number
  /** Level-1 headings before the note in this text. Used when numbering restarts per chapter. */
  chapters: number
}

export interface FootnoteScan {
  notes: Footnote[]
  /** Level-1 headings in the text. */
  chapters: number
}

function noteOf(node: SyntaxNode, doc: string): Omit<Footnote, 'chapters'> | null {
  const name = node.getChild('FuncName')
  if (!name || doc.slice(name.from, name.to) !== 'footnote') return null
  const marks = node.getChild('Content')?.getChildren('ContentMark') ?? []
  const open = marks[0]
  const close = marks.length > 1 ? marks[marks.length - 1] : undefined
  return open && close
    ? { from: node.from, to: node.to, contentFrom: open.to, contentTo: close.from }
    : null
}

/** All footnotes of a text in order, and how many level-1 headings it has. */
export function scanFootnotes(tree: Tree, doc: string): FootnoteScan {
  const notes: Footnote[] = []
  let chapters = 0
  tree.iterate({
    enter: (ref) => {
      if (ref.name === 'Heading') {
        const mark = ref.node.getChild('HeadingMark')
        if (mark && mark.to - mark.from === 1) chapters += 1
      } else if (ref.name === 'Expression') {
        const note = noteOf(ref.node, doc)
        if (note) {
          notes.push({ ...note, chapters })
          return false // a note inside a note belongs to the outer one
        }
      }
      return undefined
    },
  })
  return { notes, chapters }
}

export const findFootnotes = (tree: Tree, doc: string): Footnote[] => scanFootnotes(tree, doc).notes

/** The note around the range, if any: the caret strictly inside it, or a selection within it. */
export function footnoteAt(notes: readonly Footnote[], from: number, to = from): Footnote | null {
  // A caret at either edge of a note is outside it; a selection may cover the note.
  return (
    notes.find((note) =>
      from === to ? note.from < from && from < note.to : note.from <= from && note.to >= to,
    ) ?? null
  )
}

const REMOVED = new Set([
  'Hash',
  'FuncName',
  'Args',
  'ContentMark',
  'EmphasisMark',
  'StrongMark',
  'HighlightMark',
  'LineComment',
  'BlockComment',
])

/**
 * The text of a range without markup: delimiters, function names and arguments, and comments
 * are left out, the words stay. For margin cards, the notes panel, and the titles of headings.
 *
 * `scope` is the tree of the whole text, or a node that holds the range (a heading, say). Given the
 * node, only its part of the tree is looked at; from the whole tree, finding the range means passing
 * the nodes of everything before it, which for each of many headings in a long sheet adds up.
 */
export function plainText(scope: Tree | SyntaxNode, doc: string, from: number, to: number): string {
  const removed: [number, number][] = []
  const enter = (ref: SyntaxNodeRef): false | undefined => {
    if (REMOVED.has(ref.name)) {
      removed.push([Math.max(ref.from, from), Math.min(ref.to, to)])
      return false
    }
    // Only a note that starts inside the range is a nested one; the outer note encloses it.
    if (ref.name === 'Expression' && ref.from >= from && noteOf(ref.node, doc)) {
      removed.push([Math.max(ref.from, from), Math.min(ref.to, to)])
      return false
    }
    return undefined
  }
  // Only what overlaps the range is entered, as `Tree.iterate` does with `from` and `to`.
  scope.cursor().iterate((ref) => (ref.from <= to && ref.to >= from ? enter(ref) : false))
  removed.sort((a, b) => a[0] - b[0])
  let out = ''
  let at = from
  for (const [start, end] of removed) {
    if (start > at) out += doc.slice(at, start)
    at = Math.max(at, end)
  }
  out += doc.slice(at, to)
  return out.replace(/\s+/g, ' ').trim()
}

// --- numbering ---------------------------------------------------------------------------------------

export type FootnoteRestart = 'continuous' | 'chapter'

/** What a sheet contributes to the numbering of the sheets after it. */
export interface FootnoteSummary {
  count: number
  /** Notes after the sheet's last level-1 heading, or null when the sheet has none. */
  afterLastChapter: number | null
}

export function summarizeFootnotes(scan: FootnoteScan): FootnoteSummary {
  return {
    count: scan.notes.length,
    afterLastChapter:
      scan.chapters > 0 ? scan.notes.filter((n) => n.chapters === scan.chapters).length : null,
  }
}

export interface FootnoteOffsets {
  /** Notes in all earlier sheets, for continuous numbering. */
  offset: number
  /** Notes since the last level-1 heading in earlier sheets, for numbering per chapter. */
  chapterOffset: number
}

/** The numbering state at the start of a sheet, from the summaries of the sheets before it. */
export function offsetsAfter(earlier: readonly FootnoteSummary[]): FootnoteOffsets {
  let offset = 0
  let chapterOffset = 0
  for (const sheet of earlier) {
    offset += sheet.count
    chapterOffset =
      sheet.afterLastChapter === null ? chapterOffset + sheet.count : sheet.afterLastChapter
  }
  return { offset, chapterOffset }
}

/** The number of every note of a sheet. Continuous numbering counts on from the earlier sheets.
 * Numbering per chapter restarts at each level-1 heading, and notes before the first heading carry
 * on from the earlier sheets' last chapter. */
export function numberFootnotes(
  notes: readonly Footnote[],
  restart: FootnoteRestart,
  offsets: FootnoteOffsets,
): number[] {
  if (restart === 'continuous') return notes.map((_, index) => offsets.offset + index + 1)
  const seen = new Map<number, number>()
  return notes.map((note) => {
    const before = seen.get(note.chapters) ?? 0
    seen.set(note.chapters, before + 1)
    return (note.chapters === 0 ? offsets.chapterOffset : 0) + before + 1
  })
}
