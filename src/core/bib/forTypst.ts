import { rawEntries } from './bibtex'

/**
 * The bibliography as the compiler gets it: a clean copy of the writer's file, which is
 * never changed itself. The compiler (Typst 0.13) gives up on the whole document for one flaw
 * anywhere in the file, while the editor reads around it; so the copy has
 *
 *  - only the works the export cites (and what they cross-reference), and the `@string` macros;
 *  - each key once (the first entry with it), and no entry that is not closed;
 *  - a year it can read: a `year` or `date` that is not a date ("circa 1900", "2020-13-45") becomes
 *    the four digits in it, or goes;
 *  - chapters and conference papers (`@incollection`, `@inproceedings`, `@conference`) as `@inbook`,
 *    because the compiler doubles the book's title of the first ("Handbuch: Handbuch") and gives the
 *    second the date of a talk ("2020, "); as `@inbook` both come out as the styles intend.
 */

const AS_INBOOK = new Set(['incollection', 'inproceedings', 'conference'])
/** A date as BibLaTeX writes it: a year, with a real month and day, or a range of such. */
const DAY = String.raw`\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?`
const DATE = new RegExp(`^${DAY}(?:/(?:${DAY})?)?$`)
/** A `year` or `date` field and its value: braced, quoted, or bare. */
const DATE_FIELD = /(^|,)(\s*)(year|date)(\s*=\s*)(\{[^{}]*\}|"[^"]*"|[^,{}"]+)/gi
/** The keys an entry names as its parent or its shared fields. */
const LINKS = /(?:^|,)\s*(?:crossref|xref|xdata)\s*=\s*[{"]?([^},"]+)/gi

const unwrap = (value: string): string =>
  value
    .trim()
    .replace(/^[{"]|[}"]$/g, '')
    .trim()

/** The fields of an entry with every date made one the compiler reads. */
function readableDates(body: string): string {
  return body.replace(
    DATE_FIELD,
    (whole, lead: string, space: string, name: string, eq: string, value: string) => {
      const text = unwrap(value)
      if (name.toLowerCase() === 'date' ? DATE.test(text) : /^\d{4}$/.test(text)) return whole
      const year = /\d{4}/.exec(text)?.[0]
      return year ? `${lead}${space}${name}${eq}{${year}}` : lead === ',' ? '' : lead
    },
  )
}

/** The copy for the compiler, of the works with these keys; null when none of them is in the file. */
export function bibliographyForTypst(text: string, cited: ReadonlySet<string>): string | null {
  const entries = rawEntries(text)
  const byKey = new Map<string, (typeof entries)[number]>()
  for (const entry of entries) if (entry.key && !byKey.has(entry.key)) byKey.set(entry.key, entry)

  // The cited works, and what they name as their parent, as far as it goes.
  const wanted = new Set<string>()
  const queue = [...cited].filter((key) => byKey.has(key))
  while (queue.length > 0) {
    const key = queue.pop()!
    if (wanted.has(key)) continue
    wanted.add(key)
    for (const match of byKey.get(key)!.body.matchAll(LINKS))
      for (const linked of match[1]!.split(',').map((k) => k.trim()))
        if (byKey.has(linked) && !wanted.has(linked)) queue.push(linked)
  }
  if (wanted.size === 0) return null

  const out: string[] = []
  for (const entry of entries) if (entry.type === 'string') out.push(entry.source)
  for (const [key, entry] of byKey) {
    if (!wanted.has(key)) continue
    const type = AS_INBOOK.has(entry.type) ? 'inbook' : entry.type
    out.push(`@${type}{${readableDates(entry.body)}}`)
  }
  return `${out.join('\n\n')}\n`
}
