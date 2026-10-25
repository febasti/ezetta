/**
 * A tolerant reader for BibTeX and BibLaTeX files, as exported by Zotero with Better
 * BibTeX. It reads what the editor needs to show and find a work (key, authors, year, title) and
 * never throws: a damaged entry is skipped and reported, the rest still loads.
 */

export interface BibName {
  family: string
  given: string
  /** A name that is not a person's, such as an institution: `{World Health Organization}`. */
  literal: boolean
}

export interface BibEntry {
  key: string
  type: string
  authors: BibName[]
  editors: BibName[]
  /** The list ended with "and others". */
  etAl: boolean
  year: string | null
  title: string | null
  /** The journal, book, or publisher: where the work appeared. */
  container: string | null
  /** What a full reference needs beyond that, each field only when the file has it. */
  details?: BibDetails
}

/** The fields of a full reference: where and how a work was published, and where to find it. */
export interface BibDetails {
  journal?: string
  /** The book a chapter or a paper is in. */
  booktitle?: string
  publisher?: string
  place?: string
  volume?: string
  number?: string
  pages?: string
  edition?: string
  /** The university of a thesis, or the institution of a report. */
  school?: string
  doi?: string
  url?: string
}

export interface BibLibrary {
  entries: BibEntry[]
  /** Short, readable notes on what could not be read, with line numbers. */
  problems: string[]
}

const ACCENTS: Record<string, string> = {
  '"': '̈',
  "'": '́',
  '`': '̀',
  '^': '̂',
  '~': '̃',
  '=': '̄',
  '.': '̇',
  u: '̆',
  v: '̌',
  H: '̋',
  c: '̧',
  k: '̨',
  r: '̊',
  d: '̣',
  b: '̱',
}
const LETTERS: Record<string, string> = {
  ss: 'ß',
  o: 'ø',
  O: 'Ø',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  aa: 'å',
  AA: 'Å',
  l: 'ł',
  L: 'Ł',
  i: 'i',
  j: 'j',
  dh: 'ð',
  DH: 'Ð',
  th: 'þ',
  TH: 'Þ',
}

/** LaTeX in a field value to plain Unicode text: accents, dashes, and braces that protect case. */
export function latexToText(raw: string): string {
  let out = ''
  let i = 0
  const n = raw.length
  // Reads a braced group or a single character after a command; returns its text.
  const argument = (): string => {
    while (i < n && raw[i] === ' ') i += 1
    if (raw[i] === '{') {
      let depth = 0
      const start = i + 1
      for (; i < n; i += 1) {
        if (raw[i] === '\\') i += 1
        else if (raw[i] === '{') depth += 1
        else if (raw[i] === '}' && --depth === 0) break
      }
      const inner = raw.slice(start, i)
      i += 1
      return latexToText(inner)
    }
    if (raw[i] === '\\') {
      const word = /^\\([a-zA-Z]+)/.exec(raw.slice(i))
      if (word) {
        i += word[0].length
        return LETTERS[word[1]!] ?? ''
      }
    }
    return raw[i++] ?? ''
  }
  while (i < n) {
    const ch = raw[i]!
    if (ch === '\\') {
      const next = raw[i + 1] ?? ''
      if (/[a-zA-Z]/.test(next)) {
        const word = /^[a-zA-Z]+/.exec(raw.slice(i + 1))![0]
        const accent = word.length === 1 ? ACCENTS[word] : undefined
        i += 1 + word.length
        if (accent) out += argument() + accent
        else if (word in LETTERS) {
          out += LETTERS[word]
          if (raw[i] === '{' && raw[i + 1] === '}') i += 2
          else if (raw[i] === ' ') i += 1
        } else if (word === 'textendash') out += '–'
        else if (word === 'textemdash') out += '—'
        else if (raw[i] === '{')
          out += argument() // \emph{text}, \textit{text}: keep the text
        else if (raw[i] === ' ') i += 1
      } else if (ACCENTS[next]) {
        i += 2
        out += argument() + ACCENTS[next]
      } else if (next === ' ' || next === '') {
        out += ' '
        i += 2
      } else {
        out += next // \& \% \_ \$ \# \{ \}
        i += 2
      }
    } else if (ch === '{' || ch === '}') {
      i += 1
    } else if (ch === '~') {
      out += ' '
      i += 1
    } else if (ch === '-' && raw.startsWith('---', i)) {
      out += '—'
      i += 3
    } else if (ch === '-' && raw.startsWith('--', i)) {
      out += '–'
      i += 2
    } else {
      out += ch
      i += 1
    }
  }
  return out.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Splits at a separator that is not inside braces (or, with `quotes`, double quotes). */
function splitTopLevel(text: string, separator: RegExp, quotes = false): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') i += 1
    else if (ch === '{') depth += 1
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (quotes && ch === '"' && depth === 0) quoted = !quoted
    else if (depth === 0 && !quoted) {
      const rest = text.slice(i)
      const match = separator.exec(rest)
      if (match && match.index === 0) {
        parts.push(text.slice(start, i))
        i += match[0].length - 1
        start = i + 1
      }
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** True if the first brace closes at the very end: `{A B}` but not `{A} {B}`. */
function wholeBraced(text: string): boolean {
  if (text[0] !== '{') return false
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === '{') depth += 1
    else if (text[i] === '}' && --depth === 0) return i === text.length - 1
  }
  return false
}

