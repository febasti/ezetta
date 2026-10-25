import type { Tree } from '@lezer/common'
import { DEFAULT_HEADING_NUMBERING, formatHeadingNumber } from '../export/numbering'
import type { HeadingNumbering } from '../export/numbering'
import type { SheetTarget } from '../project/tree'
import type { Figure, TextEdit } from './figures'
import { scanFigures } from './figures'
import { plainText } from './footnotes'
import { scanFormulas } from './math'
import type { Formula } from './math'
import { scanTables } from './tables'
import type { Table } from './tables'

/**
 * Cross-references: `@fig-stichprobe`, `@tbl-…`, `@eq-…`, `@sec-…`. A reference
 * points at a numbered thing with a `<label>` right behind it: a figure, a table, a block formula,
 * or a heading. Things without a label are still counted, because they take a number; the label is
 * written when the first reference to them is made.
 *
 * The numbers follow what Typst prints with plain numbering (figures and tables by their own
 * counters, block formulas as "(1)", headings as "1.2"), counted across the sheets of the export in
 * project order. Chapter-based numbers and the template's own numbering patterns wait for the
 * export profiles.
 */

export type TargetKind = 'sec' | 'fig' | 'tbl' | 'eq'

export const TARGET_KINDS: readonly TargetKind[] = ['sec', 'fig', 'tbl', 'eq']

/** A thing a reference can point at. */
export interface Target {
  kind: TargetKind
  /** Null while it has no label. */
  label: string | null
  /** Where the thing starts in the sheet, for going there. */
  at: number
  /** Where a label would be written. */
  labelAt: number
  /** For headings the level (1 is a chapter), otherwise 0. */
  level: number
  /** The heading's text, the caption, or the formula, shortened. */
  title: string
}

/** Longest title kept per target, so the sheet statistics stay small. */
export const TITLE_LIMIT = 80

const shorten = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > TITLE_LIMIT ? `${clean.slice(0, TITLE_LIMIT - 1)}…` : clean
}

/** A reserved prefix tells a cross-reference from a citation. */
export const RESERVED_PREFIX = /^(?:fig|tbl|eq|sec)-/

const COMMENTS = new Set(['LineComment', 'BlockComment'])

/** What other scans of the same text found already, so that `scanTargets` need not look again. */
export interface FoundInSheet {
  figures?: readonly Figure[]
  tables?: readonly Table[]
  formulas?: readonly Formula[]
}

/** The numbered things of a sheet, in text order. */
export function scanTargets(tree: Tree, doc: string, found: FoundInSheet = {}): Target[] {
  const out: Target[] = []
  for (const figure of found.figures ?? scanFigures(tree, doc)) {
    if (figure.kind !== 'figure') continue
    out.push({
      kind: 'fig',
      label: figure.label,
      at: figure.from,
      labelAt: figure.to,
      level: 0,
      title: shorten(figure.caption?.text ?? ''),
    })
  }
  for (const table of found.tables ?? scanTables(tree, doc)) {
    if (table.kind !== 'figure') continue
    out.push({
      kind: 'tbl',
      label: table.label,
      at: table.from,
      labelAt: table.to,
      level: 0,
      title: shorten(table.caption?.text ?? ''),
    })
  }
  for (const formula of found.formulas ?? scanFormulas(tree, doc)) {
    if (!formula.display) continue
    out.push({
      kind: 'eq',
      label: formula.label,
      at: formula.from,
      labelAt: formula.to,
      level: 0,
      title: shorten(formula.source),
    })
  }
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'Heading') return undefined
      const node = ref.node
      const mark = node.getChild('HeadingMark')
      if (!mark) return false
      // The label of a heading is the last thing on its line (a trailing comment may follow).
      let label: string | null = null
      let contentEnd = node.to
      for (let child = node.lastChild; child; child = child.prevSibling) {
        if (COMMENTS.has(child.name)) {
          contentEnd = child.from
          continue
        }
        if (child.name === 'Label') {
          label = doc.slice(child.from + 1, child.to - 1)
          contentEnd = child.from
        }
        break
      }
      const text = plainText(node, doc, mark.to, contentEnd)
      // Spaces before a label or comment are not part of the heading's text.
      const labelAt = mark.to + doc.slice(mark.to, contentEnd).trimEnd().length
      out.push({
        kind: 'sec',
        label,
        at: node.from,
        labelAt,
        level: Math.max(1, mark.to - mark.from),
        title: shorten(text),
      })
      return false
    },
  })
  return out.sort((a, b) => a.at - b.at)
}

