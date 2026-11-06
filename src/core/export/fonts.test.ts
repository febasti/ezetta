import { describe, expect, it } from 'vitest'
import { fontProblems, hasItalic, hasWeight, parseFontVariants, printedWeight } from './fonts'
import { smallCapsOf } from './fontFeatures'
import { parseStyle } from './style'

/** What `typst fonts --variants` prints (Typst 0.15.1), shortened. */
const OUTPUT = `Adobe Garamond
  ├ /Library/Fonts/Adobe Garamond Italic.otf
  │   Style: Italic, Weight: 400, Stretch: 100%
  └ /Library/Fonts/Adobe Garamond Regular.otf
      Style: Normal, Weight: 400, Stretch: 100%

EB Garamond
  ├ /Library/Fonts/EBGaramond-Italic-VariableFont_wght.ttf (Variable)
  │   Style: Italic
  │   Stretch: 100%
  │   Weight: 400-800 (Default: 400)
  └ /Library/Fonts/EBGaramond-VariableFont_wght.ttf (Variable)
      Style: Normal
      Stretch: 100%
      Weight: 400-800 (Default: 400)

Edo SZ
  └ C:\\Windows\\Fonts\\edosz.ttf
      Style: Normal, Weight: 400, Stretch: 100%

08 Underground
  └ /Library/Fonts/08 Underground.ttf
      Style: Normal, Weight: 400, Stretch: 100%

DejaVu Sans Mono
  └ (Embedded)
      Style: Normal, Weight: 400, Stretch: 100%

Libertinus Serif
  ├ (Embedded)
  │   Style: Normal, Weight: 400, Stretch: 100%
  ├ (Embedded)
  │   Style: Normal, Weight: 700, Stretch: 100%
  ├ (Embedded)
  │   Style: Italic, Weight: 400, Stretch: 100%
  ├ (Embedded)
  │   Style: Italic, Weight: 700, Stretch: 100%
  ├ (Embedded)
  │   Style: Normal, Weight: 600, Stretch: 100%
  └ (Embedded)
      Style: Italic, Weight: 600, Stretch: 100%
`

const families = parseFontVariants(OUTPUT)
const family = (name: string) => families.find((f) => f.name === name)!

describe('the fonts the compiler lists', () => {
  it('are read with their styles and weights, a variable font with its range', () => {
    expect(families.map((f) => f.name)).toEqual([
      '08 Underground',
      'Adobe Garamond',
      'DejaVu Sans Mono',
      'EB Garamond',
      'Edo SZ',
      'Libertinus Serif',
    ])
    expect(family('EB Garamond').variants).toEqual([
      {
        style: 'italic',
        weight: [400, 800],
        path: '/Library/Fonts/EBGaramond-Italic-VariableFont_wght.ttf',
      },
      {
        style: 'normal',
        weight: [400, 800],
        path: '/Library/Fonts/EBGaramond-VariableFont_wght.ttf',
      },
    ])
    expect(family('Libertinus Serif').variants).toHaveLength(6)
    expect(family('Edo SZ').variants).toEqual([
      { style: 'normal', weight: [400, 400], path: 'C:\\Windows\\Fonts\\edosz.ttf' },
    ])
    // The compiler's own fonts have no file.
    expect(family('Libertinus Serif').variants.every((v) => v.path === undefined)).toBe(true)
  })

  it('tell which weights and styles a family has', () => {
    expect(hasItalic(family('Adobe Garamond'))).toBe(true)
    expect(hasItalic(family('Edo SZ'))).toBe(false)
    expect(hasWeight(family('EB Garamond'), 'extrabold')).toBe(true)
    expect(hasWeight(family('EB Garamond'), 'black')).toBe(false)
    expect(hasWeight(family('Libertinus Serif'), 'semibold', true)).toBe(true)
    expect(hasWeight(family('Libertinus Serif'), 'medium')).toBe(false)
    expect(printedWeight(family('Libertinus Serif'), 'black')).toBe('bold')
    expect(printedWeight(family('Edo SZ'), 'black')).toBe('regular')
  })
})

