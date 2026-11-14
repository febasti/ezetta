import { describe, expect, it } from 'vitest'
import { parseTypst } from '../typst/parser'
import { miniature, TASTER } from './miniature'
import { resolveStyle } from './style'
import type { ResolvedStyle } from './style'

const style = (elements: Record<string, Record<string, unknown>> = {}): ResolvedStyle =>
  resolveStyle({ element: elements }).style
const size = (value: string | boolean | undefined): number =>
  Number(String(value).replace('pt', ''))

describe('the taster of a template', () => {
  it('has the name as its chapter, then text and a section, in each language', () => {
    for (const language of ['de', 'en'] as const) {
      const { sheet } = miniature(style(), 'Monographie', language)
      expect(sheet).toMatch(/^= #context \{ let t = \[Monographie\];/)
      expect(sheet).toContain(language === 'de' ? '[Abschnitt]' : '[Section]')
      expect(sheet).toContain('Lorem ipsum')
      expect(parseTypst(sheet)).toBeTruthy()
    }
  })

  it('is a small page of the same size for every template, with no header, footer or title page', () => {
    for (const paper of ['a4', 'a5']) {
      const { sets, options } = miniature(style({ page: { paper } }), 'X', 'de')
      expect(sets['page']).toMatchObject({
        paper: 'custom',
        page_width: `${TASTER.width.toFixed(2)}cm`,
        page_height: `${TASTER.height.toFixed(2)}cm`,
      })
      for (const running of ['header', 'footer'])
        expect(sets[running]).toMatchObject({
          slot_left: 'none',
          slot_center: 'none',
          slot_right: 'none',
        })
      expect(options).toEqual({
        title_page: false,
        contents: false,
        list_of_figures: false,
        list_of_tables: false,
      })
    }
  })

  it('has a note in its first line only where notes stand in the margin', () => {
    expect(miniature(style(), 'X', 'de').sheet).not.toContain('#footnote[')
    const margin = miniature(
      style({ footnote: { placement: 'margin', margin_width: '5.6cm', margin_gap: '0.8cm' } }),
      'X',
      'de',
    )
    expect(margin.sheet).toMatch(/\nLorem ipsum dolor sit amet#footnote\[/)
    // The column of notes shrinks with the page.
    expect(margin.sets['footnote']).toEqual({ margin_width: '2.40cm', margin_gap: '0.34cm' })
  })

  it('sets the headings larger than their own size, a short name larger than a long one', () => {
    const own = style({ body: { size: '10pt' }, heading_1: { size: '1.5em' } })
    const short = miniature(own, 'Essay', 'de').sets
    const long = miniature(own, 'Ein sehr langer Name einer Vorlage', 'de').sets
    expect(size(short['heading_1']!['size'])).toBeGreaterThan(size(long['heading_1']!['size']))
    // Never smaller than the heading's own size, never larger than the taster allows.
    expect(size(long['heading_1']!['size'])).toBeGreaterThanOrEqual(15)
    expect(size(short['heading_1']!['size'])).toBeLessThanOrEqual(34)
    expect(size(short['heading_2']!['size'])).toBeGreaterThan(10)
  })

  it('keeps the distances a heading sets in em at their own size, and starts at the top', () => {
    const own = style({
      body: { size: '10pt' },
      heading_1: { size: '2em', below: '1.5em', line_below: true, line_below_distance: '1em' },
    })
    const heading = miniature(own, 'Essay', 'de').sets['heading_1']!
    expect(heading['below']).toBe('30.0pt')
    expect(heading['line_below_distance']).toBe('20.0pt')
    expect(heading['above']).toBe('0em')
  })

  it('fits the name to a column, so two columns give a smaller heading than one', () => {
    const one = miniature(style(), 'Zeitschrift', 'de')
    const two = miniature(style({ page: { columns: '2' } }), 'Zeitschrift', 'de')
    expect(size(two.sets['heading_1']!['size'])).toBeLessThan(size(one.sets['heading_1']!['size']))
  })

  it('takes a name with markup characters as text', () => {
    const { sheet } = miniature(style(), 'A*B [x] #1', 'de')
    expect(sheet).toContain('[A\\*B \\[x\\] \\#1]')
    expect(parseTypst(sheet).topNode.toString()).not.toContain('Strong')
  })
})
