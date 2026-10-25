import { headwordKeys } from './entry'
import type { Sense } from './entry'

/**
 * Synonyms for a word in its sentence, in the form the sentence needs. The thesaurus knows
 * base forms only, so the word is first reduced to its base form with its grammar (case, number,
 * tense, …) by a morphological analysis, the synonyms are looked up, and each one is inflected like
 * the word was. Where no analysis is available, the base form is all there is.
 */

export type Pos = 'noun' | 'verb' | 'adj' | 'adv'
export type ThesaurusLanguage = 'de' | 'en'
export type Gender = 'MAS' | 'FEM' | 'NEU'

/** A base form with the grammatical tag of the word as it stands in the text. */
export interface Reading {
  lemma: string
  tag: string
}
export interface Inflected {
  word: string
  byTag: Record<string, { form: string; gender?: string }[]>
}

/** The analysis of the language module, which lives in another process. Null: it is not there. */
export interface MorphPort {
  analyze(language: string, text: string, from: number, to: number): Promise<Reading[] | null>
  inflect(language: string, tags: string[], words: string[]): Promise<Inflected[] | null>
}

export interface ThesaurusPort {
  /** The senses of a headword, or null if the thesaurus has none (or is not installed). */
  entry(language: ThesaurusLanguage, headword: string): Promise<Sense[] | null>
}

export interface SynonymOption {
  /** What goes into the text. */
  text: string
  note: string | null
  /** The gender of a German noun when it is not the word's own (the article changes). */
  gender: Gender | null
}
export interface SynonymSense {
  options: SynonymOption[]
}
export interface SynonymGroup {
  lemma: string
  pos: Pos
  senses: SynonymSense[]
}

export type LookupResult =
  | { ok: true; word: string; groups: SynonymGroup[] }
  | { ok: false; reason: 'no_word' | 'not_found' }

export interface LookupRequest {
  /** The checker's language code, for example "de-DE"; the first two letters pick the thesaurus. */
  language: string
  text: string
  from: number
  to: number
}

