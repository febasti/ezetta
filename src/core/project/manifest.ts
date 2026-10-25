import { parse, stringify } from 'smol-toml'
import { isTable } from '../toml'
import type { TomlTable } from '../toml'
import type { ExportProfile } from '../export/profile'
import { currentTemplateId } from '../export/legacy'
import type { FootnoteRestart } from '../typst/footnotes'
import { QUOTE_STYLES } from '../typst/quoteStyle'
import type { QuoteStyle } from '../typst/quoteStyle'

export type Status = 'draft' | 'revised' | 'final'
export const STATUSES: readonly Status[] = ['draft', 'revised', 'final']

/** What an icon id may look like. Which ids exist is up to the app, so one from a newer version survives. */
export const ICON_ID = /^[a-z0-9-]{1,32}$/
/** What a colour id may look like (a name like `blue`); an unknown one survives like an icon id. */
export const COLOR_ID = /^[a-z]{1,16}$/

export interface ItemSettings {
  status?: Status
  goal?: number
  /** `false` excludes the item (and everything inside it) from the export. Default: true. */
  export?: boolean
  /** Folder icon in the sidebar (an id like `book`). Default: the plain folder. */
  icon?: string
  /** Colour of the folder icon (a name like `blue`). Default: the plain grey. */
  color?: string
  /** Keys this version does not know. They are written back unchanged. */
  extra?: TomlTable
}

export interface Manifest {
  project: {
    version: 1
    title: string
    language: string
    bibliography: string
    citationStyle: string
  }
  goals: { words?: number }
  /** Numbering of footnotes: continuous, or restarting at each level-1 heading. */
  footnotes: { restart: FootnoteRestart }
  /** Quotation marks around block quotes, and the kind of marks (by default those of the project language). */
  quotes: { blockMarks: boolean; style: QuoteStyle }
  /** Versions of the project, taken automatically. On unless the writer turned them off. */
  history: { enabled: boolean }
  /**
   * Spelling and grammar: the checker's language with its variant (for example `de-AT`;
   * the project language decides when it is missing), the level, the rules and categories turned
   * off, and the project dictionary.
   */
  proofing: {
    language?: string
    level: string
    disabledRules: string[]
    disabledCategories: string[]
    dictionary: string
  }
  /** Export profiles, as written in `[[export]]`. */
  exports: ExportProfile[]
  /** Order of the items in each folder, keyed by folder path inside content/ ("" is the root). */
  order: Record<string, string[]>
  /** Settings per item, keyed by path inside content/. Only items that differ from the defaults. */
  items: Record<string, ItemSettings>
  /** Unknown top-level tables and unknown keys inside known sections (export profiles and so on). */
  extras: {
    project: TomlTable
    goals: TomlTable
    proofing: TomlTable
    footnotes: TomlTable
    quotes: TomlTable
    history: TomlTable
    rest: TomlTable
  }
}

export type ManifestError =
  { code: 'invalid_toml'; message: string } | { code: 'unsupported_version'; version: unknown }

export interface ParsedManifest {
  manifest: Manifest
  /** Things in the file that were ignored. The file itself is never modified by parsing. */
  warnings: string[]
}

export const DEFAULT_BIBLIOGRAPHY = 'library.bib'
export const DEFAULT_DICTIONARY = 'dictionary.txt'

export function defaultManifest(title: string, language = 'de'): Manifest {
  return {
    project: {
      version: 1,
      title,
      language,
      bibliography: DEFAULT_BIBLIOGRAPHY,
      citationStyle: 'apa-7',
    },
    goals: {},
    footnotes: { restart: 'continuous' },
    quotes: { blockMarks: false, style: 'auto' },
    history: { enabled: true },
    proofing: {
      level: 'default',
      disabledRules: [],
      disabledCategories: [],
      dictionary: DEFAULT_DICTIONARY,
    },
    exports: [],
    order: {},
    items: {},
    extras: {
      project: {},
      goals: {},
      proofing: {},
      footnotes: {},
      quotes: {},
      history: {},
      rest: {},
    },
  }
}

function takeKnown(table: TomlTable, known: readonly string[]): TomlTable {
  return Object.fromEntries(Object.entries(table).filter(([key]) => !known.includes(key)))
}

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value !== '' ? value : fallback

