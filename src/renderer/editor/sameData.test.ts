import { describe, expect, it } from 'vitest'
import { sameData } from './sameData'

describe('sameData', () => {
  it('compares primitives, arrays, and objects by what they hold', () => {
    expect(sameData('a', 'a')).toBe(true)
    expect(sameData(1, 2)).toBe(false)
    expect(sameData(null, null)).toBe(true)
    expect(sameData(null, {})).toBe(false)
    expect(sameData([1, [2, 3]], [1, [2, 3]])).toBe(true)
    expect(sameData([1, 2], [1, 2, 3])).toBe(false)
    expect(sameData({ a: 1, b: { c: [null] } }, { a: 1, b: { c: [null] } })).toBe(true)
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('ignores the order of keys, but not a key that is missing', () => {
    expect(sameData({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(sameData({ a: 1, b: undefined }, { a: 1, c: undefined })).toBe(false)
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('does not take an array for an object with the same entries', () => {
    expect(sameData(['x'], { 0: 'x' })).toBe(false)
    expect(sameData({ 0: 'x' }, ['x'])).toBe(false)
  })
})
