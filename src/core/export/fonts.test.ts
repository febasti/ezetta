import { describe, expect, it } from 'vitest'
import { fontProblems, hasItalic, hasWeight, parseFontVariants, printedWeight } from './fonts'
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
      { style: 'italic', weight: [400, 800] },
      { style: 'normal', weight: [400, 800] },
    ])
    expect(family('Libertinus Serif').variants).toHaveLength(6)
    expect(family('Edo SZ').variants).toEqual([{ style: 'normal', weight: [400, 400] }])
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
