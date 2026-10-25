import { describe, expect, it } from 'vitest'
import { parseSets } from './custom'
import { parseStyle } from './style'
import {
  DEFAULT_HEADING_NUMBERING,
  formatCounter,
  formatHeadingNumber,
  headingNumberingOf,
  referenceStyleOf,
  typstNumberingPattern,
} from './numbering'
import type { HeadingNumbering } from './numbering'
import { numberTargets, referenceText, supplementsFor } from '../typst/targets'
import type { Target } from '../typst/targets'

describe('formatCounter', () => {
  it('prints digits, roman numerals and letters the way Typst does', () => {
    expect(formatCounter(7, 'arabic')).toBe('7')
    expect(formatCounter(4, 'roman')).toBe('IV')
    expect(formatCounter(1994, 'roman')).toBe('MCMXCIV')
    expect(formatCounter(14, 'roman_lower')).toBe('xiv')
    expect(formatCounter(0, 'roman')).toBe('N')
    expect(formatCounter(1, 'alpha')).toBe('A')
    expect(formatCounter(26, 'alpha')).toBe('Z')
    expect(formatCounter(27, 'alpha')).toBe('AA')
    expect(formatCounter(28, 'alpha_lower')).toBe('bb')
  })
})

describe('formatHeadingNumber', () => {
  const mixed: HeadingNumbering = {
    formats: ['roman', 'arabic', 'alpha_lower', 'arabic'],
    depth: 3,
    separator: 'point',
  }

  it('joins the levels, each in its own format', () => {
    expect(formatHeadingNumber([2], mixed)).toBe('II')
    expect(formatHeadingNumber([2, 3], mixed)).toBe('II.3')
    expect(formatHeadingNumber([2, 3, 1], mixed)).toBe('II.3.a')
  })

  it('has no number below the depth, or at all with a depth of 0', () => {
    expect(formatHeadingNumber([2, 3, 1, 1], mixed)).toBe('')
    expect(formatHeadingNumber([1], { ...mixed, depth: 0 })).toBe('')
  })

  it('numbers like Typst by default', () => {
    expect(formatHeadingNumber([1, 2, 3, 4, 5, 6], DEFAULT_HEADING_NUMBERING)).toBe('1.2.3.4.5.6')
  })

  it('takes the last level’s format for the levels that are not styled', () => {
    const numbering: HeadingNumbering = { ...mixed, depth: 6 }
    expect(formatHeadingNumber([1, 1, 1, 1, 2, 3], numbering)).toBe('I.1.a.1.2.3')
  })
})

describe('typstNumberingPattern', () => {
  it('has a symbol for every level', () => {
    expect(typstNumberingPattern(DEFAULT_HEADING_NUMBERING)).toBe('1.1.1.1.1.1')
    expect(
      typstNumberingPattern({
        formats: ['roman', 'alpha', 'roman_lower', 'alpha_lower'],
        depth: 4,
        separator: 'point',
      }),
    ).toBe('I.A.i.a.a.a')
    expect(typstNumberingPattern({ formats: ['arabic'], depth: 2, separator: 'dash' })).toBe(
      '1-1-1-1-1-1',
    )
    expect(typstNumberingPattern({ formats: ['arabic'], depth: 2, separator: 'space' })).toBe(
      '1 1 1 1 1 1',
    )
  })
})

describe('headingNumberingOf', () => {
  it('reads the formats of the levels and the depth from a style', () => {
    const { style } = parseStyle(
      '[element.heading]\nnumber_depth = "2"\nnumber_format = "alpha"\n[element.heading_1]\nnumber_format = "roman"',
    )
    expect(headingNumberingOf(style)).toEqual({
      formats: ['roman', 'alpha', 'alpha', 'alpha'],
      depth: 2,
      separator: 'point',
    })
  })

  it('is Typst’s own numbering for a style that sets none', () => {
    expect(headingNumberingOf(parseStyle('').style)).toEqual(DEFAULT_HEADING_NUMBERING)
  })

  it('reads the old way of switching numbers off', () => {
    const old = '[element.heading]\nnumbering = "none"'
    expect(headingNumberingOf(parseStyle(old).style).depth).toBe(0)
    expect(parseStyle(old).problems).toEqual([])
    expect(parseSets(old)).toEqual({ heading: { number_depth: '0' } })
    expect(parseSets('[element.heading]\nnumbering = "1.1"')).toEqual({})
  })
})

