/**
 * The thesaurus is read from files in the MyThes format that LibreOffice uses
 * (OpenThesaurus for German, WordNet for English): a line `headword|n`, then n lines, one per
 * sense: `(part of speech)|synonym|synonym (note)|…`. German entries have `-` for the part of
 * speech. This module reads one entry and cleans the synonyms; finding the entry in a large file
 * is the main process's job.
 */

export type SynonymKind =
  /** An ordinary synonym, or the main form. */
  'synonym' | 'broader' | 'narrower' | 'related' | 'opposite'

export interface Synonym {
  /** The word or phrase, without notes. */
  text: string
  /** Usage notes the thesaurus gives, for example "ugs." or "fachspr.". */
  note: string | null
  kind: SynonymKind
  /** OpenThesaurus marks the main form of a sense. */
  main: boolean
}

export interface Sense {
  /** "noun", "verb", "adj", "adv" for English; null where the file has none ("-"). */
  pos: string | null
  synonyms: Synonym[]
}

const STRUCTURE: Record<string, SynonymKind> = {
  oberbegriff: 'broader',
  'generic term': 'broader',
  unterbegriff: 'narrower',
  'specific term': 'narrower',
  'related term': 'related',
  'similar term': 'synonym',
  antonym: 'opposite',
  gegenwort: 'opposite',
}

/** Words that mark how a word is used, besides the ones that end in a full stop (ugs., fachspr.). */
const USAGE = new Set([
  'salopp',
  'veraltet',
  'umgangssprachlich',
  'derb',
  'vulgär',
  'ironisch',
  'scherzhaft',
  'abwertend',
  'gehoben',
  'poetisch',
  'selten',
  'regional',
  'Jugendsprache',
  'Fachsprache',
  'formal',
  'informal',
  'slang',
])

const TRAILING = /\s+\(([^()]*)\)\s*$/

/** One synonym as written in the file: "Wort (ugs.) (Oberbegriff)". */
export function parseSynonym(raw: string): Synonym {
  let text = raw.trim()
  const notes: string[] = []
  let kind: SynonymKind = 'synonym'
  let main = false
  for (;;) {
    const match = TRAILING.exec(text)
    if (!match) break
    const label = match[1]!.trim()
    const structural = STRUCTURE[label.toLowerCase()]
    if (structural) kind = structural
    else if (label === 'Hauptform') main = true
    else if (/^[\p{L}][\p{L}.\- ]*\.$/u.test(label) || USAGE.has(label)) notes.unshift(label)
    else break // "Argumente finden (für)": part of the phrase
    text = text.slice(0, match.index).trim()
  }
  return { text, note: notes.length > 0 ? notes.join(', ') : null, kind, main }
}

/** The senses of an entry: the block of text from its headword line to the next one. */
export function parseEntry(block: string): { word: string; senses: Sense[] } | null {
  const lines = block.split(/\r?\n/)
  const head = /^(.*)\|(\d+)$/.exec(lines[0] ?? '')
  if (!head) return null
  const count = Number(head[2])
  const senses: Sense[] = []
  for (let i = 1; i <= count && i < lines.length; i += 1) {
    const parts = lines[i]!.split('|')
    const label = (parts[0] ?? '').replace(/^\((.*)\)$/, '$1').trim()
    senses.push({
      pos: label === '-' || label === '' ? null : label,
      synonyms: parts
        .slice(1)
        .map(parseSynonym)
        .filter((s) => s.text !== ''),
    })
  }
  return { word: head[1]!, senses }
}

/** The headwords to try for a base form: as written, lower case, and with a capital. */
export function headwordKeys(lemma: string): string[] {
  const lower = lemma.toLocaleLowerCase()
  const capital = lower.charAt(0).toLocaleUpperCase() + lower.slice(1)
  return [...new Set([lemma, lower, capital])]
}
