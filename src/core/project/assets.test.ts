import { describe, expect, it } from 'vitest'
import { assetFileName, imageTypeOf } from './assets'

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values)
const text = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))

describe('imageTypeOf', () => {
  it('recognizes the supported types by their first bytes', () => {
    expect(imageTypeOf(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png')
    expect(imageTypeOf(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg')
    expect(imageTypeOf(text('GIF89a....'))).toBe('gif')
    expect(imageTypeOf(text('GIF87a....'))).toBe('gif')
    expect(imageTypeOf(Uint8Array.from([...text('RIFF'), 1, 2, 3, 4, ...text('WEBPVP8 ')]))).toBe(
      'webp',
    )
    expect(imageTypeOf(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg')
    expect(imageTypeOf(text('<?xml version="1.0"?>\n<!-- c -->\n<SVG viewBox="0 0 1 1"/>'))).toBe(
      'svg',
    )
  })

  it('refuses everything else, whatever the file is called', () => {
    expect(imageTypeOf(new Uint8Array())).toBeNull()
    expect(imageTypeOf(text('Dies ist keine Datei mit Bild.'))).toBeNull()
    expect(imageTypeOf(text('%PDF-1.7'))).toBeNull()
    expect(imageTypeOf(text('#!/bin/sh\necho hi'))).toBeNull()
    expect(imageTypeOf(text('<html><body>x</body></html>'))).toBeNull()
    expect(imageTypeOf(text('RIFF....WAVE'))).toBeNull()
    expect(imageTypeOf(bytes(0x89, 0x50))).toBeNull()
  })
})

describe('assetFileName', () => {
  it('makes a safe name with the extension of the real type', () => {
    expect(assetFileName('Mein Bild (1).JPEG', 'jpg', [])).toBe('Mein-Bild-1.jpg')
    expect(assetFileName('Größe & Form.png', 'png', [])).toBe('Größe-Form.png')
    expect(assetFileName('../../etc/passwd', 'png', [])).toBe('passwd.png')
    expect(assetFileName('C:\\Users\\x\\foto.webp', 'webp', [])).toBe('foto.webp')
    expect(assetFileName('...', 'png', [])).toBe('bild.png')
    expect(assetFileName('', 'svg', [])).toBe('bild.svg')
  })

  it('never reuses a name, ignoring case', () => {
    expect(assetFileName('a.png', 'png', ['a.png'])).toBe('a-2.png')
    expect(assetFileName('A.PNG', 'png', ['a.png', 'a-2.png'])).toBe('A-3.png')
    expect(assetFileName('a.png', 'jpg', ['a.png'])).toBe('a.jpg') // another type is another name
  })

  it('shortens very long names', () => {
    expect(assetFileName(`${'x'.repeat(200)}.png`, 'png', []).length).toBeLessThan(70)
  })
})
