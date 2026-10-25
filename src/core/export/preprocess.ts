import type { Tree } from '@lezer/common'
import { citationOverview } from '../typst/citations'
import { scanFigures } from '../typst/figures'
import { parseTypst } from '../typst/parser'
import { scanCrossRefs } from '../typst/targets'

/**
 * Preprocessing of a sheet for the export. The sheet is changed in a few places
 * and nowhere else, and every change keeps the number of line breaks, so a line in the copy is the
 * same line in the sheet and the compiler's messages map back to it:
 *
 *  - Highlights (`::text::`) are not Typst: they are taken out (their marks), or made `#highlight[…]`.
 *  - Comments are Typst comments and print nothing; for a review they become footnotes.
 *  - A reference to a heading becomes a link with the text the app has worked out ("Abschnitt 2.1"),
 *    so it needs no numbering from the template.
 *  - An image path is made absolute from the project (`/assets/a.png`), because the copy lives in
 *    another folder than the sheet.
 *  - A citation of a work the bibliography does not have becomes its key in brackets with a
 *    question mark, in the danger colour ("[unbekannt2000?]"): the compiler would stop the whole
 *    document at it, and the export lists it as a warning anyway.
 */

export interface PreprocessOptions {
  marks: 'hide' | 'show'
  comments: 'remove' | 'footnote'
  /** The text of a link to the heading with this label, or null when there is no such heading. */
  headingText: (label: string) => string | null
  /** True for a citation key that names no work of the bibliography (and no label of the export). */
  unknownWork?: (key: string) => boolean
}

export type Problem =
  /** A reference to a heading that no sheet in the export has. */
  { kind: 'reference'; label: string; line: number }

export interface Preprocessed {
  text: string
  problems: Problem[]
  /** What the sheet has, for the warnings before an export. */
  counts: { highlights: number; comments: number; missingCitations: number; checks: number }
}

interface Edit {
  from: number
  to: number
  insert: string
}

/** Comments the app writes itself (`/*#cite-needed*\/`, `/*#check: …*\/`), which are not for the reader. */
const isMarker = (comment: string): boolean => /^\/\*\s*#/.test(comment)

/** Text for the inside of a content block `[…]`: nothing in it may be read as markup. */
const escapeContent = (text: string): string =>
  text.replace(/[\\#[\]$*_@<>`~/"'-]/g, (c) => `\\${c}`)

/** The text of a comment without its delimiters. */
function commentText(raw: string): string {
  const text = raw.startsWith('/*')
    ? raw.slice(2, raw.endsWith('*/') ? -2 : undefined)
    : raw.slice(2)
  return text.trim()
}

export function preprocessSheet(
  text: string,
  options: PreprocessOptions,
  parsed: Tree = parseTypst(text),
): Preprocessed {
  const edits: Edit[] = []
  const problems: Problem[] = []
  const counts = { highlights: 0, comments: 0, missingCitations: 0, checks: 0 }
  const lineOf = (pos: number): number => text.slice(0, pos).split('\n').length

  // Where the notes are: a footnote cannot hold another one.
  const notes: [number, number][] = []
  parsed.iterate({
    enter: (ref) => {
      if (ref.name !== 'Expression') return undefined
      const name = ref.node.getChild('FuncName')
      if (name && text.slice(name.from, name.to) === 'footnote') notes.push([ref.from, ref.to])
      return undefined
    },
  })
  const inNote = (pos: number): boolean => notes.some(([a, b]) => a < pos && pos < b)

  parsed.iterate({
    enter: (ref) => {
      if (ref.name === 'Highlight') {
        const open = ref.node.firstChild
        const close = ref.node.lastChild
        if (!open || !close || open === close) return undefined
        counts.highlights += 1
        const show = options.marks === 'show'
        edits.push({ from: open.from, to: open.to, insert: show ? '#highlight[' : '' })
        edits.push({ from: close.from, to: close.to, insert: show ? ']' : '' })
        return undefined
      }
      if (ref.name === 'BlockComment' || ref.name === 'LineComment') {
        const raw = text.slice(ref.from, ref.to)
        if (isMarker(raw)) {
          if (/^\/\*\s*#\s*cite-needed/.test(raw)) counts.missingCitations += 1
          else if (/^\/\*\s*#\s*check/.test(raw)) counts.checks += 1
          return false
        }
        counts.comments += 1
        const body = commentText(raw)
        if (options.comments === 'footnote' && body !== '' && !inNote(ref.from))
          edits.push({ from: ref.from, to: ref.to, insert: `#footnote[${escapeContent(body)}]` })
        return false
      }
      return undefined
    },
  })

  for (const reference of scanCrossRefs(parsed, text)) {
    if (!reference.label.startsWith('sec-')) continue
    const link = options.headingText(reference.label)
    if (link === null) {
      problems.push({ kind: 'reference', label: reference.label, line: lineOf(reference.from) })
      continue
    }
    const shown =
      reference.supplement !== null && reference.supplement.trim() !== ''
        ? reference.supplement
        : link
    edits.push({
      from: reference.from,
      to: reference.to,
      insert: `#link(<${reference.label}>)[${shown}]`,
    })
  }

  if (options.unknownWork)
    for (const [key, from, to] of citationOverview(text, parsed).spans)
      if (options.unknownWork(key))
        edits.push({
          from,
          to,
          // The line breaks of a `#cite(…)` over several lines stay, so the lines keep their numbers.
          insert: `#text(fill: rgb("#c9473b"))[\\[${escapeContent(key)}?\\]]${'\n'.repeat(
            (text.slice(from, to).match(/\n/g) ?? []).length,
          )}`,
        })

  for (const figure of scanFigures(parsed, text)) {
    if (figure.empty) continue // a placeholder frame has no path, and prints as it is
    if (figure.path.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(figure.path)) continue
    edits.push({
      from: figure.pathFrom,
      to: figure.pathTo,
      insert: `"/${figure.path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
    })
  }

  // A comment inside a note stays what it is, and an edit that overlaps an earlier one is dropped
  // (a reference inside a comment that became a footnote, a highlight mark inside a link).
  edits.sort((a, b) => a.from - b.from || a.to - b.to)
  const kept: Edit[] = []
  for (const edit of edits) {
    const last = kept.at(-1)
    if (last && edit.from < last.to) continue
    kept.push(edit)
  }
  let out = ''
  let at = 0
  for (const edit of kept) {
    out += text.slice(at, edit.from) + edit.insert
    at = edit.to
  }
  out += text.slice(at)
  return { text: out, problems, counts }
}
