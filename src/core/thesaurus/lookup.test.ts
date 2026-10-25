import { describe, expect, it } from 'vitest'
import { parseEntry } from './entry'
import { lookupSynonyms, posOf, tagForInflection } from './lookup'
import type { Inflected, MorphPort, Reading, ThesaurusPort } from './lookup'

const DATA = `Ergebnis|2
-|Resultat|Ausgang|Erfolg (Hauptform)|Folge (Oberbegriff)
-|Ertrag|Befund (fachspr.)
begründen|2
-|erklären|rechtfertigen|belegen|Gründe anführen
-|beweisen|belegen
schnell|1
-|rasch|flink|zügig (ugs.)
result|2
(noun)|consequence|outcome|effect (related term)
(verb)|ensue|follow
`
const entries = new Map<string, ReturnType<typeof parseEntry>>()
for (const block of DATA.split(/\n(?=[^\n|]+\|\d+\n)/)) {
  const entry = parseEntry(block)
  if (entry) entries.set(entry.word, entry)
}
const thesaurus: ThesaurusPort = {
  entry: (_language, word) => Promise.resolve(entries.get(word)?.senses ?? null),
}

const FORMS: Record<string, Record<string, { form: string; gender?: string }[]>> = {
  Resultat: {
    'SUB:NOM:PLU:NEU': [{ form: 'Resultate', gender: 'NEU' }],
    'SUB:NOM:SIN:NEU': [{ form: 'Resultat', gender: 'NEU' }],
  },
  Ausgang: { 'SUB:NOM:PLU:NEU': [{ form: 'Ausgänge', gender: 'MAS' }] },
  Erfolg: {
    'SUB:NOM:PLU:NEU': [{ form: 'Erfolge', gender: 'MAS' }],
    'SUB:NOM:SIN:NEU': [{ form: 'Erfolg', gender: 'MAS' }],
  },
  Ertrag: { 'SUB:NOM:PLU:NEU': [{ form: 'Erträge', gender: 'MAS' }] },
  Befund: {
    'SUB:NOM:PLU:NEU': [{ form: 'Befunde', gender: 'MAS' }],
    'SUB:NOM:SIN:NEU': [{ form: 'Befund', gender: 'MAS' }],
  },
  erklären: {
    'SUB:NOM:PLU:NEU': [{ form: 'erklären', gender: 'NEU' }],
    'VER:3:SIN:PRT:SFT': [{ form: 'erklärte' }],
  },
  rechtfertigen: { 'VER:3:SIN:PRT:SFT': [{ form: 'rechtfertigte' }] },
  belegen: { 'VER:3:SIN:PRT:SFT': [{ form: 'belegte' }] },
  beweisen: { 'VER:3:SIN:PRT:SFT': [{ form: 'bewies' }] },
  rasch: { 'ADJ:NOM:PLU:FEM:GRU:DEF': [{ form: 'raschen' }] },
  flink: { 'ADJ:NOM:PLU:FEM:GRU:DEF': [{ form: 'flinken' }] },
  zügig: { 'ADJ:NOM:PLU:FEM:GRU:DEF': [{ form: 'zügigen' }] },
  consequence: { NNS: [{ form: 'consequences' }] },
  outcome: { NNS: [{ form: 'outcomes' }] },
}

function morph(readings: Reading[] | null, calls: string[] = []): MorphPort {
  return {
    analyze: () => Promise.resolve(readings),
    inflect: (_language, tags, words) => {
      calls.push(`${tags.join(',')} <- ${words.join(',')}`)
      return Promise.resolve(words.map((word): Inflected => ({ word, byTag: FORMS[word] ?? {} })))
    },
  }
}

const ask = (readings: Reading[] | null, text: string, word: string, language = 'de-DE') =>
  lookupSynonyms(
    { morph: morph(readings), thesaurus },
    { language, text, from: text.indexOf(word), to: text.indexOf(word) + word.length },
  )

