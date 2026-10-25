/**
 * How a template numbers its headings: the format of each level and how deep the numbers
 * go. The export prints the numbers through Typst's numbering patterns; the editor and the cross
 * references count them here, so a reference says "Abschnitt II.3" where the PDF prints II.3.
 */

export type NumberFormat = 'arabic' | 'roman' | 'roman_lower' | 'alpha' | 'alpha_lower'

export const NUMBER_FORMATS: readonly NumberFormat[] = [
  'arabic',
  'roman',
  'roman_lower',
  'alpha',
  'alpha_lower',
]

export type NumberSeparator = 'point' | 'dash' | 'space'

const SEPARATOR: Record<NumberSeparator, string> = { point: '.', dash: '-', space: ' ' }

export interface HeadingNumbering {
  /** The format of levels 1 to 4; a deeper level takes the last. */
  formats: readonly NumberFormat[]
  /** The deepest level that is numbered: 0 numbers none. */
  depth: number
  /** What joins the numbers of the levels: `2.3`, `2-3`, `2 3`. */
  separator: NumberSeparator
}

/** Levels the engine has a style for: deeper headings are styled like the last. */
export const STYLED_LEVELS = 4
/** The deepest level of a heading in Typst's markup that the numbering covers. */
export const MAX_DEPTH = 6

export const DEFAULT_HEADING_NUMBERING: HeadingNumbering = {
  formats: ['arabic', 'arabic', 'arabic', 'arabic'],
  depth: MAX_DEPTH,
  separator: 'point',
}

const ROMAN: readonly (readonly [string, number])[] = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
]

/** A counter in a format, as Typst prints it: roman numerals, letters (`a`, …, `z`, `aa`, `bb`, …) or digits. */
export function formatCounter(n: number, format: NumberFormat): string {
  if (format === 'arabic') return String(n)
  if (format === 'roman' || format === 'roman_lower') {
    // Typst prints zero as "N" and does not go below it.
    if (n <= 0) return format === 'roman' ? 'N' : 'n'
    let rest = n
    let out = ''
    for (const [symbol, value] of ROMAN)
      while (rest >= value) {
        out += symbol
        rest -= value
      }
    return format === 'roman' ? out : out.toLowerCase()
  }
  if (n <= 0) return '0'
  const letter = String.fromCharCode((format === 'alpha' ? 65 : 97) + ((n - 1) % 26))
  return letter.repeat(Math.floor((n - 1) / 26) + 1)
}

const formatOfLevel = (numbering: HeadingNumbering, level: number): NumberFormat =>
  numbering.formats[Math.min(level, numbering.formats.length) - 1] ?? 'arabic'

/** The number of a heading from the counters of its levels (`[2, 3]` for 2.3), or "" where it has none. */
export function formatHeadingNumber(parts: readonly number[], numbering: HeadingNumbering): string {
  if (parts.length === 0 || parts.length > numbering.depth) return ''
  return parts
    .map((n, i) => formatCounter(n, formatOfLevel(numbering, i + 1)))
    .join(SEPARATOR[numbering.separator])
}

const SYMBOL: Record<NumberFormat, string> = {
  arabic: '1',
  roman: 'I',
  roman_lower: 'i',
  alpha: 'A',
  alpha_lower: 'a',
}

/** The Typst numbering pattern for all levels, such as "I.1.1.1.1.1" (with the separator of the template). */
export const typstNumberingPattern = (numbering: HeadingNumbering): string =>
  Array.from({ length: MAX_DEPTH }, (_, i) => SYMBOL[formatOfLevel(numbering, i + 1)]).join(
    SEPARATOR[numbering.separator],
  )

const isFormat = (value: unknown): value is NumberFormat =>
  typeof value === 'string' && (NUMBER_FORMATS as readonly string[]).includes(value)

/** The numbering a resolved style sets for headings. */
export function headingNumberingOf(
  style: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): HeadingNumbering {
  const formats = Array.from({ length: STYLED_LEVELS }, (_, i) => {
    const value = style[`heading_${i + 1}`]?.['number_format']
    return isFormat(value) ? value : 'arabic'
  })
  const depth = Number(style['heading']?.['number_depth'])
  const separator = style['heading']?.['number_separator']
  return {
    separator: separator === 'dash' || separator === 'space' ? separator : 'point',
    formats,
    depth: Number.isInteger(depth) && depth >= 0 && depth <= MAX_DEPTH ? depth : MAX_DEPTH,
  }
}

/** The Typst counting symbol of a format, such as "1" or "I", for the numbering of pages. */
export const numberSymbol = (format: NumberFormat): string => SYMBOL[format]

/** A format named in a style, or the arabic one for anything else. */
export const asNumberFormat = (value: unknown): NumberFormat => (isFormat(value) ? value : 'arabic')

export type CaptionSeparator = 'colon' | 'period' | 'dash' | 'space'

/** The words the template puts before the number of a reference, where it does not use the language's own. */
export interface SupplementOverrides {
  sec?: string
  fig?: string
  tbl?: string
  eq?: string
}

/** What the editor needs from the template to say what the PDF prints: how headings are numbered, how things are called, and the caption separator. */
export interface ReferenceStyle {
  numbering: HeadingNumbering
  supplements: SupplementOverrides
  captionSeparator: CaptionSeparator
}

const SUPPLEMENT_PROPS: Record<keyof SupplementOverrides, string> = {
  sec: 'supplement_section',
  fig: 'supplement_figure',
  tbl: 'supplement_table',
  eq: 'supplement_equation',
}

export function referenceStyleOf(
  style: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): ReferenceStyle {
  const supplements: SupplementOverrides = {}
  for (const key of Object.keys(SUPPLEMENT_PROPS) as (keyof SupplementOverrides)[]) {
    const value = style['references']?.[SUPPLEMENT_PROPS[key]]
    if (typeof value === 'string' && value.trim() !== '') supplements[key] = value.trim()
  }
  const separator = style['figure_caption']?.['caption_separator']
  return {
    numbering: headingNumberingOf(style),
    supplements,
    captionSeparator:
      separator === 'period' || separator === 'dash' || separator === 'space' ? separator : 'colon',
  }
}
