import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createThesaurusStore, indexThesaurus } from './thesaurus'

const FILE = `UTF-8
|2
-|(Jahreszahl)|anno (...)
-|... gefällig?|möchten Sie ...
Ergebnis|2
-|Resultat|Ausgang|Erfolg (Hauptform)
-|Ertrag|Befund (fachspr.)
begründen|1
-|erklären|rechtfertigen
Ergebnis|1
-|doppelt
`

describe('indexThesaurus', () => {
  it('finds each entry by its headword, skipping the lines of the senses', () => {
    const buffer = Buffer.from(FILE)
    const index = indexThesaurus(buffer)
    expect([...index.keys()]).toEqual(['', 'Ergebnis', 'begründen'])
    const [from, to] = index.get('Ergebnis')!
    expect(buffer.toString('utf8', from, to)).toBe(
      'Ergebnis|2\n-|Resultat|Ausgang|Erfolg (Hauptform)\n-|Ertrag|Befund (fachspr.)',
    )
  })
})

describe('createThesaurusStore', () => {
  const store = createThesaurusStore({ dir: '/d', read: () => Promise.resolve(Buffer.from(FILE)) })

  it('reads an entry with its senses', async () => {
    const senses = await store.entry('de', 'Ergebnis')
    expect(senses).toHaveLength(2)
    expect(senses![0]!.synonyms.map((s) => s.text)).toEqual(['Resultat', 'Ausgang', 'Erfolg'])
    expect(senses![0]!.synonyms[2]).toMatchObject({ main: true })
  })

  it('answers null for a word it does not have, a missing file, and no folder', async () => {
    expect(await store.entry('de', 'Unbekannt')).toBeNull()
    const missing = createThesaurusStore({ dir: '/d', read: () => Promise.reject(new Error('no')) })
    expect(await missing.entry('en', 'x')).toBeNull()
    expect(await createThesaurusStore({ dir: null }).entry('de', 'x')).toBeNull()
  })
})

// With the files in `.dev/thesaurus`, the real ones are read.
const dir = resolve('.dev/thesaurus')
describe.skipIf(!existsSync(resolve(dir, 'th_de_DE_v2.dat')))('with the real files', () => {
  const real = createThesaurusStore({ dir })
  it('has the common words of both languages, with their senses', async () => {
    const german = await real.entry('de', 'begründen')
    expect(german!.flatMap((s) => s.synonyms.map((x) => x.text))).toContain('rechtfertigen')
    const english = await real.entry('en', 'result')
    expect(english!.some((s) => s.pos === 'noun')).toBe(true)
    expect(english!.flatMap((s) => s.synonyms.map((x) => x.text))).toContain('outcome')
  }, 30_000)
})
