import { describe, expect, it } from 'vitest'
import { newId } from './ids'

/** A random source that gives the given numbers in turn, so ids are known. */
const sequence = (...values: number[]) => {
  let n = 0
  return () => values[n++ % values.length]!
}

describe('newId', () => {
  it('makes a label of the prefix and six random letters and digits, for each kind', () => {
    for (const prefix of ['fig', 'tbl', 'eq'] as const)
      expect(newId(prefix, '')).toMatch(new RegExp(`^${prefix}-[a-z0-9]{6}$`))
  })

  it('uses the whole alphabet and the digits: 0 is the first character, 0.999 the last', () => {
    expect(newId('tbl', '', sequence(0))).toBe('tbl-aaaaaa')
    expect(newId('eq', '', sequence(0.999))).toBe('eq-999999')
    expect(newId('fig', '', sequence(0, 0.5, 0.999))).toBe('fig-as9as9')
  })

  it('is not a label the text has, and draws again when it would be', () => {
    const draws = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let n = 0
    expect(newId('tbl', 'Text <tbl-aaaaaa> mehr', () => draws[n++]!)).toBe('tbl-ssssss')
    // The same letters under another prefix are another label.
    n = 0
    expect(newId('eq', 'Text <tbl-aaaaaa> mehr', () => draws[n++]!)).toBe('eq-aaaaaa')
  })
})