/** One person: "Last, First", "Last, Jr, First", or "First von Last"; a braced name is an institution. */
export function parseName(raw: string): BibName | null {
  const text = raw.trim()
  if (text === '') return null
  // `{World Health Organization}`: one braced group around everything is an institution.
  if (wholeBraced(text)) return { family: latexToText(text.slice(1, -1)), given: '', literal: true }
  const commas = splitTopLevel(text, /^,/)
  if (commas.length >= 2) {
    return {
      family: latexToText(commas[0]!),
      given: latexToText(commas[commas.length - 1]!),
      literal: false,
    }
  }
  const words = splitTopLevel(text, /^\s+/).filter((w) => w !== '')
  if (words.length === 1) return { family: latexToText(words[0]!), given: '', literal: false }
  // The family name is the last word and the lowercase particles before it ("van", "de la").
  let split = words.length - 1
  while (split > 1 && /^[a-zß-ÿ]/.test(words[split - 1]!)) split -= 1
  return {
    family: latexToText(words.slice(split).join(' ')),
    given: latexToText(words.slice(0, split).join(' ')),
    literal: false,
  }
}

function parseNames(value: string | undefined): { names: BibName[]; etAl: boolean } {
  if (!value) return { names: [], etAl: false }
  const parts = splitTopLevel(value, /^\s+and\s+/i).map((p) => p.trim())
  const etAl = parts.at(-1)?.toLowerCase() === 'others'
  const names = (etAl ? parts.slice(0, -1) : parts)
    .map(parseName)
    .filter((n): n is BibName => n !== null)
  return { names, etAl }
}

/** Reads the whole file. */
export function parseBibtex(text: string): BibLibrary {
  const entries: BibEntry[] = []
  const problems: string[] = []
  const macros = new Map<string, string>()
  const seen = new Set<string>()
  const lineOf = (pos: number): number => {
    let line = 1
    for (let i = text.indexOf('\n'); i >= 0 && i < pos; i = text.indexOf('\n', i + 1)) line += 1
    return line
  }

  let pos = 0
  while (pos < text.length) {
    const at = text.indexOf('@', pos)
    if (at < 0) break
    const head = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(at, at + 80))
    if (!head) {
      pos = at + 1
      continue
    }
    const type = head[1]!.toLowerCase()
    const open = head[2]!
    const bodyStart = at + head[0].length
    const body = readBody(text, bodyStart, open === '{' ? '}' : ')')
    if (body === null) {
      problems.push(`Line ${lineOf(at)}: the entry is not closed`)
      pos = bodyStart
      continue
    }
    pos = body.end
    if (type === 'comment' || type === 'preamble') continue
    if (type === 'string') {
      const [name, ...rest] = splitTopLevel(body.text, /^=/)
      if (name && rest.length > 0)
        macros.set(name.trim().toLowerCase(), valueOf(rest.join('='), macros))
      continue
    }
    const comma = body.text.indexOf(',')
    const key = (comma < 0 ? body.text : body.text.slice(0, comma)).trim()
    if (key === '' || /\s/.test(key)) {
      problems.push(`Line ${lineOf(at)}: the entry has no key`)
      continue
    }
    if (seen.has(key)) {
      problems.push(`Line ${lineOf(at)}: the key "${key}" is used twice`)
      continue
    }
    seen.add(key)
    entries.push(entryOf(key, type, comma < 0 ? '' : body.text.slice(comma + 1), macros))
  }
  return { entries, problems }
}

/** An entry of the file as it is written: its type, its key (null for `@string` and the like), and its text. */
export interface RawEntry {
  type: string
  key: string | null
  /** The whole entry, from the `@` to the closing bracket. */
  source: string
  /** What is between the brackets: the key and the fields. */
  body: string
}

