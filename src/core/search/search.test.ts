import { describe, expect, it } from 'vitest'
import { findMatches, replacementFor, replacementsFor } from './search'
import type { SearchOptions } from './search'

const opts = (query: string, rest: Partial<SearchOptions> = {}): SearchOptions => ({
  query,
  caseSensitive: false,
  wholeWord: false,
  regexp: false,
  ...rest,
})
const spans = (text: string, options: SearchOptions): string[] =>
  findMatches(text, options).matches.map((m) => text.slice(m.from, m.to))
const apply = (text: string, options: SearchOptions, replacement: string): string => {
  const changes = replacementsFor(text, findMatches(text, options).matches, options, replacement)
  return changes.reduceRight((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text)
}

describe('findMatches', () => {
  it('finds every occurrence, ignoring case by default', () => {
    expect(findMatches('Haus haus HAUS', opts('haus')).matches).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 9 },
      { from: 10, to: 14 },
    ])
    expect(spans('Haus haus HAUS', opts('haus', { caseSensitive: true }))).toEqual(['haus'])
  })

  it('treats the query as plain text unless it is a regular expression', () => {
    expect(spans('Preis (netto) a.b a+b', opts('(netto)'))).toEqual(['(netto)'])
    expect(spans('a.b axb', opts('a.b'))).toEqual(['a.b'])
    expect(spans('Ost-West, a/b, [x]', opts('Ost-West'))).toEqual(['Ost-West'])
    expect(spans('Ost-West, a/b, [x]', opts('a/b'))).toEqual(['a/b'])
    expect(spans('Ost-West, a/b, [x]', opts('[x]'))).toEqual(['[x]'])
    expect(spans('a.b axb', opts('a.b', { regexp: true }))).toEqual(['a.b', 'axb'])
    expect(spans('Die #footnote[x] steht.', opts('#footnote['))).toEqual(['#footnote['])
  })

  it('finds whole words only, also next to umlauts and digits', () => {
    expect(spans('Haus Hausbau Vorhaus Haus.', opts('haus', { wholeWord: true }))).toEqual([
      'Haus',
      'Haus',
    ])
    expect(spans('über Überlegung Über', opts('über', { wholeWord: true }))).toEqual([
      'über',
      'Über',
    ])
    expect(spans('a1 a 1a', opts('a', { wholeWord: true }))).toEqual(['a'])
  })

  it('folds case for non-ASCII letters', () => {
    expect(spans('Ärger ärger', opts('ÄRGER'))).toEqual(['Ärger', 'ärger'])
  })

  it('reports an invalid regular expression, and an empty query is not an error', () => {
    expect(findMatches('x', opts('(', { regexp: true }))).toMatchObject({
      matches: [],
      invalid: true,
    })
    expect(findMatches('x', opts(''))).toEqual({ matches: [], invalid: false, truncated: false })
  })

  it('skips empty matches and does not loop on them', () => {
    expect(spans('baab', opts('a*', { regexp: true }))).toEqual(['aa'])
  })

  it('stops at the limit and says so', () => {
    const result = findMatches('a'.repeat(50), opts('a'), 10)
    expect(result.matches).toHaveLength(10)
    expect(result.truncated).toBe(true)
  })

  it('finds text across a line break with a regular expression, and handles surrogate pairs', () => {
    expect(spans('eins\nzwei', opts('s\\nz', { regexp: true }))).toEqual(['s\nz'])
    expect(spans('a 😀 b 😀', opts('😀'))).toEqual(['😀', '😀'])
  })
})

describe('replacements', () => {
  it('replaces plain text as typed, including a dollar sign', () => {
    expect(apply('a b a', opts('a'), 'x$1')).toBe('x$1 b x$1')
    expect(apply('a b a', opts('a'), '')).toBe(' b ')
  })

  it('fills groups, the whole match, and escaped dollars in regular expression mode', () => {
    const o = opts('(\\w+) (\\w+)', { regexp: true })
    expect(apply('eins zwei', o, '$2 $1')).toBe('zwei eins')
    expect(apply('eins zwei', o, '[$&]')).toBe('[eins zwei]')
    expect(apply('eins zwei', o, '$$1')).toBe('$1')
    expect(apply('eins zwei', o, '$3|$<none>|')).toBe('$3||')
    const named = opts('(?<a>\\d+)-(?<b>\\d+)', { regexp: true })
    expect(apply('10-20', named, '$<b>-$<a>')).toBe('20-10')
  })

  it('reads a second digit only when the group exists', () => {
    const o = opts('(a)(b)', { regexp: true })
    expect(apply('ab', o, '$10')).toBe('a0')
  })

  it('uses the text around a match for lookbehind and whole words', () => {
    const o = opts('(?<=Nr\\. )(\\d+)', { regexp: true })
    const text = 'Nr. 12 und 34'
    const [match] = findMatches(text, o).matches
    expect(replacementFor(text, match!, o, '<$1>')).toBe('<12>')
    expect(apply('Haus Hausbau', opts('haus', { wholeWord: true }), 'Heim')).toBe('Heim Hausbau')
  })
})
