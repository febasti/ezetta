import { describe, expect, it } from 'vitest'
import type { BibEntry } from '@core/bib/bibtex'
import type { Citation } from '@core/typst/citations'
import { groupChipFor } from './citeWidget'
import type { CiteConfig } from './citeState'

const entry = (key: string, family: string, year: string): BibEntry => ({
  key,
  type: 'book',
  authors: [{ family, given: 'X', literal: false }],
  editors: [],
  etAl: false,
  year,
  title: null,
  container: null,
})
const works = new Map([
  ['meier', entry('meier', 'Meier', '2015')],
  ['kant', entry('kant', 'Kant', '1781')],
])
const config = {
  lookup: (key: string) => works.get(key),
  language: 'de',
  labels: {},
} as unknown as CiteConfig

const cite = (key: string, form: string | null = null, supplement: string | null = null) =>
  ({ key, form, supplement, check: null, extra: [] }) as unknown as Citation

describe('the text of a citation chip', () => {
  it('has the brackets the PDF prints for the normal form, round a whole group', () => {
    expect(groupChipFor([cite('meier')], config).text).toBe('(Meier 2015)')
    expect(groupChipFor([cite('meier', null, 'S. 4')], config).text).toBe('(Meier 2015, S. 4)')
    expect(groupChipFor([cite('kant'), cite('meier')], config).text).toBe('(Kant 1781; Meier 2015)')
  })

  it('has none for the other forms, which carry their own brackets or none', () => {
    expect(groupChipFor([cite('meier', 'prose')], config).text).toBe('Meier (2015)')
    expect(groupChipFor([cite('meier', 'year')], config).text).toBe('2015')
    expect(groupChipFor([cite('meier', 'author')], config).text).toBe('Meier')
  })

  it('is part of the sentence in the prose and the author form, and only there', () => {
    expect(groupChipFor([cite('meier', 'prose')], config).inSentence).toBe(true)
    expect(groupChipFor([cite('meier', 'author')], config).inSentence).toBe(true)
    expect(groupChipFor([cite('meier')], config).inSentence).toBe(false)
    expect(groupChipFor([cite('meier', 'year')], config).inSentence).toBe(false)
    expect(groupChipFor([cite('meier', 'none')], config).inSentence).toBe(false)
  })

  it('names a work that is not in the library by its key, and says so', () => {
    const chip = groupChipFor([cite('unbekannt')], config)
    expect(chip.text).toBe('(unbekannt)')
    expect(chip.missing).toEqual(['unbekannt'])
  })
})