/**
 * The entries of the file as they are written, without reading their fields: for handing a clean
 * copy of the file to the compiler. An entry that is not closed is left out, as in `parseBibtex`.
 */
export function rawEntries(text: string): RawEntry[] {
  const out: RawEntry[] = []
  let pos = 0
  while (pos < text.length) {
    const at = text.indexOf('@', pos)
    if (at < 0) break
    const head = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(at, at + 80))
    if (!head) {
      pos = at + 1
      continue
    }
    const type = head[1]!.toLowerCase()
    const bodyStart = at + head[0].length
    const body = readBody(text, bodyStart, head[2] === '{' ? '}' : ')')
    if (body === null) {
      pos = bodyStart
      continue
    }
    pos = body.end
    const comma = body.text.indexOf(',')
    const key =
      type === 'string' || type === 'comment' || type === 'preamble'
        ? null
        : (comma < 0 ? body.text : body.text.slice(0, comma)).trim() || null
    out.push({ type, key, source: text.slice(at, body.end), body: body.text })
  }
  return out
}

/** The text up to the closing bracket that matches the opening one, with braces and quotes respected. */
function readBody(
  text: string,
  start: number,
  close: string,
): { text: string; end: number } | null {
  let depth = 0
  let quoted = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') i += 1
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      if (depth === 0 && close === '}') return { text: text.slice(start, i), end: i + 1 }
      depth = Math.max(0, depth - 1)
    } else if (ch === '"' && depth === 0) quoted = !quoted
    else if (ch === ')' && close === ')' && depth === 0 && !quoted)
      return { text: text.slice(start, i), end: i + 1 }
  }
  return null
}

/** A field value: braced, quoted, a number, or a macro, joined by `#`. */
function valueOf(raw: string, macros: Map<string, string>): string {
  return splitTopLevel(raw, /^#/)
    .map((piece) => {
      const p = piece.trim()
      if (p.startsWith('{') && p.endsWith('}')) return p.slice(1, -1)
      if (p.startsWith('"') && p.endsWith('"') && p.length >= 2) return p.slice(1, -1)
      return macros.get(p.toLowerCase()) ?? p // a macro, or a bare number
    })
    .join('')
}

function fieldsOf(body: string, macros: Map<string, string>): Map<string, string> {
  const fields = new Map<string, string>()
  for (const part of splitTopLevel(body, /^,/, true)) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const name = part.slice(0, eq).trim().toLowerCase()
    if (name === '' || fields.has(name)) continue
    fields.set(name, valueOf(part.slice(eq + 1), macros))
  }
  return fields
}

function entryOf(key: string, type: string, body: string, macros: Map<string, string>): BibEntry {
  const fields = fieldsOf(body, macros)
  const text = (...names: string[]): string | null => {
    for (const name of names) {
      const value = fields.get(name)
      if (value) {
        const clean = latexToText(value)
        if (clean !== '') return clean
      }
    }
    return null
  }
  const authors = parseNames(fields.get('author'))
  const editors = parseNames(fields.get('editor'))
  const organization = text('organization', 'institution')
  const rawYear = text('year') ?? text('date')
  const year = rawYear ? (/\d{4}/.exec(rawYear)?.[0] ?? rawYear) : null
  return {
    key,
    type,
    authors:
      authors.names.length > 0 || !organization
        ? authors.names
        : [{ family: organization, given: '', literal: true }],
    editors: editors.names,
    etAl: authors.names.length > 0 ? authors.etAl : editors.etAl,
    year,
    title: text('title'),
    container: text('journaltitle', 'journal', 'booktitle', 'publisher'),
    details: detailsOf(fields),
  }
}

/** The fields of a full reference that the entry has; the DOI and URL as written, not as LaTeX. */
function detailsOf(fields: Map<string, string>): BibDetails | undefined {
  const text = (...names: string[]): string | undefined => {
    for (const name of names) {
      const value = fields.get(name)
      if (value) {
        const clean = latexToText(value).trim()
        if (clean !== '') return clean
      }
    }
    return undefined
  }
  const raw = (name: string): string | undefined => fields.get(name)?.trim() || undefined
  const all: BibDetails = {
    journal: text('journaltitle', 'journal'),
    booktitle: text('booktitle'),
    publisher: text('publisher'),
    place: text('location', 'address'),
    volume: text('volume'),
    number: text('number', 'issue'),
    pages: text('pages'),
    edition: text('edition'),
    school: text('school', 'institution'),
    doi: raw('doi'),
    url: raw('url'),
  }
  const present = Object.entries(all).filter(([, value]) => value !== undefined)
  return present.length > 0 ? (Object.fromEntries(present) as BibDetails) : undefined
}
