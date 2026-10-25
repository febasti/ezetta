import type { BibEntry } from './bibtex'

/**
 * The text of a citation chip in the editor: readable and short, such as "Smith 2020" or
 * "Smith et al. 2020, S. 14". It is a working view, not the export's formatting: Typst formats the
 * PDF with the project's CSL style, which may put citations in footnotes or numbers.
 */

export type CiteForm = 'normal' | 'prose' | 'year' | 'author' | 'none'

/** The forms the editor knows. Any other `form:` is kept in the file and shown like the normal one. */
export const CITE_FORMS: readonly CiteForm[] = ['normal', 'prose', 'year', 'author', 'none']

const WORDS = {
  de: { and: 'und', etAl: 'et al.', noYear: 'o. J.' },
  en: { and: 'and', etAl: 'et al.', noYear: 'n.d.' },
}

/**
 * True if the PDF prints the citation in brackets, "(Smith, 2020)": the normal form, and any form the
 * editor does not know (shown like the normal one). Prose ("Smith (2020)"), year, author and none
 * carry their own brackets or none.
 */
export function isParenthetical(form: string | null | undefined): boolean {
  return !form || !CITE_FORMS.includes(form as CiteForm) || form === 'normal'
}

/** The author part: one name, two with "and", three or more with "et al."; failing that the editors or the title. */
export function authorText(entry: BibEntry, language: string): string {
  const words = language.startsWith('de') ? WORDS.de : WORDS.en
  const names = entry.authors.length > 0 ? entry.authors : entry.editors
  if (names.length === 0) {
    const title = entry.title ?? entry.key
    return title.length > 32 ? `${title.slice(0, 31).trimEnd()}…` : title
  }
  if (names.length === 1) return entry.etAl ? `${names[0]!.family} ${words.etAl}` : names[0]!.family
  if (names.length === 2 && !entry.etAl)
    return `${names[0]!.family} ${words.and} ${names[1]!.family}`
  return `${names[0]!.family} ${words.etAl}`
}

export function yearText(entry: BibEntry, language: string): string {
  return entry.year ?? (language.startsWith('de') ? WORDS.de.noYear : WORDS.en.noYear)
}

/** The chip's text for a work found in the library. (`none` prints nothing in the PDF, but the chip still names the work.) */
export function chipText(
  entry: BibEntry,
  options: { language: string; form?: string | null; supplement?: string | null },
): string {
  const author = authorText(entry, options.language)
  const year = yearText(entry, options.language)
  const supplement = options.supplement?.trim()
  const tail = supplement ? `, ${supplement}` : ''
  switch (options.form) {
    case 'prose':
      return `${author} (${year}${tail})`
    case 'year':
      return `${year}${tail}`
    case 'author':
      return `${author}${tail}`
    default:
      return `${author} ${year}${tail}`
  }
}

/** What a tooltip says about a work, in full: every author, the year, the whole title, where it appeared. */
export function entryDetail(
  entry: BibEntry,
  language: string,
): { authors: string; year: string; title: string; container: string } {
  const words = language.startsWith('de') ? WORDS.de : WORDS.en
  const name = (n: BibEntry['authors'][number]): string =>
    n.literal || !n.given ? n.family : `${n.family}, ${n.given}`
  const people = entry.authors.length > 0 ? entry.authors : entry.editors
  const list = people.map(name).join('; ') + (entry.etAl ? ` ${words.etAl}` : '')
  const editors = entry.authors.length === 0 && entry.editors.length > 0
  return {
    authors: editors ? `${list} (${language.startsWith('de') ? 'Hrsg.' : 'ed.'})` : list,
    year: yearText(entry, language),
    title: entry.title ?? entry.key,
    container: entry.container ?? '',
  }
}

/** The line that tells a work apart in a list or a tooltip: authors, year, title. */
export function entryLine(entry: BibEntry, language: string): string {
  const title = entry.title ?? ''
  return `${authorText(entry, language)} ${yearText(entry, language)}${title ? ` – ${title}` : ''}`
}

/** True if the entry matches every word of the query in its key, authors, year, title, or source. */
export function matchesQuery(entry: BibEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [
    entry.key,
    ...entry.authors.map((a) => `${a.family} ${a.given}`),
    ...entry.editors.map((a) => `${a.family} ${a.given}`),
    entry.year ?? '',
    entry.title ?? '',
    entry.container ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}