export function parseManifest(
  text: string,
): { ok: true; value: ParsedManifest } | { ok: false; error: ManifestError } {
  let doc: TomlTable
  try {
    doc = parse(text)
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: 'invalid_toml',
        message: cause instanceof Error ? cause.message : String(cause),
      },
    }
  }
  const warnings: string[] = []
  const project = isTable(doc['project']) ? doc['project'] : {}
  if (project['version'] !== undefined && project['version'] !== 1) {
    return { ok: false, error: { code: 'unsupported_version', version: project['version'] } }
  }
  const goals = isTable(doc['goals']) ? doc['goals'] : {}
  const proofing = isTable(doc['proofing']) ? doc['proofing'] : {}
  const footnotes = isTable(doc['footnotes']) ? doc['footnotes'] : {}
  const quotes = isTable(doc['quotes']) ? doc['quotes'] : {}
  const history = isTable(doc['history']) ? doc['history'] : {}
  const base = defaultManifest(str(project['title'], 'Untitled'), str(project['language'], 'de'))

  const manifest: Manifest = {
    project: {
      version: 1,
      title: base.project.title,
      language: base.project.language,
      bibliography: str(project['bibliography'], base.project.bibliography),
      citationStyle: str(project['citation_style'], base.project.citationStyle),
    },
    goals: {},
    footnotes: { restart: footnotes['restart'] === 'chapter' ? 'chapter' : 'continuous' },
    quotes: {
      blockMarks: quotes['block_marks'] === true,
      style: QUOTE_STYLES.find((style) => style === quotes['style']) ?? 'auto',
    },
    history: { enabled: history['enabled'] !== false },
    proofing: {
      level: proofing['level'] === 'picky' ? 'picky' : 'default',
      disabledRules: Array.isArray(proofing['disabled_rules'])
        ? proofing['disabled_rules'].filter((r): r is string => typeof r === 'string')
        : [],
      disabledCategories: Array.isArray(proofing['disabled_categories'])
        ? proofing['disabled_categories'].filter((r): r is string => typeof r === 'string')
        : [],
      dictionary: str(proofing['dictionary'], DEFAULT_DICTIONARY),
    },
    exports: readProfiles(doc['export'], base.project.citationStyle),
    order: {},
    items: {},
    extras: {
      project: takeKnown(project, [
        'version',
        'title',
        'language',
        'bibliography',
        'citation_style',
      ]),
      goals: takeKnown(goals, ['words']),
      proofing: takeKnown(proofing, [
        'language',
        'level',
        'disabled_rules',
        'disabled_categories',
        'dictionary',
      ]),
      footnotes: takeKnown(footnotes, ['restart']),
      quotes: takeKnown(quotes, ['block_marks', 'style']),
      history: takeKnown(history, ['enabled']),
      rest: takeKnown(doc, [
        'project',
        'goals',
        'proofing',
        'footnotes',
        'quotes',
        'history',
        'export',
        'order',
        'items',
      ]),
    },
  }
  if (typeof goals['words'] === 'number' && goals['words'] > 0)
    manifest.goals.words = Math.floor(goals['words'])
  if (typeof proofing['language'] === 'string') manifest.proofing.language = proofing['language']
  if (
    footnotes['restart'] !== undefined &&
    footnotes['restart'] !== 'chapter' &&
    footnotes['restart'] !== 'continuous'
  ) {
    warnings.push('footnotes.restart is invalid and was ignored')
  }
  if (quotes['block_marks'] !== undefined && typeof quotes['block_marks'] !== 'boolean') {
    warnings.push('quotes.block_marks is invalid and was ignored')
  }
  if (quotes['style'] !== undefined && !QUOTE_STYLES.some((style) => style === quotes['style'])) {
    warnings.push('quotes.style is invalid and was ignored')
  }
  if (history['enabled'] !== undefined && typeof history['enabled'] !== 'boolean') {
    warnings.push('history.enabled is invalid and was ignored')
  }

  if (isTable(doc['order'])) {
    for (const [folder, list] of Object.entries(doc['order'])) {
      if (Array.isArray(list))
        manifest.order[folder] = [
          ...new Set(list.filter((e): e is string => typeof e === 'string')),
        ]
      else warnings.push(`order."${folder}" is not a list and was ignored`)
    }
  }
  if (isTable(doc['items'])) {
    for (const [path, raw] of Object.entries(doc['items'])) {
      if (!isTable(raw)) {
        warnings.push(`items."${path}" is not a table and was ignored`)
        continue
      }
      const item: ItemSettings = {}
      if (STATUSES.includes(raw['status'] as Status)) item.status = raw['status'] as Status
      else if (raw['status'] !== undefined)
        warnings.push(`items."${path}".status is invalid and was ignored`)
      if (typeof raw['goal'] === 'number' && raw['goal'] > 0) item.goal = Math.floor(raw['goal'])
      if (typeof raw['export'] === 'boolean') item.export = raw['export']
      if (typeof raw['icon'] === 'string' && ICON_ID.test(raw['icon'])) item.icon = raw['icon']
      else if (raw['icon'] !== undefined)
        warnings.push(`items."${path}".icon is invalid and was ignored`)
      if (typeof raw['color'] === 'string' && COLOR_ID.test(raw['color'])) item.color = raw['color']
      else if (raw['color'] !== undefined)
        warnings.push(`items."${path}".color is invalid and was ignored`)
      const extra = takeKnown(raw, ['status', 'goal', 'export', 'icon', 'color'])
      if (Object.keys(extra).length > 0) item.extra = extra
      manifest.items[path] = item
    }
  }
  return { ok: true, value: { manifest, warnings } }
}