describe('lookupSynonyms', () => {
  it('finds the base form, and gives each synonym the form the word has', async () => {
    const result = await ask(
      [{ lemma: 'Ergebnis', tag: 'SUB:NOM:PLU:NEU' }],
      'Die Ergebnisse zeigten es.',
      'Ergebnisse',
    )
    expect(result).toMatchObject({ ok: true, word: 'Ergebnisse' })
    if (!result.ok) return
    expect(result.groups).toHaveLength(1)
    const [group] = result.groups
    expect(group).toMatchObject({ lemma: 'Ergebnis', pos: 'noun' })
    // The main form first; "Folge" is a broader term and stays out; each is plural.
    expect(group!.senses[0]!.options.map((o) => o.text)).toEqual([
      'Erfolge',
      'Resultate',
      'Ausgänge',
    ])
    expect(group!.senses[1]!.options.map((o) => o.text)).toEqual(['Erträge', 'Befunde'])
  })

  it('says when a singular noun of another gender changes the article, and not when it keeps it', async () => {
    const result = await ask(
      [{ lemma: 'Ergebnis', tag: 'SUB:NOM:SIN:NEU' }],
      'Das Ergebnis zeigte es.',
      'Ergebnis',
    )
    if (!result.ok) throw new Error('no result')
    const options = result.groups[0]!.senses.flatMap((s) => s.options)
    expect(options.find((o) => o.text === 'Resultat')?.gender).toBeNull()
    expect(options.find((o) => o.text === 'Erfolg')?.gender).toBe('MAS')
    expect(options.find((o) => o.text === 'Befund')).toMatchObject({
      note: 'fachspr.',
      gender: 'MAS',
    })
  })

  it('does not mention the gender of a plural, which has one article', async () => {
    const result = await ask(
      [{ lemma: 'Ergebnis', tag: 'SUB:NOM:PLU:NEU' }],
      'Die Ergebnisse zeigten es.',
      'Ergebnisse',
    )
    if (!result.ok) throw new Error('no result')
    expect(result.groups[0]!.senses.flatMap((s) => s.options).every((o) => o.gender === null)).toBe(
      true,
    )
  })

  it('inflects a verb like the word in the text, and leaves out a phrase', async () => {
    const result = await ask(
      [{ lemma: 'begründen', tag: 'VER:3:SIN:PRT:SFT' }],
      'Er begründete es.',
      'begründete',
    )
    if (!result.ok) throw new Error('no result')
    expect(result.groups[0]!.senses[0]!.options.map((o) => o.text)).toEqual([
      'erklärte',
      'rechtfertigte',
      'belegte',
    ])
    // "Gründe anführen" is a phrase: it cannot be put into the past tense.
    expect(JSON.stringify(result)).not.toContain('Gründe anführen')
    // A word that is in two senses is offered once.
    expect(result.groups[0]!.senses[1]!.options.map((o) => o.text)).toEqual(['bewies'])
  })

  it('prefers the indicative to the subjunctive when a form could be both', async () => {
    const forms = FORMS['beweisen']!
    forms['VER:3:SIN:KJ2:SFT'] = [{ form: 'bewiese' }]
    forms['VER:3:SIN:PRT:SFT'] = [{ form: 'bewies' }]
    const result = await ask(
      [
        { lemma: 'begründen', tag: 'VER:3:SIN:KJ2:SFT' },
        { lemma: 'begründen', tag: 'VER:3:SIN:PRT:SFT' },
      ],
      'Er begründete es.',
      'begründete',
    )
    if (!result.ok) throw new Error('no result')
    expect(result.groups[0]!.senses[1]!.options.map((o) => o.text)).toEqual(['bewies'])
    delete forms['VER:3:SIN:KJ2:SFT']
  })

  it('leaves out a base form the thesaurus does not know', async () => {
    const result = await ask(
      [
        { lemma: 'begründet', tag: 'PA2:NOM:PLU:FEM:GRU:SOL:VER' },
        { lemma: 'begründen', tag: 'VER:3:SIN:PRT:SFT' },
      ],
      'Er begründete es.',
      'begründete',
    )
    if (!result.ok) throw new Error('no result')
    expect(result.groups.map((g) => g.pos)).toEqual(['verb'])
  })

  it('offers a phrase where the word is in its base form', async () => {
    const result = await ask(
      [{ lemma: 'begründen', tag: 'VER:INF:NON' }],
      'Wir wollen begründen.',
      'begründen',
    )
    if (!result.ok) throw new Error('no result')
    expect(JSON.stringify(result)).toContain('Gründe anführen')
  })

  it('takes a capital at the start of a sentence over, but not for German nouns', async () => {
    const verb = await ask(
      [{ lemma: 'begründen', tag: 'VER:3:SIN:PRT:SFT' }],
      'Es ging. Begründete er es?',
      'Begründete',
    )
    if (!verb.ok) throw new Error('no result')
    expect(verb.groups[0]!.senses[0]!.options[0]!.text).toBe('Erklärte')
  })

  it('reads a capital in the middle of a German sentence as a noun, and a small letter as anything else', async () => {
    const readings: Reading[] = [
      { lemma: 'Ergebnis', tag: 'SUB:NOM:PLU:NEU' },
      { lemma: 'ergeben', tag: 'VER:3:SIN:PRT:SFT' },
    ]
    const noun = await ask(readings, 'Die Ergebnisse zeigten es.', 'Ergebnisse')
    if (!noun.ok) throw new Error('no result')
    expect(noun.groups.map((g) => g.lemma)).toEqual(['Ergebnis'])
  })

  it('takes the part of speech of a sense into account in English', async () => {
    const result = await ask(
      [{ lemma: 'result', tag: 'NNS' }],
      'The results showed it.',
      'results',
      'en-US',
    )
    if (!result.ok) throw new Error('no result')
    expect(result.groups[0]!.pos).toBe('noun')
    expect(result.groups[0]!.senses).toHaveLength(1)
    expect(result.groups[0]!.senses[0]!.options.map((o) => o.text)).toEqual([
      'consequences',
      'outcomes',
    ])
  })

  it('treats a participle like an adjective', async () => {
    expect(tagForInflection('PA2:NOM:PLU:FEM:GRU:SOL:VER')).toBe('ADJ:NOM:PLU:FEM:GRU:SOL')
    expect(tagForInflection('VER:3:SIN:PRT:SFT')).toBe('VER:3:SIN:PRT:SFT')
    expect(posOf('PA2:NOM:PLU:FEM:GRU:SOL:VER', 'de')).toBe('adj')
    expect(posOf('NNP', 'en')).toBeNull()
    expect(posOf('ART:DEF:AKK:PLU:NEU', 'de')).toBeNull()
  })

  it('works with the base form alone when there is no analysis', async () => {
    const result = await ask(null, 'Das ist schnell.', 'schnell')
    if (!result.ok) throw new Error('no result')
    expect(result.groups[0]!.senses[0]!.options.map((o) => o.text)).toEqual([
      'rasch',
      'flink',
      'zügig',
    ])
  })

  it('is empty for something that is not a word, and for a word the thesaurus does not know', async () => {
    expect(await ask(null, 'Ein 12 Wort', '12')).toEqual({ ok: false, reason: 'no_word' })
    expect(await ask(null, 'Ein Wort mit Zeichen', 'Zeichen')).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })
})