describe('what a style asks of its fonts', () => {
  const problems = (toml: string) => fontProblems(parseStyle(toml).style, families)

  it('is said where a family lacks it', () => {
    const found = problems(
      '[element.body]\nfont = "Libertinus Serif"\n[element.heading]\nfont = "Edo SZ"\n[element.heading_2]\nitalic = true\nweight = "bold"',
    )
    expect(found).toContainEqual({ kind: 'italic', element: 'heading_2', font: 'Edo SZ' })
    expect(found).toContainEqual({
      kind: 'weight',
      element: 'heading_2',
      font: 'Edo SZ',
      weight: 'bold',
      printed: 'regular',
    })
  })

  it('says where small caps are asked of a family without them, and not where it has them', () => {
    const withCaps = parseFontVariants(OUTPUT).map((f) => ({
      ...f,
      smallCaps: f.name === 'Edo SZ' ? ('no' as const) : ('yes' as const),
    }))
    const found = (toml: string) => fontProblems(parseStyle(toml).style, withCaps)
    expect(
      found('[element.heading]\nfont = "Edo SZ"\n[element.heading_2]\ntext_case = "smallcaps"'),
    ).toContainEqual({ kind: 'smallcaps', element: 'heading_2', font: 'Edo SZ' })
    expect(
      found(
        '[element.heading]\nfont = "EB Garamond"\n[element.heading_2]\ntext_case = "smallcaps"',
      ).map((p) => p.kind),
    ).not.toContain('smallcaps')
  })

  it('warns once of a family that is not on this machine', () => {
    const found = problems('[element.body]\nfont = "Nirgends Sans"')
    expect(found.filter((p) => p.kind === 'missing')).toEqual([
      { kind: 'missing', element: 'body', font: 'Nirgends Sans' },
    ])
  })

  it('warns when emphasis and strong words in the text would print plain', () => {
    const found = problems('[element.body]\nfont = "Edo SZ"')
    expect(found).toContainEqual({ kind: 'emphasis', element: 'body', font: 'Edo SZ' })
    expect(found).toContainEqual({ kind: 'strong', element: 'body', font: 'Edo SZ' })
    expect(problems('[element.body]\nfont = "EB Garamond"').map((p) => p.kind)).not.toContain(
      'emphasis',
    )
  })

  it('says nothing without a list of fonts', () => {
    expect(fontProblems(parseStyle('[element.body]\nfont = "Nirgends"').style, [])).toEqual([])
  })
})

describe('small caps in a font file', () => {
  /** A font file of the tables given, each table's bytes in order after the directory. */
  function font(tables: Record<string, Uint8Array>): Uint8Array {
    const names = Object.keys(tables)
    const dirSize = 12 + names.length * 16
    const sizes = names.map((n) => tables[n]!.length)
    const out = new Uint8Array(dirSize + sizes.reduce((a, b) => a + b, 0))
    const view = new DataView(out.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, names.length)
    let at = dirSize
    names.forEach((name, i) => {
      for (let k = 0; k < 4; k += 1) out[12 + i * 16 + k] = name.charCodeAt(k)
      view.setUint32(12 + i * 16 + 8, at)
      view.setUint32(12 + i * 16 + 12, sizes[i]!)
      out.set(tables[name]!, at)
      at += sizes[i]!
    })
    return out
  }
  /** A GSUB table with the feature tags given. */
  function gsub(...tags: string[]): Uint8Array {
    const out = new Uint8Array(10 + 2 + tags.length * 6)
    const view = new DataView(out.buffer)
    view.setUint16(0, 1)
    view.setUint16(6, 10)
    view.setUint16(10, tags.length)
    tags.forEach((t, i) => {
      for (let k = 0; k < 4; k += 1) out[12 + i * 6 + k] = t.charCodeAt(k)
    })
    return out
  }
  const reader = (bytes: Uint8Array) => async (offset: number, length: number) =>
    bytes.subarray(offset, offset + length)

  it('are there when the GSUB table has smcp', async () => {
    expect(await smallCapsOf(reader(font({ GSUB: gsub('liga', 'smcp') })))).toBe('yes')
    expect(await smallCapsOf(reader(font({ GSUB: gsub('liga', 'kern') })))).toBe('no')
    expect(await smallCapsOf(reader(font({ head: new Uint8Array(54) })))).toBe('no')
  })

  /** A `morx` table with one chain offering the features given (type and setting). */
  function morx(...features: [number, number][]): Uint8Array {
    const chain = 16 + features.length * 12
    const out = new Uint8Array(8 + chain)
    const view = new DataView(out.buffer)
    view.setUint16(0, 2)
    view.setUint32(4, 1)
    view.setUint32(12, chain)
    view.setUint32(16, features.length)
    features.forEach(([type, setting], i) => {
      view.setUint16(24 + i * 12, type)
      view.setUint16(24 + i * 12 + 2, setting)
    })
    return out
  }

  it('are there when Apple’s own table offers them', async () => {
    expect(await smallCapsOf(reader(font({ morx: morx([1, 0], [37, 1]) })))).toBe('yes')
    expect(await smallCapsOf(reader(font({ morx: morx([3, 3]) })))).toBe('yes')
    expect(await smallCapsOf(reader(font({ morx: morx([1, 0], [37, 0]) })))).toBe('no')
  })

  it('cannot be told for a file that is not a font', async () => {
    expect(await smallCapsOf(reader(new Uint8Array([1, 2, 3])))).toBe('unknown')
  })
})
