import type { BibEntry } from './bibtex'

/**
 * The list of works cited in a scope: which works, how often, and where, computed from
 * what each sheet reports. Pure, so it is tested without the editor.
 */

/** What one sheet cites: the works with where they start, and the markers. */
export interface SheetCitations {
  path: string
  citations: readonly (readonly [key: string, at: number])[]
  missing: readonly number[]
  checks: readonly number[]
}

/** One place in a sheet. */
export interface Use {
  path: string
  at: number
}

export interface WorkRow {
  key: string
  /** The work, or null when the key is not in the bibliography. */
  entry: BibEntry | null
  /** How often it is cited. */
  count: number
  uses: Use[]
}

export interface Literature {
  works: WorkRow[]
  /** Places that still need a citation, and citations to check, in the order of the sheets. */
  missing: Use[]
  checks: Use[]
  /** Citations in all: the sum of the counts. */
  total: number
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })

/** What a work is sorted by: the first author or editor, the year, the title. */
function sortKey(entry: BibEntry): string {
  const name = (entry.authors[0] ?? entry.editors[0])?.family ?? entry.title ?? entry.key
  return `${name}\u0000${entry.year ?? ''}\u0000${entry.title ?? ''}`
}

/**
 * Groups the citations of the sheets (given in the order of the project) by work. Works in the
 * bibliography come alphabetically; keys that are not in it come after them, so a broken key is
 * easy to find. Each work lists its uses in the order of the text.
 */
export function summarizeLiterature(
  sheets: readonly SheetCitations[],
  lookup: (key: string) => BibEntry | undefined,
): Literature {
  const byKey = new Map<string, Use[]>()
  const missing: Use[] = []
  const checks: Use[] = []
  for (const sheet of sheets) {
    for (const [key, at] of sheet.citations) {
      const uses = byKey.get(key) ?? []
      uses.push({ path: sheet.path, at })
      byKey.set(key, uses)
    }
    for (const at of sheet.missing) missing.push({ path: sheet.path, at })
    for (const at of sheet.checks) checks.push({ path: sheet.path, at })
  }
  const rows: WorkRow[] = [...byKey].map(([key, uses]) => ({
    key,
    entry: lookup(key) ?? null,
    count: uses.length,
    uses,
  }))
  rows.sort((a, b) => {
    if (a.entry && !b.entry) return -1
    if (!a.entry && b.entry) return 1
    return a.entry && b.entry
      ? collator.compare(sortKey(a.entry), sortKey(b.entry))
      : collator.compare(a.key, b.key)
  })
  return { works: rows, missing, checks, total: rows.reduce((sum, row) => sum + row.count, 0) }
}

/**
 * The text around a place, in one line, for the list of uses: the surroundings of `at` in the
 * line it is in, cut to `width` characters on each side and with white space made single.
 */
export function contextAround(text: string, at: number, width = 48): string {
  const lineStart = text.lastIndexOf('\n', at - 1) + 1
  const newline = text.indexOf('\n', at)
  const lineEnd = newline < 0 ? text.length : newline
  const from = Math.max(lineStart, at - width)
  const to = Math.min(lineEnd, at + width)
  const window = text.slice(from, to).replace(/\s+/g, ' ').trim()
  return `${from > lineStart ? '…' : ''}${window}${to < lineEnd ? '…' : ''}`
}

/** The 1-based line number of a position. */
export function lineOf(text: string, at: number): number {
  let line = 1
  for (let i = text.indexOf('\n'); i >= 0 && i < at; i = text.indexOf('\n', i + 1)) line += 1
  return line
}