/** A cross-reference in the text: `@fig-a`, with an optional `[supplement]` that replaces the words. */
export interface CrossRef {
  /** Extent of the reference, supplement included. */
  from: number
  to: number
  /** The label without the `@`. */
  label: string
  supplement: string | null
  /** Written as `#ref(<label>)`, which a text right after the label needs. */
  long: boolean
}

const SKIP = new Set([
  'Args',
  'CodeBlock',
  'CodeLine',
  'Raw',
  'BlockComment',
  'LineComment',
  'Math',
])
const LONG_ARGS = /^\(\s*<([\p{L}\p{N}_:.-]+)>\s*\)$/u

export function scanCrossRefs(tree: Tree, doc: string): CrossRef[] {
  const out: CrossRef[] = []
  tree.iterate({
    enter: (ref) => {
      if (ref.name === 'Expression') {
        // `#ref(<label>)`: only this exact form is read; anything with more arguments stays source.
        const name = ref.node.getChild('FuncName')
        const args = ref.node.getChild('Args')
        if (name && args && doc.slice(name.from, name.to) === 'ref' && args.to === ref.to) {
          const label = LONG_ARGS.exec(doc.slice(args.from, args.to))?.[1]
          if (label && RESERVED_PREFIX.test(label))
            out.push({ from: ref.from, to: ref.to, label, supplement: null, long: true })
        }
        return undefined
      }
      if (SKIP.has(ref.name)) return false
      if (ref.name !== 'Ref') return undefined
      const supplement = ref.node.getChild('Supplement')
      const label = doc.slice(ref.from + 1, supplement ? supplement.from : ref.to)
      if (!RESERVED_PREFIX.test(label)) return false
      out.push({
        from: ref.from,
        to: ref.to,
        label,
        supplement: supplement ? doc.slice(supplement.from + 1, supplement.to - 1) : null,
        long: false,
      })
      return false
    },
  })
  return out
}

export const crossRefAt = (refs: readonly CrossRef[], pos: number): CrossRef | undefined =>
  refs.find((r) => r.from <= pos && pos <= r.to)

// --- numbering ------------------------------------------------------------------------------------

/** A sheet and what can be referenced in it, as the sheet statistics carry it. */
export interface SheetTargets {
  path: string
  inExport: boolean
  targets: readonly Target[]
}

export interface NumberedTarget extends Target {
  /** The sheet the target is in. */
  path: string
  /** Its place among the targets of the sheet, for telling apart things without a label. */
  index: number
  /** "3", "1.2", "II.3" (as the template numbers), or "" for a heading the template does not number and for a sheet that is not in the export. */
  number: string
  inExport: boolean
}

/** Numbers every target across the sheets: only the sheets in the export count, in the order given. */
export function numberTargets(
  sheets: readonly SheetTargets[],
  numbering: HeadingNumbering = DEFAULT_HEADING_NUMBERING,
): NumberedTarget[] {
  const out: NumberedTarget[] = []
  const counts: Record<Exclude<TargetKind, 'sec'>, number> = { fig: 0, tbl: 0, eq: 0 }
  const headings: number[] = []
  for (const sheet of sheets) {
    sheet.targets.forEach((target, index) => {
      let number = ''
      if (sheet.inExport) {
        if (target.kind === 'sec') {
          const depth = Math.max(1, target.level)
          while (headings.length < depth) headings.push(0)
          headings.length = depth
          headings[depth - 1]! += 1
          number = formatHeadingNumber(headings, numbering)
        } else number = String((counts[target.kind] += 1))
      }
      out.push({ ...target, path: sheet.path, index, number, inExport: sheet.inExport })
    })
  }
  return out
}

/**
 * `numbered` (from `numberTargets`) after the targets of the sheet at `path` changed from `before`
 * to `after`. Only that sheet's entries are made anew, with the numbers they had. Null when the
 * numbers may change: a target was added or removed, or changed its kind or heading level.
 * Typing moves targets and changes titles, so this spares numbering the whole project each time.
 */
