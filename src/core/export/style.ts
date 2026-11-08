import { parse } from 'smol-toml'
import { isTable } from '../toml'
import { typstString } from '../typst/args'
import {
  asNumberFormat,
  headingNumberingOf,
  numberSymbol,
  typstNumberingPattern,
} from './numbering'
import { ELEMENTS, elementById, PROPS } from './elements'
import { numberIn } from './template'
import type { ElementDef, PropDef } from './elements'

/**
 * A template's style (its `style.toml`), read against the registry of `elements.ts`: each value is
 * checked against a strict pattern, an element that sets none inherits from its parent, and the
 * result is written into the compiler's input as literals of their type, never as code.
 */

// --- checking a value ------------------------------------------------------------------------------

const LENGTH = /^(?:-?(?:\d+(?:\.\d+)?|\.\d+)(?:pt|mm|cm|in|em|%)|0)$/
const COLOR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/

/** Names for the colours of the palette: a colour can be one of these instead of a hex value, and follows the palette. */
export const COLOR_TOKENS: readonly { id: string; de: string; en: string }[] = [
  { id: 'accent', de: 'Akzentfarbe', en: 'Accent colour' },
  { id: 'accent_secondary', de: 'Zweitfarbe', en: 'Second colour' },
]
export const isColorToken = (value: unknown): value is string =>
  typeof value === 'string' && COLOR_TOKENS.some((token) => token.id === value)
const FONT = /^[\p{L}\p{N} .,'&+-]{1,80}$/u
/** A short text the writer types (a word before a number, a title): no code, no markup. */
const TEXT_VALUE = /^[\p{L}\p{N} .,:;()\-–—'/&]{1,40}$/u

/** Millimetres in one unit of an absolute length. */
const MM: Readonly<Record<string, number>> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72 }
/** The width and the height of a custom page: an absolute length from 5 cm to 1.2 m. */
const PAGE_SIZE = new Set(['page_width', 'page_height'])
const pageSizeOk = (text: string): boolean => {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(mm|cm|in|pt)$/.exec(text)
  if (!match) return false
  const mm = Number(match[1]) * MM[match[2]!]!
  return mm >= 50 && mm <= 1200
}

/** A value of the property's type, or null when it is not one (an empty string means "unset" and is null too). */
export function checkValue(
  def: PropDef,
  value: unknown,
  allowToken = true,
): string | boolean | null {
  if (def.type === 'bool') return typeof value === 'boolean' ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '') return null
  if (def.type === 'length') {
    if (PAGE_SIZE.has(def.id)) return pageSizeOk(text) ? text : null
    return LENGTH.test(text) ? text : null
  }
  if (def.type === 'color') {
    if (COLOR.test(text)) return text.toLowerCase()
    return allowToken && isColorToken(text) ? text : null
  }
  if (def.type === 'font') return FONT.test(text) ? text : null
  // The line spacing: a factor of single spacing from 1 to 3 (a comma is read as a point).
  if (def.type === 'factor') return numberIn(text, 1, 3)
  if (def.type === 'text') return TEXT_VALUE.test(value) ? value : null
  return def.values?.includes(text) ? text : null
}

// --- resolving a style ---------------------------------------------------------------------------

export type StyleValue = string | boolean | null
export type ResolvedStyle = Record<string, Record<string, StyleValue>>

export interface StyleProblem {
  /** `element` or `element.property`. */
  where: string
  message: string
}

const BAR_NAMES: Readonly<Record<string, string>> = {
  bar: 'border_left',
  bar_color: 'border_color',
  bar_thickness: 'border_thickness',
  bar_gap: 'border_gap',
}

/**
 * The `[element.<id>]` tables of a style document. A style written before headings had a number
 * format and a depth said `numbering = "none"` for no numbers (and `"1.1"` for the usual ones): that
 * is read as a depth of 0 (or as nothing, the default). One that says `page_break_before` is read
 * as `break_before`.
 */
export function elementTables(doc: unknown): Record<string, unknown> {
  const given = isTable(doc) && isTable(doc['element']) ? doc['element'] : {}
  const out: Record<string, unknown> = { ...given }
  const heading = given['heading']
  if (isTable(heading) && 'numbering' in heading) {
    const { numbering, ...rest } = heading
    out['heading'] =
      numbering === 'none' && !('number_depth' in rest) ? { ...rest, number_depth: '0' } : rest
  }
  // `page_break_before = true | false` became `break_before = "page" | "none"`.
  for (const level of [1, 2, 3, 4]) {
    const table = given[`heading_${level}`]
    if (!isTable(table) || !('page_break_before' in table)) continue
    const { page_break_before: old, ...rest } = table
    out[`heading_${level}`] =
      'break_before' in rest || typeof old !== 'boolean'
        ? rest
        : { ...rest, break_before: old ? 'page' : 'none' }
  }
  // The body text's `line_spacing` and `line_spacing_wide` (a leading, and the one for the option
  // "Zeilenabstand: Weit") became the template's option "Zeilenabstand", a factor the whole document
  // follows: they are left out, quietly.
  const body = out['body']
  if (isTable(body) && ('line_spacing' in body || 'line_spacing_wide' in body)) {
    const rest = { ...body }
    delete rest['line_spacing']
    delete rest['line_spacing_wide']
    out['body'] = rest
  }
  // `number_suffix` was a choice of mark and became a text after the number.
  for (const id of ['heading', 'heading_1', 'heading_2', 'heading_3', 'heading_4']) {
    const table = out[id]
    if (!isTable(table) || !('number_suffix' in table)) continue
    if (!['none', 'point', 'paren'].includes(table['number_suffix'] as string)) continue
    const { number_suffix: mark, ...rest } = table
    out[id] = mark === 'none' ? rest : { ...rest, number_suffix: mark === 'point' ? '.' : ')' }
  }
  // The bar at the left of a block quote became a line on any side, the left one among them.
  const quote = out['quote']
  if (isTable(quote) && Object.keys(BAR_NAMES).some((old) => old in quote))
    out['quote'] = Object.fromEntries(
      Object.entries(quote).map(([key, value]) => [BAR_NAMES[key] ?? key, value]),
    )
  return out
}