const sortedEntries = <T>(record: Record<string, T>): [string, T][] =>
  Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/** Deterministic output: fixed section order, fixed key order, sorted folder and item keys, so
 * merges in git stay clean. Unknown content is preserved. Comments in the file are not. */
export function serializeManifest(manifest: Manifest): string {
  const { project, goals, proofing, extras } = manifest
  const footnotesTable: TomlTable = {
    ...(manifest.footnotes.restart === 'chapter' ? { restart: 'chapter' } : {}),
    ...extras.footnotes,
  }
  const quotesTable: TomlTable = {
    ...(manifest.quotes.blockMarks ? { block_marks: true } : {}),
    ...(manifest.quotes.style !== 'auto' ? { style: manifest.quotes.style } : {}),
    ...extras.quotes,
  }
  const historyTable: TomlTable = {
    ...(manifest.history.enabled ? {} : { enabled: false }),
    ...extras.history,
  }
  const doc: TomlTable = {
    project: {
      version: project.version,
      title: project.title,
      language: project.language,
      bibliography: project.bibliography,
      citation_style: project.citationStyle,
      ...extras.project,
    },
  }
  const goalsTable: TomlTable = {
    ...(goals.words !== undefined ? { words: goals.words } : {}),
    ...extras.goals,
  }
  if (Object.keys(goalsTable).length > 0) doc['goals'] = goalsTable
  doc['proofing'] = {
    ...(proofing.language !== undefined ? { language: proofing.language } : {}),
    level: proofing.level,
    disabled_rules: proofing.disabledRules,
    ...(proofing.disabledCategories.length > 0
      ? { disabled_categories: proofing.disabledCategories }
      : {}),
    dictionary: proofing.dictionary,
    ...extras.proofing,
  }
  if (Object.keys(footnotesTable).length > 0) doc['footnotes'] = footnotesTable
  if (Object.keys(quotesTable).length > 0) doc['quotes'] = quotesTable
  if (Object.keys(historyTable).length > 0) doc['history'] = historyTable
  doc['order'] = Object.fromEntries(sortedEntries(manifest.order))
  const items = sortedEntries(manifest.items).filter(
    ([, item]) => Object.keys(itemTable(item)).length > 0,
  )
  if (items.length > 0)
    doc['items'] = Object.fromEntries(items.map(([path, item]) => [path, itemTable(item)]))
  if (manifest.exports.length > 0) doc['export'] = manifest.exports.map(profileTable)
  Object.assign(doc, extras.rest)
  return `${stringify(doc)}\n`
}

/** `[[export]]`: a profile each; an entry that is not a table is ignored. */
function readProfiles(value: unknown, citationStyle: string): ExportProfile[] {
  if (!Array.isArray(value)) return []
  const out: ExportProfile[] = []
  for (const raw of value) {
    if (!isTable(raw)) continue
    const options: ExportProfile['options'] = {}
    if (isTable(raw['options']))
      for (const [key, v] of Object.entries(raw['options']))
        if (typeof v === 'string' || typeof v === 'boolean') options[key] = v
    out.push({
      name: str(raw['name'], 'Export'),
      template: currentTemplateId(str(raw['template'], 'monographie')),
      citationStyle: str(raw['citation_style'], citationStyle),
      marks: raw['marks'] === 'show' ? 'show' : 'hide',
      comments: raw['comments'] === 'footnote' ? 'footnote' : 'remove',
      options,
    })
  }
  return out
}

function profileTable(profile: ExportProfile): TomlTable {
  return {
    name: profile.name,
    template: profile.template,
    citation_style: profile.citationStyle,
    marks: profile.marks,
    comments: profile.comments,
    ...(Object.keys(profile.options).length > 0 ? { options: profile.options } : {}),
  }
}

function itemTable(item: ItemSettings): TomlTable {
  return {
    ...(item.status !== undefined && item.status !== 'draft' ? { status: item.status } : {}),
    ...(item.goal !== undefined ? { goal: item.goal } : {}),
    ...(item.export === false ? { export: false } : {}),
    ...(item.icon !== undefined ? { icon: item.icon } : {}),
    ...(item.color !== undefined ? { color: item.color } : {}),
    ...item.extra,
  }
}
