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
  if (def.type === 'length') return LENGTH.test(text) ? text : null
  if (def.type === 'color') {
    if (COLOR.test(text)) return text.toLowerCase()
    return allowToken && isColorToken(text) ? text : null
  }
  if (def.type === 'font') return FONT.test(text) ? text : null
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