/**
 * Reads a style's `[element.<id>]` tables (the format of `style.toml`, sparse or complete) and
 * resolves every element: its own value, else the element's built-in default, else its parent's. A value that is not
 * valid for its property, an element or property this engine does not know, are reported and left
 * out, so a damaged style still gives a document.
 */
export function resolveStyle(
  doc: unknown,
  options: { keepTokens?: boolean } = {},
): { style: ResolvedStyle; problems: StyleProblem[] } {
  const problems: StyleProblem[] = []
  const root = isTable(doc) ? doc : {}
  const given = elementTables(root)
  for (const key of Object.keys(given))
    if (!elementById(key)) problems.push({ where: key, message: 'unknown element' })

  const own = new Map<string, Record<string, StyleValue>>()
  for (const def of ELEMENTS) {
    const raw = isTable(given[def.id]) ? given[def.id] : {}
    const values: Record<string, StyleValue> = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const property = PROPS[key]
      if (!property || !def.props.includes(key)) {
        problems.push({ where: `${def.id}.${key}`, message: 'unknown property' })
        continue
      }
      // The palette's own colours are colours; a name of one would point to itself.
      const checked = checkValue(property, value, def.id !== 'palette')
      if (checked === null && value !== '')
        problems.push({ where: `${def.id}.${key}`, message: 'not a valid value' })
      if (checked !== null) values[key] = checked
    }
    own.set(def.id, values)
  }

  const style: ResolvedStyle = {}
  const resolve = (def: ElementDef): Record<string, StyleValue> => {
    const done = style[def.id]
    if (done) return done
    const parent = def.parent ? resolve(elementById(def.parent)!) : null
    const out: Record<string, StyleValue> = {}
    for (const key of def.props) {
      const mine = own.get(def.id)![key]
      const builtIn = def.defaults[key] ?? null
      if (mine !== undefined) out[key] = mine
      else if (builtIn !== null) out[key] = builtIn
      else if (parent && parent[key] != null) out[key] = parent[key]!
      else out[key] = null
    }
    style[def.id] = out
    return out
  }
  for (const def of ELEMENTS) resolve(def)
  // A colour that names a palette colour becomes that colour (the editor keeps the name to show it).
  if (!options.keepTokens) {
    const palette = style['palette'] ?? {}
    for (const def of ELEMENTS)
      for (const key of def.props)
        if (PROPS[key]?.type === 'color' && isColorToken(style[def.id]![key]))
          style[def.id]![key] = palette[style[def.id]![key] as string] ?? null
  }
  return { style, problems }
}

/** Parses the text of a `style.toml` and resolves it; a file that is not TOML is a style of defaults, with the reason reported. */
export function parseStyle(text: string): { style: ResolvedStyle; problems: StyleProblem[] } {
  try {
    return resolveStyle(parse(text))
  } catch (cause) {
    const resolved = resolveStyle({})
    resolved.problems.push({
      where: 'style.toml',
      message: cause instanceof Error ? cause.message : String(cause),
    })
    return resolved
  }
}

// --- for the compiler -------------------------------------------------------------------------------

const literal = (def: PropDef, value: StyleValue): string => {
  if (value === null) return 'none'
  if (def.type === 'bool') return value === true ? 'true' : 'false'
  const text = String(value)
  if (def.type === 'length') return text === '0' ? '0pt' : text.replace(/^(-?)\./, '$10.')
  if (def.type === 'color') return `rgb(${typstString(text)})`
  // A factor passed `checkValue` (digits and a point): a number for the compiler.
  if (def.type === 'factor') return /^\d+(\.\d+)?$/.test(text) ? text : 'none'
  return typstString(text)
}

/**
 * The resolved style as Typst source: `#let style = (body: (size: 11pt, …), …)`. Every value is
 * written as a literal of its type after it passed `checkValue`, so the file holds data and no code
 * from the style it came from.
 */
export function styleToTypst(style: ResolvedStyle): string {
  const elements = ELEMENTS.map((def) => {
    const values = style[def.id] ?? {}
    const entries = def.props.map((key) => `${key}: ${literal(PROPS[key]!, values[key] ?? null)}`)
    return `  ${def.id}: (${entries.join(', ')}),`
  })
  const numbering = headingNumberingOf(style)
  return [
    "// Generated by the app from the template's style on every export. Do not edit.",
    '#let style = (',
    ...elements,
    ')',
    `#let heading-numbering = (pattern: ${typstString(typstNumberingPattern(numbering))}, depth: ${numbering.depth})`,
    `#let page-numbering = (body: ${typstString(numberSymbol(asNumberFormat(style['page_number']?.['number_format'])))}, front: ${typstString(numberSymbol(asNumberFormat(style['page_number']?.['front_format'] ?? 'roman_lower')))})`,
    '',
  ].join('\n')
}