describe('the separator of the levels', () => {
  it('joins the numbers of a heading and its reference', () => {
    const base = { formats: ['arabic', 'alpha'], depth: 6 } as const
    expect(formatHeadingNumber([2, 3], { ...base, separator: 'dash' })).toBe('2-C')
    expect(formatHeadingNumber([2, 3], { ...base, separator: 'space' })).toBe('2 C')
  })

  it('is read from a style, and is a point where it is not set or not known', () => {
    const read = (s: string) => headingNumberingOf(parseStyle(s).style).separator
    expect(read('[element.heading]\nnumber_separator = "dash"')).toBe('dash')
    expect(read('')).toBe('point')
    expect(read('[element.heading]\nnumber_separator = "x"')).toBe('point')
  })
})

describe('numbering targets and the words of a reference', () => {
  const sec = (level: number, title: string): Target => ({
    kind: 'sec',
    label: `sec-${title}`,
    at: 0,
    labelAt: 0,
    level,
    title,
  })
  const sheet = {
    path: 'a.typ',
    inExport: true,
    targets: [sec(1, 'Eins'), sec(2, 'Zwei'), sec(2, 'Drei'), sec(1, 'Vier')],
  }
  const numbering: HeadingNumbering = {
    formats: ['roman', 'alpha'],
    depth: 1,
    separator: 'point',
  }

  it('numbers headings in the template’s formats, and leaves those below its depth without', () => {
    expect(numberTargets([sheet]).map((t) => t.number)).toEqual(['1', '1.1', '1.2', '2'])
    expect(numberTargets([sheet], numbering).map((t) => t.number)).toEqual(['I', '', '', 'II'])
    expect(numberTargets([sheet], { ...numbering, depth: 2 }).map((t) => t.number)).toEqual([
      'I',
      'I.A',
      'I.B',
      'II',
    ])
  })

  it('names a heading without a number by its title', () => {
    const [one, two] = numberTargets([sheet], numbering)
    const de = supplementsFor('de')
    expect(referenceText(one!, de)).toBe('Abschnitt I')
    expect(referenceText(two!, de)).toBe('„Zwei“')
    expect(referenceText(two!, supplementsFor('en'))).toBe('“Zwei”')
  })

  it('does not take a sheet outside the export for an unnumbered heading', () => {
    const [out] = numberTargets([{ ...sheet, inExport: false }])
    expect(out!.number).toBe('')
    expect(referenceText(out!, supplementsFor('de'))).toBe('Abschnitt ')
  })
})

describe('referenceStyleOf', () => {
  it('has the language\u2019s own words and a colon for a style that sets none', () => {
    const style = referenceStyleOf(parseStyle('').style)
    expect(style.supplements).toEqual({})
    expect(style.captionSeparator).toBe('colon')
    expect(style.numbering).toEqual(DEFAULT_HEADING_NUMBERING)
  })

  it('reads the words, the mark after a caption number and the numbering', () => {
    const { style } = parseStyle(
      '[element.references]\nsupplement_section = "Kap."\nsupplement_figure = "Abb."\nsupplement_table = " Tab. "\n[element.figure_caption]\ncaption_separator = "period"\n[element.heading]\nnumber_depth = "2"',
    )
    const read = referenceStyleOf(style)
    expect(read.supplements).toEqual({ sec: 'Kap.', fig: 'Abb.', tbl: 'Tab.' })
    expect(read.captionSeparator).toBe('period')
    expect(read.numbering.depth).toBe(2)
  })
})
