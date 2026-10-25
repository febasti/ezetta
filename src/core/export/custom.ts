import { currentTemplateId } from './legacy'
import { parse, stringify } from 'smol-toml'
import { isTable } from '../toml'
import { ELEMENTS, PROPS } from './elements'
import { checkValue, elementTables } from './style'
import type { TemplateOption } from './template'

/**
 * The writer's own templates. A custom template is a base template plus the values the
 * writer changed: `custom.toml` names it and its base, and its `style.toml` holds only those values,
 * in the format of every style (`[element.heading_2]`). What the writer did not change is read from
 * the base every time, so an improvement to the base reaches it, and "reset" is deleting the value.
 */

/** What a style sets: element id, then property id, then the value. Sparse. */
export type Sets = Record<string, Record<string, string | boolean>>

/** The valid values a style document sets; anything unknown or invalid is left out (see `resolveStyle` for reporting it). */
export function setsOf(doc: unknown): Sets {
  const given = elementTables(doc)
  const sets: Sets = {}
  for (const def of ELEMENTS) {
    const raw = given[def.id]
    if (!isTable(raw)) continue
    for (const key of def.props) {
      const checked = checkValue(PROPS[key]!, raw[key], def.id !== 'palette')
      if (checked !== null) (sets[def.id] ??= {})[key] = checked
    }
  }
  return sets
}

/** Reads the text of a `style.toml`; a file that is not TOML sets nothing. */
export function parseSets(text: string): Sets {
  try {
    return setsOf(parse(text))
  } catch {
    return {}
  }
}

/** `over` on top of `base`, property by property. */
export function mergeSets(base: Sets, over: Sets): Sets {
  const out: Sets = {}
  for (const [element, values] of Object.entries(base)) out[element] = { ...values }
  for (const [element, values] of Object.entries(over))
    out[element] = { ...out[element], ...values }
  return out
}

/** The text of a `style.toml` for these values. */
export function setsToToml(sets: Sets): string {
  const element: Sets = {}
  for (const def of ELEMENTS) {
    const values = sets[def.id]
    if (values && Object.keys(values).length > 0) element[def.id] = values
  }
  return stringify({ engine: 2, element })
}

/** `sets` with one value set, or with it removed (`null`: back to what the base says). A value that does not fit is refused. */
export function setValue(
  sets: Sets,
  elementId: string,
  propId: string,
  value: string | boolean | null,
): { ok: true; sets: Sets } | { ok: false; message: string } {
  const def = ELEMENTS.find((e) => e.id === elementId)
  if (!def) return { ok: false, message: `unknown element ${elementId}` }
  const prop = PROPS[propId]
  if (!prop || !def.props.includes(propId))
    return { ok: false, message: `${elementId} has no property ${propId}` }
  const next: Sets = {}
  for (const [element, values] of Object.entries(sets)) next[element] = { ...values }
  if (value === null) {
    const own = next[elementId]
    if (own) {
      delete own[propId]
      if (Object.keys(own).length === 0) delete next[elementId]
    }
    return { ok: true, sets: next }
  }
  const checked = checkValue(prop, value, elementId !== 'palette')
  if (checked === null) return { ok: false, message: `${value} is not a value for ${propId}` }
  ;(next[elementId] ??= {})[propId] = checked
  return { ok: true, sets: next }
}

/** What the writer changed about an option of the base: its default, and whether the dialog offers it. */
export interface OptionOverride {
  default?: string | boolean
  hidden?: boolean
}

export interface CustomInfo {
  id: string
  name: string
  base: string
  /** By option id. */
  options: Record<string, OptionOverride>
}

const ID = /^[a-z][a-z0-9-]{0,59}$/

