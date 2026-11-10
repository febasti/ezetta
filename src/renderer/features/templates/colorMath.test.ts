import { describe, expect, it } from 'vitest'
import { hexToHsv, hsvToHex } from './colorMath'

describe('the colour field', () => {
  it('reads a colour as hue, saturation and value, and writes it back the same', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
    for (const hex of ['#b00020', '#6b4f3a', '#3b70c2', '#ffffff', '#7a7a7a', '#2a8a85'])
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  })
})
