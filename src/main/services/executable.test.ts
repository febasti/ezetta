import { describe, expect, it } from 'vitest'
import { executable } from './executable'

describe('executable', () => {
  it('adds .exe on Windows only', () => {
    expect(executable('typst', 'win32')).toBe('typst.exe')
    expect(executable('typst', 'darwin')).toBe('typst')
    expect(executable('java', 'linux')).toBe('java')
  })
})
