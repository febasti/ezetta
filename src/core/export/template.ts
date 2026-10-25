import { parse } from 'smol-toml'
import { isTable } from '../toml'
import type { TomlTable } from '../toml'

/**
 * What a template tells the app: its name, the options the export dialog offers, and how
 * it numbers headings (which the app needs for cross-references). The dialog is built from this; there
 * is no hand-written settings screen per template.
 */

export type LocalText = { de: string; en: string }

interface OptionBase {
  id: string
  label: LocalText
  /** The writer's own template does not offer it in the export dialog: it keeps its default. */
  hidden?: boolean
}

export type TemplateOption =
  | (OptionBase & { type: 'text'; default: string })
  | (OptionBase & { type: 'bool'; default: boolean })
  | (OptionBase & {
      type: 'enum'
      default: string
      values: { id: string; label: LocalText }[]
    })

export interface TemplateInfo {
  id: string
  name: LocalText
  description: LocalText
  options: TemplateOption[]
}

function local(value: unknown, fallback: string): LocalText {
  if (typeof value === 'string') return { de: value, en: value }
  if (isTable(value)) {
    const de = typeof value['de'] === 'string' ? value['de'] : fallback
    const en = typeof value['en'] === 'string' ? value['en'] : de
    return { de, en }
  }
  return { de: fallback, en: fallback }
}

/** Reads `template.toml`. A template that is not valid is an error with a reason. */
export function parseTemplate(
  text: string,
): { ok: true; value: TemplateInfo } | { ok: false; message: string } {
  let doc: TomlTable
  try {
    doc = parse(text)
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
  }
  const head = isTable(doc['template']) ? doc['template'] : null
  const id = head && typeof head['id'] === 'string' ? head['id'] : null
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) return { ok: false, message: 'template.id is missing' }
  const options: TemplateOption[] = []
  for (const raw of Array.isArray(doc['options']) ? doc['options'] : []) {
    if (!isTable(raw) || typeof raw['id'] !== 'string') continue
    const label = local(raw['label'], raw['id'])
    if (raw['type'] === 'text')
      options.push({
        id: raw['id'],
        type: 'text',
        label,
        default: typeof raw['default'] === 'string' ? raw['default'] : '',
      })
    else if (raw['type'] === 'bool')
      options.push({ id: raw['id'], type: 'bool', label, default: raw['default'] === true })
    else if (raw['type'] === 'enum' && Array.isArray(raw['values'])) {
      const values = raw['values'].flatMap((v: unknown) =>
        typeof v === 'string'
          ? [{ id: v, label: { de: v, en: v } }]
          : isTable(v) && typeof v['id'] === 'string'
            ? [{ id: v['id'], label: local(v['label'], v['id']) }]
            : [],
      )
      if (values.length === 0) continue
      const wanted = typeof raw['default'] === 'string' ? raw['default'] : values[0]!.id
      options.push({
        id: raw['id'],
        type: 'enum',
        label,
        values,
        default: values.some((v) => v.id === wanted) ? wanted : values[0]!.id,
      })
    }
  }
  return {
    ok: true,
    value: {
      id,
      name: local(head!['name'], id),
      description: local(head!['description'], ''),
      options,
    },
  }
}

export type OptionValues = Record<string, string | boolean>

/** The options with a value each: what the profile has, as far as the template knows it, else the default. */
export function resolveOptions(info: TemplateInfo, given: OptionValues): OptionValues {
  const out: OptionValues = {}
  for (const option of info.options) {
    // An option that is not offered cannot have been chosen: what an earlier profile says is ignored.
    const value = option.hidden ? undefined : given[option.id]
    if (option.type === 'bool') out[option.id] = typeof value === 'boolean' ? value : option.default
    else if (option.type === 'enum')
      out[option.id] =
        typeof value === 'string' && option.values.some((v) => v.id === value)
          ? value
          : option.default
    else
      out[option.id] =
        typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim() : option.default
  }
  return out
}
