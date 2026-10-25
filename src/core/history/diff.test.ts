import { describe, expect, it } from 'vitest'
import { diffCounts, diffWords } from './diff'

const joined = (pieces: ReturnType<typeof diffWords>, kinds: string[]): string =>
  pieces
    .filter((p) => kinds.includes(p.kind))
    .map((p) => p.text)
    .join('')

describe('diffWords', () => {
  it('finds the words only in the current text and those only in the earlier one', () => {
    const pieces = diffWords('Das ist ein neuer Satz hier.', 'Das ist ein alter Satz hier.')
    expect(pieces).toEqual([
      { kind: 'same', text: 'Das ist ein ' },
      { kind: 'lost', text: 'neuer ' },
      { kind: 'back', text: 'alter ' },
      { kind: 'same', text: 'Satz hier.' },
    ])
  })

  it('joins back to both texts', () => {
    const current = 'Eins zwei drei vier fünf sechs.'
    const earlier = 'Eins drei vier sieben sechs.'
    const pieces = diffWords(current, earlier)
    expect(joined(pieces, ['same', 'lost'])).toBe(current)
    expect(joined(pieces, ['same', 'back'])).toBe(earlier)
  })

  it('handles equal, empty and wholly different texts', () => {
    expect(diffWords('gleich', 'gleich')).toEqual([{ kind: 'same', text: 'gleich' }])
    expect(diffWords('', '')).toEqual([])
    expect(diffWords('', 'neu')).toEqual([{ kind: 'back', text: 'neu' }])
    expect(diffWords('alt', '')).toEqual([{ kind: 'lost', text: 'alt' }])
    expect(diffWords('a b', 'c d').map((p) => p.kind)).toEqual(['lost', 'back'])
  })

  it('shows a very large change as one replaced block instead of comparing every pair', () => {
    const a = Array.from({ length: 4000 }, (_, i) => `a${i}`).join(' ')
    const b = Array.from({ length: 4000 }, (_, i) => `b${i}`).join(' ')
    expect(diffWords(a, b).map((p) => p.kind)).toEqual(['lost', 'back'])
  })

  it('counts words', () => {
    const pieces = diffWords('Ein altes Wort bleibt hier', 'Ein neues Wort bleibt hier und mehr')
    expect(diffCounts(pieces)).toEqual({ lost: 1, back: 3 })
  })
})
