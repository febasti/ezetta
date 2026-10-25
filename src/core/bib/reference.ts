import type { BibEntry, BibName } from './bibtex'

/**
 * A work's full reference as a list of works shows it, in the manner of APA 7, the
 * export's default citation style: authors, year, title, and where and how it appeared, with the
 * parts a reference sets in italics marked. It is for reading in the app; the PDF's list of works is
 * made by the citation style the export uses.
 */

/** A piece of a reference: plain, in italics (a book's or a journal's title), or a link. */
export interface Piece {
  text: string
  italic?: boolean
  link?: boolean
}

const WORDS = {
  de: {
    and: '&',
    noYear: 'o. J.',
    eds: 'Hrsg.',
    ed: 'Hrsg.',
    in: 'In',
    pages: 'S.',
    edition: 'Aufl.',
    phd: 'Dissertation',
    master: 'Masterarbeit',
    thesis: 'Abschlussarbeit',
  },
  en: {
    and: '&',
    noYear: 'n.d.',
    eds: 'Eds.',
    ed: 'Ed.',
    in: 'In',
    pages: 'pp.',
    edition: 'ed.',
    phd: 'Doctoral dissertation',
    master: "Master's thesis",
    thesis: 'Thesis',
  },
}

/** "G. I." from "Gustav Ingo" (and "J.-P." from "Jean-Pierre"). */
function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .map((p) => (/^\p{L}/u.test(p) ? `${p[0]!.toUpperCase()}.` : p))
        .join('-'),
    )
    .join(' ')
}

/** "Family, G. I." as a reference's author is written; an institution as it is. */
function inverted(name: BibName): string {
  return name.literal || !name.given ? name.family : `${name.family}, ${initials(name.given)}`
}

/** "G. I. Family", as the editors of a book a chapter is in are written. */
function straight(name: BibName): string {
  return name.literal || !name.given ? name.family : `${initials(name.given)} ${name.family}`
}

/**
 * A list of names: "A, B, & C", with "et al." when the file said "and others". Authors, written
 * "Family, G.", keep the comma before "&" with two names too ("Jones, M., & Müller, J."); editors
 * after "In", written "G. Family", have none ("P. Klein & E. Groß"), as APA 7 has it.
 */
function names(
  list: BibName[],
  form: (name: BibName) => string,
  etAl: boolean,
  and: string,
): string {
  const written = list.map(form)
  if (etAl) return `${written.join(', ')} et al.`
  if (written.length <= 1) return written.join('')
  if (written.length === 2)
    return `${written[0]}${form === inverted ? ',' : ''} ${and} ${written[1]}`
  return `${written.slice(0, -1).join(', ')}, ${and} ${written.at(-1)}`
}

/** A sentence ends with one full stop: none is added after "?", "!" or a stop already there. */
const stop = (text: string): string => (/[.?!]$/.test(text) ? text : `${text}.`)

/** Pages with an en dash between them: "45–67". */
const pageRange = (pages: string): string => pages.replace(/\s*[-–]+\s*/g, '–')

/** "2. Aufl." from "2" (or "2nd ed."); an edition given in words stays as it is. */
function edition(value: string, language: 'de' | 'en'): string {
  const n = /^(\d+)\.?$/.exec(value.trim())?.[1]
  if (!n) return value
  if (language === 'de') return `${n}. ${WORDS.de.edition}`
  const last = Number(n) % 10
  const suffix =
    Number(n) % 100 >= 11 && Number(n) % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][last] ?? 'th')
  return `${n}${suffix} ${WORDS.en.edition}`
}

