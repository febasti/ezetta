import { describe, expect, it } from 'vitest'
import type { BibEntry } from './bibtex'
import { contextAround, lineOf, summarizeLiterature } from './literature'

const entry = (key: string, family: string, year: string, title = 'T'): BibEntry => ({
  key,
  type: 'book',
  authors: [{ family, given: '', literal: false }],
  editors: [],
  etAl: false,
  year,
  title,
  container: null,
})
const library = new Map([
  ['smith2020', entry('smith2020', 'Smith', '2020')],
  ['smith2018', entry('smith2018', 'Smith', '2018')],
  ['müller2019', entry('müller2019', 'Müller', '2019')],
  ['adler2021', entry('adler2021', 'Adler', '2021')],
])
const lookup = (key: string) => library.get(key)

describe('summarizeLiterature', () => {
  const sheets = [
    {
      path: 'a.typ',
      citations: [
        ['smith2020', 10],
        ['müller2019', 40],
        ['smith2020', 90],
      ] as const,
      missing: [5],
      checks: [95],
    },
    {
      path: 'b/c.typ',
      citations: [
        ['adler2021', 3],
        ['smith2018', 8],
        ['smith2020', 20],
        ['unbekannt', 30],
      ] as const,
      missing: [],
      checks: [1, 2],
    },
  ]
  const result = summarizeLiterature(sheets, lookup)

  it('counts every work and sorts alphabetically: author, then year', () => {
    expect(result.works.map((w) => [w.key, w.count])).toEqual([
      ['adler2021', 1],
      ['müller2019', 1],
      ['smith2018', 1],
      ['smith2020', 3],
      ['unbekannt', 1],
    ])
    expect(result.total).toBe(7)
  })

  it('puts keys that are not in the bibliography last, with no entry', () => {
    const last = result.works.at(-1)!
    expect(last).toMatchObject({ key: 'unbekannt', entry: null })
    expect(result.works[0]!.entry).toMatchObject({ key: 'adler2021' })
  })

  it('lists the uses of a work in the order of the sheets and the text', () => {
    expect(result.works.find((w) => w.key === 'smith2020')!.uses).toEqual([
      { path: 'a.typ', at: 10 },
      { path: 'a.typ', at: 90 },
      { path: 'b/c.typ', at: 20 },
    ])
  })

  it('collects the markers with where they are', () => {
    expect(result.missing).toEqual([{ path: 'a.typ', at: 5 }])
    expect(result.checks).toEqual([
      { path: 'a.typ', at: 95 },
      { path: 'b/c.typ', at: 1 },
      { path: 'b/c.typ', at: 2 },
    ])
  })

  it('is empty for no sheets', () => {
    expect(summarizeLiterature([], lookup)).toEqual({
      works: [],
      missing: [],
      checks: [],
      total: 0,
    })
  })

  it('sorts German names by the alphabet, not by code point', () => {
    const umlauts = new Map([
      ['a', entry('a', 'Zander', '2000')],
      ['b', entry('b', 'Ärmel', '2000')],
      ['c', entry('c', 'Bauer', '2000')],
    ])
    const out = summarizeLiterature(
      [
        {
          path: 'x',
          citations: [
            ['a', 0],
            ['b', 1],
            ['c', 2],
          ],
          missing: [],
          checks: [],
        },
      ],
      (key) => umlauts.get(key),
    )
    expect(out.works.map((w) => w.key)).toEqual(['b', 'c', 'a'])
  })
})

describe('contextAround', () => {
  it('shows the line around a place, cut with dots', () => {
    const text = `Erste Zeile.\nDas zeigen mehrere Studien @smith2020[S. 14] und noch mehr Text danach.\nDritte.`
    const at = text.indexOf('@smith')
    const short = contextAround(text, at, 20)
    expect(short.startsWith('…') && short.endsWith('…')).toBe(true)
    expect(short).toContain('@smith2020')
    expect(short.length).toBeLessThanOrEqual(44)
    expect(contextAround(text, at, 200)).toBe(
      'Das zeigen mehrere Studien @smith2020[S. 14] und noch mehr Text danach.',
    )
  })

  it('collapses white space and stays inside the line', () => {
    expect(contextAround('a\n   b   @k   c\nd', 8, 50)).toBe('b @k c')
  })
})

describe('lineOf', () => {
  it('counts lines from one', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1)
    expect(lineOf('a\nb\nc', 2)).toBe(2)
    expect(lineOf('a\nb\nc', 4)).toBe(3)
  })
})
