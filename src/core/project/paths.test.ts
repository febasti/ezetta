import { describe, expect, it } from 'vitest'
import { newSheetName, validateName } from './paths'

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

describe('validateName', () => {
  it('accepts ordinary names, umlauts and all', () => {
    expect(validateName('Kapitel 1')).toBeNull()
    expect(validateName('Einführung')).toBeNull()
    expect(validateName('Console')).toBeNull()
    expect(validateName('com10')).toBeNull()
  })
  it('rejects what a file system cannot hold', () => {
    expect(validateName('')).toBe('empty')
    expect(validateName('a/b')).toBe('forbidden_character')
    expect(validateName('Frage?')).toBe('forbidden_character')
    expect(validateName('.versteckt')).toBe('reserved')
    expect(validateName('Ende.')).toBe('reserved')
  })
  it('rejects the device names of Windows, with or without an extension', () => {
    for (const name of ['CON', 'con', 'Nul', 'aux.typ', 'COM1', 'lpt9', 'COM¹', 'prn.tar.gz'])
      expect(validateName(name)).toBe('reserved')
  })
})