/** Reads `custom.toml`; null when it is not a custom template's. */
export function parseCustom(text: string): CustomInfo | null {
  let doc: unknown
  try {
    doc = parse(text)
  } catch {
    return null
  }
  if (!isTable(doc)) return null
  const { id, name, base } = doc
  if (typeof id !== 'string' || !ID.test(id)) return null
  if (typeof base !== 'string' || !ID.test(base)) return null
  if (typeof name !== 'string' || name.trim() === '') return null
  const options: Record<string, OptionOverride> = {}
  const given = isTable(doc['options']) ? doc['options'] : {}
  for (const [key, raw] of Object.entries(given)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key) || !isTable(raw)) continue
    const value = raw['default']
    const override: OptionOverride = {}
    if (typeof value === 'string' || typeof value === 'boolean')
      override.default = typeof value === 'string' ? value.slice(0, 500) : value
    if (typeof raw['hidden'] === 'boolean') override.hidden = raw['hidden']
    if (Object.keys(override).length > 0) options[key] = override
  }
  return { id, name: name.trim().slice(0, MAX_NAME), base: currentTemplateId(base), options }
}

export const customToToml = (info: CustomInfo): string =>
  stringify({
    id: info.id,
    name: info.name,
    base: info.base,
    ...(Object.keys(info.options).length > 0 ? { options: info.options } : {}),
  })

/** Whether `value` is one the option can have. */
export function optionAccepts(option: TemplateOption, value: unknown): value is string | boolean {
  if (option.type === 'bool') return typeof value === 'boolean'
  if (typeof value !== 'string') return false
  if (option.type === 'enum') return option.values.some((v) => v.id === value)
  return value.length <= 500 && !/[\r\n]/.test(value)
}

/** The base's options with the writer's changes: another default, or not offered. A change that does not fit its option is left out. */
export function applyOptionOverrides(
  options: readonly TemplateOption[],
  overrides: Readonly<Record<string, OptionOverride>>,
): TemplateOption[] {
  return options.map((option) => {
    const change = overrides[option.id]
    if (!change) return option
    const next = { ...option } as TemplateOption
    if (change.default !== undefined && optionAccepts(option, change.default))
      (next as { default: string | boolean }).default = change.default
    if (change.hidden === true) next.hidden = true
    return next
  })
}

/** `options` with one option's change set (`null` takes a field back to the base's). Null when the option is unknown or the value does not fit. */
export function setOptionOverride(
  options: Readonly<Record<string, OptionOverride>>,
  base: readonly TemplateOption[],
  optionId: string,
  patch: { default?: string | boolean | null; hidden?: boolean | null },
): Record<string, OptionOverride> | null {
  const option = base.find((o) => o.id === optionId)
  if (!option) return null
  const next: OptionOverride = { ...options[optionId] }
  if (patch.default !== undefined) {
    if (patch.default === null) delete next.default
    else if (optionAccepts(option, patch.default)) next.default = patch.default
    else return null
  }
  if (patch.hidden !== undefined) {
    if (patch.hidden === null || patch.hidden === false) delete next.hidden
    else next.hidden = true
  }
  const out = { ...options }
  if (Object.keys(next).length === 0) delete out[optionId]
  else out[optionId] = next
  return out
}

export const MAX_NAME = 80

/** A name the writer typed, tidied; null when nothing is left. */
export function cleanName(name: string): string | null {
  const tidy = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  return tidy === '' ? null : tidy
}

/** An id from a name that is not in `taken`: `meine-vorlage`, then `meine-vorlage-2`. */
export function newTemplateId(name: string, taken: readonly string[]): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const stem = /^[a-z]/.test(slug) ? slug : `vorlage-${slug}`.replace(/-+$/, '')
  if (!taken.includes(stem)) return stem
  for (let n = 2; ; n++) if (!taken.includes(`${stem}-${n}`)) return `${stem}-${n}`
}

/** The font files Typst reads. */
export const FONT_EXTENSIONS: readonly string[] = ['.ttf', '.otf', '.ttc', '.otc']

/** The most a font file may weigh: a family with its styles is a few MB, so this stops a wrong file, not a big font. */
export const MAX_FONT_BYTES = 40_000_000

/** A file name for a font copied into a template: the name without any path, in plain characters; null when it is not a font file. */
export function fontFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return null
  const extension = base.slice(dot).toLowerCase()
  if (!FONT_EXTENSIONS.includes(extension)) return null
  const stem = base
    .slice(0, dot)
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/^\.+/, '')
    .slice(0, 80)
  return stem === '' ? null : `${stem}${extension}`
}
