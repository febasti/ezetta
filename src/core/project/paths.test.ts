import { describe, expect, it } from 'vitest'
import { newSheetName } from './paths'

describe('newSheetName', () => {
  it('makes `s-` and six letters or digits, and tries again when the name is taken', () => {
    const draws = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    let n = 0
    const name = newSheetName(
      (candidate) => candidate === 's-aaaaaa',
      () => draws[n++ % draws.length]!,
    )
    expect(name).toMatch(/^s-[a-z2-9]{6}$/)
    expect(name).not.toBe('s-aaaaaa')
    expect(newSheetName(() => false)).toMatch(/^s-[a-z2-9]{6}$/)
  })
})
