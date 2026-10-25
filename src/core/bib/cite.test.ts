import { describe, expect, it } from 'vitest'
import type { BibEntry } from './bibtex'
import { authorText, chipText, entryDetail, entryLine, matchesQuery } from './cite'

const person = (family: string, given = 'X') => ({ family, given, literal: false })
const entry = (overrides: Partial<BibEntry> = {}): BibEntry => ({
  key: 'smith2020',
  type: 'article',
  authors: [person('Smith')],
  editors: [],
  etAl: false,
  year: '2020',
  title: 'A Study of Things',
  container: 'Journal',
  ...overrides,
})

describe('authorText', () => {
  it('names one author, two with "and", more with "et al."', () => {
    expect(authorText(entry(), 'de')).toBe('Smith')
    expect(authorText(entry({ authors: [person('Smith'), person('Jones')] }), 'de')).toBe(
      'Smith und Jones',
    )
    expect(authorText(entry({ authors: [person('Smith'), person('Jones')] }), 'en')).toBe(
      'Smith and Jones',
    )
    expect(authorText(entry({ authors: [person('A'), person('B'), person('C')] }), 'de')).toBe(
      'A et al.',
    )
  })

  it('shows "et al." for a list that ends in "and others"', () => {
    expect(authorText(entry({ etAl: true }), 'en')).toBe('Smith et al.')
    expect(authorText(entry({ authors: [person('A'), person('B')], etAl: true }), 'en')).toBe(
      'A et al.',
    )
  })

  it('falls back to the editors, then to the title', () => {
    expect(authorText(entry({ authors: [], editors: [person('Eder')] }), 'de')).toBe('Eder')
    expect(authorText(entry({ authors: [] }), 'de')).toBe('A Study of Things')
    expect(authorText(entry({ authors: [], title: 'x'.repeat(50) }), 'de')).toMatch(/^x{31}…$/)
    expect(authorText(entry({ authors: [], title: null }), 'de')).toBe('smith2020')
  })
})

describe('chipText', () => {
  it('writes author and year, with the page reference after a comma', () => {
    expect(chipText(entry(), { language: 'de' })).toBe('Smith 2020')
    expect(chipText(entry(), { language: 'de', supplement: ' S. 14 ' })).toBe('Smith 2020, S. 14')
  })

  it('knows the other forms', () => {
    const o = { language: 'de', supplement: 'S. 14' }
    expect(chipText(entry(), { ...o, form: 'prose' })).toBe('Smith (2020, S. 14)')
    expect(chipText(entry(), { ...o, form: 'year' })).toBe('2020, S. 14')
    expect(chipText(entry(), { ...o, form: 'author' })).toBe('Smith, S. 14')
    expect(chipText(entry(), { ...o, form: 'full' })).toBe('Smith 2020, S. 14')
  })

  it('says so when there is no year, in the language of the text', () => {
    expect(chipText(entry({ year: null }), { language: 'de' })).toBe('Smith o. J.')
    expect(chipText(entry({ year: null }), { language: 'en' })).toBe('Smith n.d.')
  })
})

describe('entryLine and matchesQuery', () => {
  it('describes a work for a list', () => {
    expect(entryLine(entry(), 'de')).toBe('Smith 2020 – A Study of Things')
  })

  it('finds works by every word of the query in any field', () => {
    expect(matchesQuery(entry(), '')).toBe(true)
    expect(matchesQuery(entry(), 'smith 2020')).toBe(true)
    expect(matchesQuery(entry(), 'study journal')).toBe(true)
    expect(matchesQuery(entry(), 'smith 2021')).toBe(false)
    expect(matchesQuery(entry(), 'SMITH2020')).toBe(true)
  })
})

describe('entryDetail', () => {
  it('tells every author, the year, the whole title and the container', () => {
    const detail = entryDetail(
      entry({
        authors: [person('Smith', 'John'), person('Jones', 'Mary'), person('Doe', 'Jane')],
        title: 'A very long title that the chip never shows',
      }),
      'en',
    )
    expect(detail).toEqual({
      authors: 'Smith, John; Jones, Mary; Doe, Jane',
      year: '2020',
      title: 'A very long title that the chip never shows',
      container: 'Journal',
    })
  })

  it('marks editors, keeps institutions whole, and falls back to the key and "n.d."', () => {
    const edited = entryDetail(entry({ authors: [], editors: [person('Meier', 'Hans')] }), 'de')
    expect(edited.authors).toBe('Meier, Hans (Hrsg.)')
    const institution = entryDetail(
      entry({ authors: [{ family: 'World Health Organization', given: '', literal: true }] }),
      'en',
    )
    expect(institution.authors).toBe('World Health Organization')
    const bare = entryDetail(entry({ year: null, title: null, container: null }), 'en')
    expect(bare).toMatchObject({ year: 'n.d.', title: 'smith2020', container: '' })
  })
})