/** The full reference of a work, in pieces (see `Piece`), in the language of the project. */
export function referencePieces(entry: BibEntry, languageTag: string): Piece[] {
  const language: 'de' | 'en' = languageTag.startsWith('de') ? 'de' : 'en'
  const words = WORDS[language]
  const d = entry.details ?? {}
  const out: Piece[] = []
  const plain = (text: string): void => void out.push({ text })
  const italic = (text: string): void => void out.push({ text, italic: true })

  const type = entry.type
  const isArticle = type === 'article' || (!!d.journal && !d.booktitle)
  const isChapter =
    ['incollection', 'inproceedings', 'inbook', 'conference'].includes(type) ||
    (!!d.booktitle && !isArticle)
  const isThesis = ['phdthesis', 'mastersthesis', 'thesis'].includes(type)
  const isReport = ['techreport', 'report'].includes(type)
  // A book, a thesis, a report and a web page set their own title in italics; an article and a
  // chapter set the journal or the book they are in.
  const titleItalic = !isArticle && !isChapter

  // Who, and when. Without authors the editors stand there; without either, the title moves up.
  const year = entry.year ?? words.noYear
  const title = entry.title ?? entry.key
  let titleDone = false
  if (entry.authors.length > 0) {
    plain(`${stop(names(entry.authors, inverted, entry.etAl, words.and))} (${year}). `)
  } else if (entry.editors.length > 0 && !isChapter) {
    const label = entry.editors.length > 1 ? words.eds : words.ed
    plain(`${names(entry.editors, inverted, entry.etAl, words.and)} (${label}). (${year}). `)
  } else {
    if (titleItalic) italic(stop(title))
    else plain(stop(title))
    plain(` (${year}). `)
    titleDone = true
  }

  // What: the title, and for a book its edition, for a thesis what kind and where.
  if (!titleDone) {
    const extra: string[] = []
    if (d.edition && !isArticle && !isChapter) extra.push(edition(d.edition, language))
    if (isReport && d.number) extra.push(d.number)
    if (titleItalic) {
      italic(title)
      if (extra.length > 0) plain(` (${extra.join(', ')})`)
      if (isThesis) {
        const kind =
          type === 'phdthesis' ? words.phd : type === 'mastersthesis' ? words.master : words.thesis
        plain(` [${[kind, d.school].filter(Boolean).join(', ')}]`)
      }
      plain('. ')
    } else plain(`${stop(title)} `)
  }

  // Where it appeared.
  if (isArticle && (d.journal ?? entry.container)) {
    italic(d.journal ?? entry.container!)
    if (d.volume) {
      plain(', ')
      italic(d.volume)
      if (d.number) plain(`(${d.number})`)
    } else if (d.number) plain(`, (${d.number})`)
    if (d.pages) plain(`, ${pageRange(d.pages)}`)
    plain('. ')
  } else if (isChapter) {
    plain(`${words.in} `)
    if (entry.editors.length > 0) {
      const label = entry.editors.length > 1 ? words.eds : words.ed
      plain(`${names(entry.editors, straight, false, words.and)} (${label}), `)
    }
    italic(d.booktitle ?? entry.container ?? '')
    const extra: string[] = []
    if (d.edition) extra.push(edition(d.edition, language))
    if (d.pages) extra.push(`${words.pages} ${pageRange(d.pages)}`)
    if (extra.length > 0) plain(` (${extra.join(', ')})`)
    plain('. ')
    if (d.publisher) plain(`${stop(d.publisher)} `)
  } else {
    const by =
      d.publisher ??
      (isReport ? d.school : undefined) ??
      (isThesis ? undefined : (entry.container ?? undefined))
    if (by && by !== title) plain(`${stop(by)} `)
  }

  // Where to find it: the DOI as a link, else the URL.
  const doi = d.doi
    ? /^https?:\/\//.test(d.doi)
      ? d.doi
      : `https://doi.org/${d.doi.replace(/^doi:\s*/i, '')}`
    : undefined
  const link = doi ?? d.url
  if (link) out.push({ text: link, link: true })

  // Tidy: no space at the end, and adjacent plain pieces joined.
  const joined: Piece[] = []
  for (const piece of out) {
    const last = joined.at(-1)
    if (last && !last.italic && !last.link && !piece.italic && !piece.link) last.text += piece.text
    else joined.push({ ...piece })
  }
  const end = joined.at(-1)
  if (end) end.text = end.text.replace(/\s+$/, '')
  return joined.filter((piece) => piece.text !== '')
}

/** The full reference as plain text (for copying, and for screen readers). */
export function referenceText(entry: BibEntry, language: string): string {
  return referencePieces(entry, language)
    .map((piece) => piece.text)
    .join('')
}