const LIMIT = { groups: 3, senses: 8, options: 14, tags: 24 }
const WORD = /^\p{L}[\p{L}\p{M}'’-]{0,39}$/u

export function posOf(tag: string, language: ThesaurusLanguage): Pos | null {
  if (language === 'de') {
    const kind = tag.split(':')[0]
    if (kind === 'SUB') return 'noun'
    if (kind === 'VER') return 'verb'
    if (kind === 'ADJ' || kind === 'PA1' || kind === 'PA2') return 'adj'
    if (kind === 'ADV') return 'adv'
    return null
  }
  if (/^NNS?$/.test(tag)) return 'noun'
  if (/^VB[DGNPZ]?$/.test(tag)) return 'verb'
  if (/^JJ[RS]?$/.test(tag)) return 'adj'
  if (/^RB[RS]?$/.test(tag)) return 'adv'
  return null
}

/** A participle is inflected like an adjective: PA2:NOM:PLU:FEM:GRU:SOL:VER becomes ADJ:NOM:PLU:FEM:GRU:SOL. */
export function tagForInflection(tag: string): string {
  const parts = tag.split(':')
  return parts[0] === 'PA1' || parts[0] === 'PA2' ? ['ADJ', ...parts.slice(1, 6)].join(':') : tag
}

const GENDERS = new Set(['MAS', 'FEM', 'NEU'])
const genderOf = (tag: string): Gender | null => {
  const found = tag.split(':').find((part) => GENDERS.has(part))
  return (found as Gender | undefined) ?? null
}

const startsUpper = (word: string): boolean => {
  const first = word.charAt(0)
  return first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase()
}

const capitalize = (word: string): string => word.charAt(0).toLocaleUpperCase() + word.slice(1)

/** True if the word opens a sentence, where a capital says nothing about the word. */
function opensSentence(text: string, from: number): boolean {
  const before = text.slice(0, from).replace(/[\s"„“”‚‘’»«([]+$/u, '')
  return before === '' || /[.!?:]$/.test(before) || /\n\s*$/.test(text.slice(0, from))
}

interface Candidate {
  lemma: string
  pos: Pos
  tags: string[]
  genders: Set<Gender>
}

/** The readings worth looking up: one group for each base form and kind of word. */
function candidates(
  readings: Reading[],
  language: ThesaurusLanguage,
  word: string,
  text: string,
  from: number,
): Candidate[] {
  const groups = new Map<string, Candidate>()
  const capitalised = startsUpper(word)
  const openingWord = opensSentence(text, from)
  for (const reading of readings) {
    const pos = posOf(reading.tag, language)
    if (!pos) continue
    // In German a noun has a capital and nothing else has (but any word has one at the start of a sentence).
    if (language === 'de' && !openingWord && (pos === 'noun') !== capitalised) continue
    const key = `${reading.lemma}\u0000${pos}`
    const group = groups.get(key) ?? { lemma: reading.lemma, pos, tags: [], genders: new Set() }
    const tag = tagForInflection(reading.tag)
    if (!group.tags.includes(tag)) group.tags.push(tag)
    const gender = genderOf(reading.tag)
    if (gender && pos === 'noun') group.genders.add(gender)
    groups.set(key, group)
  }
  // The likelier kind of word first: a lower case word is mostly a verb, a capitalised one a noun.
  const rank: Pos[] = capitalised ? ['noun', 'verb', 'adj', 'adv'] : ['verb', 'noun', 'adj', 'adv']
  return [...groups.values()].sort((a, b) => rank.indexOf(a.pos) - rank.indexOf(b.pos))
}

/** The form that most of the readings agree on, and the gender it has when it is not the word's own. */
function chooseForm(
  entry: Inflected,
  tags: string[],
  pos: Pos,
  language: ThesaurusLanguage,
  own: Set<Gender>,
): { form: string; gender: Gender | null } | null {
  const votes = new Map<string, { weight: number; gender: Gender | null; order: number }>()
  const germanNoun = language === 'de' && pos === 'noun'
  for (const tag of tags) {
    const forms = (entry.byTag[tag] ?? []).filter(
      // A lower case "form" of a German noun is a verb used as one ("das Erklären").
      (f) => !germanNoun || startsUpper(f.form),
    )
    for (const f of forms) {
      const gender = (f.gender as Gender | undefined) ?? null
      const kept = votes.get(f.form)
      // A subjunctive is the less likely reading of a form that is also an indicative.
      const weight = (1 / forms.length) * (tag.includes(':KJ') ? 0.5 : 1)
      if (kept) kept.weight += weight
      else votes.set(f.form, { weight, gender, order: votes.size })
    }
  }
  if (votes.size === 0) return null
  const all = [...votes.entries()]
  // A noun of the word's own gender keeps the article; otherwise the other gender is said.
  const sameGender =
    germanNoun && own.size > 0 ? all.filter(([, v]) => v.gender && own.has(v.gender)) : []
  const pool = sameGender.length > 0 ? sameGender : all
  pool.sort((a, b) => b[1].weight - a[1].weight || a[1].order - b[1].order)
  const [form, best] = pool[0]!
  const changed = germanNoun && own.size > 0 && best.gender && !own.has(best.gender)
  return { form, gender: changed ? best.gender : null }
}

export async function lookupSynonyms(
  deps: { morph: MorphPort; thesaurus: ThesaurusPort },
  request: LookupRequest,
): Promise<LookupResult> {
  const { text, from, to } = request
  const word = text.slice(from, to)
  if (!WORD.test(word)) return { ok: false, reason: 'no_word' }
  const language: ThesaurusLanguage = request.language.toLowerCase().startsWith('de') ? 'de' : 'en'

  const readings = await deps.morph.analyze(request.language, text, from, to)
  // Without an analysis the word is taken to be in its base form.
  const found: Candidate[] =
    readings === null
      ? [{ lemma: word, pos: 'noun', tags: [], genders: new Set() }]
      : candidates(readings, language, word, text, from)

  const groups: SynonymGroup[] = []
  for (const candidate of found) {
    if (groups.length >= LIMIT.groups) break
    const group = await groupFor(deps, request, language, word, candidate, readings === null)
    if (group) groups.push(group)
  }
  return groups.length > 0 ? { ok: true, word, groups } : { ok: false, reason: 'not_found' }
}

async function groupFor(
  deps: { morph: MorphPort; thesaurus: ThesaurusPort },
  request: LookupRequest,
  language: ThesaurusLanguage,
  word: string,
  candidate: Candidate,
  withoutAnalysis: boolean,
): Promise<SynonymGroup | null> {
  let senses: Sense[] | null = null
  for (const key of headwordKeys(candidate.lemma)) {
    senses = await deps.thesaurus.entry(language, key)
    if (senses) break
  }
  if (!senses) return null
  // WordNet says what kind of word each sense is; OpenThesaurus does not.
  const kept = senses
    .filter((s) => s.pos === null || s.pos === candidate.pos)
    .slice(0, LIMIT.senses)
    .map((sense) => ({
      synonyms: sense.synonyms
        .filter(
          (s) =>
            s.kind === 'synonym' &&
            s.text.toLocaleLowerCase() !== candidate.lemma.toLocaleLowerCase(),
        )
        .sort((a, b) => Number(b.main) - Number(a.main))
        .slice(0, LIMIT.options * 2),
    }))
  const isBaseForm = word.toLocaleLowerCase() === candidate.lemma.toLocaleLowerCase()
  const phrase = (text: string): boolean => /\s/.test(text)

  // Inflect the single words like the word in the text. A phrase cannot be, so it is offered only
  // where the word is in its base form anyway.
  let inflected = new Map<string, Inflected>()
  if (!withoutAnalysis && candidate.tags.length > 0) {
    const words = [
      ...new Set(kept.flatMap((s) => s.synonyms.map((x) => x.text)).filter((t) => !phrase(t))),
    ]
    const tags = candidate.tags.slice(0, LIMIT.tags)
    const answer = words.length > 0 ? await deps.morph.inflect(request.language, tags, words) : []
    if (answer === null) return null
    inflected = new Map(answer.map((r) => [r.word, r]))
  }

  const tags = candidate.tags.slice(0, LIMIT.tags)
  const plural = tags.length > 0 && tags.every((t) => t.split(':').includes('PLU'))
  const capital = startsUpper(word)
  const out: SynonymSense[] = []
  const used = new Set<string>()
  for (const sense of kept) {
    const options: SynonymOption[] = []
    for (const synonym of sense.synonyms) {
      let text: string
      let gender: Gender | null = null
      if (phrase(synonym.text) || withoutAnalysis || candidate.tags.length === 0) {
        if (phrase(synonym.text) && !isBaseForm && !withoutAnalysis) continue
        text = synonym.text
      } else {
        const entry = inflected.get(synonym.text)
        const chosen = entry
          ? chooseForm(entry, tags, candidate.pos, language, candidate.genders)
          : null
        if (!chosen) continue
        text = chosen.form
        // The article only matters in the singular.
        gender = plural ? null : chosen.gender
      }
      // A capital at the start of a sentence stays; elsewhere the word's own case is the form's.
      if (capital && !startsUpper(text) && !(language === 'de' && candidate.pos === 'noun'))
        text = capitalize(text)
      if (
        used.has(text.toLocaleLowerCase()) ||
        text.toLocaleLowerCase() === word.toLocaleLowerCase()
      )
        continue
      used.add(text.toLocaleLowerCase())
      options.push({ text, note: synonym.note, gender })
      if (options.length >= LIMIT.options) break
    }
    if (options.length > 0) out.push({ options })
  }
  return out.length > 0 ? { lemma: candidate.lemma, pos: candidate.pos, senses: out } : null
}