export function replaceSheetTargets(
  numbered: readonly NumberedTarget[],
  path: string,
  before: readonly Target[],
  after: readonly Target[],
): readonly NumberedTarget[] | null {
  if (before.length !== after.length) return null
  if (after.some((t, i) => t.kind !== before[i]!.kind || t.level !== before[i]!.level)) return null
  const start = numbered.findIndex((t) => t.path === path)
  if (start < 0) return numbered // the sheet is not numbered with the project
  const out = numbered.slice()
  after.forEach((target, index) => {
    const { number, inExport } = out[start + index]!
    out[start + index] = { ...target, path, index, number, inExport }
  })
  return out
}

/** The words before the number, in the language of the text (Typst's own for German and English). */
export interface Supplements {
  /** The quotation marks around a heading that has no number to be named by. */
  quotes?: readonly [string, string]
  sec: string
  fig: string
  tbl: string
  eq: string
}

export function supplementsFor(language: string): Supplements {
  return language.toLowerCase().startsWith('de')
    ? { quotes: ['„', '“'], sec: 'Abschnitt', fig: 'Abbildung', tbl: 'Tabelle', eq: 'Gleichung' }
    : { quotes: ['“', '”'], sec: 'Section', fig: 'Figure', tbl: 'Table', eq: 'Equation' }
}

/**
 * What a reference prints in the PDF: "Abbildung 3", "Gleichung (2)", "Abschnitt 1.2". A heading
 * the template does not number is named by its title in quotation marks.
 */
export function referenceText(
  target: Pick<NumberedTarget, 'kind' | 'number'> & { title?: string; inExport?: boolean },
  supplements: Supplements,
): string {
  if (target.kind === 'sec' && target.number === '' && target.inExport !== false && target.title) {
    const [open, close] = supplements.quotes ?? ['“', '”']
    return `${open}${target.title}${close}`
  }
  const number = target.kind === 'eq' ? `(${target.number})` : target.number
  return `${supplements[target.kind]} ${number}`
}

/** The target with the label, if any sheet has it. */
export const findTarget = (
  targets: readonly NumberedTarget[],
  label: string,
): NumberedTarget | undefined => targets.find((t) => t.label === label)

// --- labels ---------------------------------------------------------------------------------------

const TRANSLITERATE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }
const FALLBACK: Record<TargetKind, string> = {
  sec: 'abschnitt',
  fig: 'bild',
  tbl: 'tabelle',
  eq: 'gleichung',
}

/** A label for a target, like `sec-methoden`, that is not in `taken`. */
export function newLabel(kind: TargetKind, title: string, taken: ReadonlySet<string>): string {
  const ascii = title
    .toLowerCase()
    .replace(/[äöüß]/g, (ch) => TRANSLITERATE[ch]!)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const words = ascii.match(/[a-z0-9]+/g) ?? []
  let slug = ''
  for (const word of words) {
    if (slug.length + word.length + 1 > 32 && slug !== '') break
    slug = slug === '' ? word : `${slug}-${word}`
  }
  const base = `${kind}-${slug || FALLBACK[kind]}`
  let label = base
  for (let n = 2; taken.has(label); n += 1) label = `${base}-${n}`
  return label
}

/** The target as the sheet statistics carry it, and back. */
export const toTuple = (t: Target): SheetTarget => [
  t.kind,
  t.label ?? '',
  t.level,
  t.title,
  t.at,
  t.labelAt,
]
export const fromTuple = ([kind, label, level, title, at, labelAt]: SheetTarget): Target => ({
  kind,
  label: label === '' ? null : label,
  level,
  title,
  at,
  labelAt,
})

/** Every label written in the text, for choosing a new one that is free. */
export const labelsIn = (doc: string): Set<string> =>
  new Set([...doc.matchAll(/<([\p{L}\p{N}_:.-]+)>/gu)].map((m) => m[1]!))

/** The edit that gives a target its label. */
export function labelEdit(target: Pick<Target, 'labelAt'>, label: string): TextEdit {
  return { from: target.labelAt, to: target.labelAt, insert: ` <${label}>` }
}

/** True if the text right after `to` would be read as part of a reference ending there. */
function joins(doc: string, to: number): boolean {
  const next = doc[to]
  if (next === undefined) return false
  if (/[\p{L}\p{N}_-]/u.test(next)) return true
  if ((next === ':' || next === '.') && /[\p{L}\p{N}_-]/u.test(doc[to + 1] ?? '')) return true
  return next === '['
}

/** The source of a reference: `@label`, or `#ref(<label>)` where text after it would join the label. */
export function crossRefSource(label: string, following = ''): string {
  return joins(following, 0) ? `#ref(<${label}>)` : `@${label}`
}
