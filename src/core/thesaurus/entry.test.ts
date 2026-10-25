import { describe, expect, it } from 'vitest'
import { headwordKeys, parseEntry, parseSynonym } from './entry'

describe('parseSynonym', () => {
  it('takes usage notes and structure marks off the word', () => {
    expect(parseSynonym('Gartenzaun (ugs.)')).toEqual({
      text: 'Gartenzaun',
      note: 'ugs.',
      kind: 'synonym',
      main: false,
    })
    expect(parseSynonym('Währung (Hauptform) (Oberbegriff)')).toMatchObject({
      text: 'Währung',
      kind: 'broader',
      main: true,
    })
    expect(parseSynonym('Valuta (fachspr.) (Oberbegriff)')).toMatchObject({
      text: 'Valuta',
      note: 'fachspr.',
      kind: 'broader',
    })
    expect(parseSynonym('phenomenon (generic term)')).toMatchObject({ kind: 'broader' })
    expect(parseSynonym('good (antonym)')).toMatchObject({ kind: 'opposite' })
    expect(parseSynonym('stuff (related term)')).toMatchObject({ kind: 'related' })
  })

  it('keeps parentheses that belong to a phrase', () => {
    expect(parseSynonym('Argumente finden (für)').text).toBe('Argumente finden (für)')
    expect(parseSynonym('(eine) Begründung abgeben').text).toBe('(eine) Begründung abgeben')
    expect(parseSynonym('im Jahre des Herrn (...)').text).toBe('im Jahre des Herrn (...)')
  })

  it('reads more than one note', () => {
    expect(parseSynonym('Ding (salopp) (veraltet)').note).toBe('salopp, veraltet')
  })
})

describe('parseEntry', () => {
  it('reads the senses with their part of speech', () => {
    const entry = parseEntry(
      'result|2\n(noun)|consequence|effect|outcome|phenomenon (generic term)\n(verb)|ensue|prove (generic term)\nnext|1\n',
    )
    expect(entry?.word).toBe('result')
    expect(entry?.senses).toHaveLength(2)
    expect(entry?.senses[0]).toMatchObject({ pos: 'noun' })
    expect(entry?.senses[0]!.synonyms.map((s) => s.text)).toEqual([
      'consequence',
      'effect',
      'outcome',
      'phenomenon',
    ])
    expect(entry?.senses[1]).toMatchObject({ pos: 'verb' })
  })

  it('reads a German entry, where the part of speech is a dash', () => {
    const entry = parseEntry(
      'begründen|2\n-|erklären|rechtfertigen (ugs.)|legitimieren\n-|beweisen|belegen\n',
    )
    expect(entry?.senses[0]?.pos).toBeNull()
    expect(entry?.senses[0]?.synonyms[1]).toMatchObject({ text: 'rechtfertigen', note: 'ugs.' })
  })

  it('is null for text that is not an entry', () => {
    expect(parseEntry('')).toBeNull()
    expect(parseEntry('no count here')).toBeNull()
  })
})

describe('headwordKeys', () => {
  it('tries the word as written, in lower case, and with a capital', () => {
    expect(headwordKeys('Ergebnis')).toEqual(['Ergebnis', 'ergebnis'])
    expect(headwordKeys('begründen')).toEqual(['begründen', 'Begründen'])
  })
})
