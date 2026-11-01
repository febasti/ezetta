import { typstString } from '../typst/args'
import { slotPath, TITELEI_SLOTS } from '../project/paths'
import type { TiteleiSlot } from '../project/paths'
import type { TiteleiFields } from '../project/manifest'
import { parseTypst } from '../typst/parser'
import { quoteStyleSetRule } from '../typst/quoteStyle'
import type { QuoteStyle } from '../typst/quoteStyle'
import { numberTargets, referenceText, scanTargets, supplementsFor } from '../typst/targets'
import type { NumberedTarget } from '../typst/targets'
import type { ExportProfile } from './profile'
import { preprocessSheet } from './preprocess'
import { parseStyle, styleToTypst } from './style'
import type { ResolvedStyle } from './style'
import { referenceStyleOf } from './numbering'
import type { HeadingNumbering, SupplementOverrides } from './numbering'
import { typstStyleFor } from './styles'
import { resolveOptions } from './template'
import type { OptionValues, TemplateInfo } from './template'

/**
 * The files of one export: the preprocessed copies of the sheets, the
 * prelude, the template, and the generated main file that ties them together. Everything is written
 * under `_build/`, which the compiler may read because it is inside the project; nothing of the
 * project's own files is changed.
 */

export const BUILD_DIR = '_build'
export const MAIN_FILE = `${BUILD_DIR}/main.typ`
export const OUTPUT_FILE = `${BUILD_DIR}/out.pdf`
/** The pages of the preview, one PNG each, `p-1.png`, `p-2.png`, …: temporary, made again on every refresh. */
export const PREVIEW_DIR = `${BUILD_DIR}/preview`
export const PREVIEW_PAGE_PATTERN = `${PREVIEW_DIR}/p-{p}.png`

/** The title page fields and the sheets of the Titelei's slots, as the export gets them. */
export interface TiteleiInput extends TiteleiFields {
  /** The filled slots with their text, in any order (the template places them). */
  parts: { slot: TiteleiSlot; text: string }[]
}

export const EMPTY_TITELEI: TiteleiInput = {
  subtitle: '',
  authors: [],
  date: '',
  version: '',
  parts: [],
}

/** Where the preprocessed copy of a slot's sheet is written, relative to `_build/content/`. */
export const partFile = (slot: TiteleiSlot): string => `titelei/${slot}.typ`

export interface BuildInput {
  title: string
  /** The project language, for example "de". */
  language: string
  /** The sheets in the export, in export order, as they are on disk. */
  sheets: { path: string; text: string }[]
  profile: ExportProfile
  template: { info: TemplateInfo; files: { path: string; content: string }[] }
  prelude: string
  /** The bibliography as a Typst path from the project root (`/library.bib`), or null for none. */
  bibliography: string | null
  /**
   * The keys of the works the bibliography has. A citation of any other key (that is no label of the
   * export either) prints as a placeholder instead of stopping the compiler. Without it, every
   * citation is left as it is.
   */
  works?: ReadonlySet<string>
  blockQuoteMarks: boolean
  /** The title page fields and the Titelei's sheets. Without it the title page has only the title. */
  titelei?: TiteleiInput
  /** The kind of quotation marks; `auto` (the default) leaves them to the project language. */
  quoteStyle?: QuoteStyle
}

export interface ExportFile {
  /** Relative to the project folder. */
  path: string
  content: string
}

/** Something wrong in a sheet that the compiler would say less clearly, found before it runs. */
export interface SheetProblem {
  sheet: string
  line: number
  message: { kind: 'reference'; label: string }
}

export interface BuildCounts {
  highlights: number
  comments: number
  missingCitations: number
  checks: number
}

export interface BuildOutput {
  files: ExportFile[]
  main: string
  problems: SheetProblem[]
  counts: BuildCounts
}

const lang = (language: string): string => language.slice(0, 2).toLowerCase()

/** A Typst value for an option: a string or a boolean. */
const literal = (value: string | boolean): string =>
  typeof value === 'boolean' ? String(value) : typstString(value)

/** The names of the authors as one line for the running head and the file's properties: "A, B und C". */
export function authorLine(names: readonly string[], language: string): string {
  if (names.length <= 1) return names[0] ?? ''
  const and = lang(language) === 'de' ? 'und' : 'and'
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

/** `2026-10-31` as the title page prints a day: `31.10.2026`. */
const dayText = (iso: string): string => iso.split('-').reverse().join('.')

const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ')

/**
 * The dictionary the template's `project(meta, …)` receives: the title, the language, the options,
 * and the fields of the title page. `author` is the line of all names; `authors` the list with the
 * affiliations; `date_text` is there only for a fixed day (else the template prints the day of the
 * export); `parts` holds the Titelei's sheets as content.
 */
function metaLiteral(
  title: string,
  language: string,
  options: OptionValues,
  titelei: TiteleiInput,
): string {
  const authors = titelei.authors.filter((author) => author.name !== '')
  const subtitle = titelei.subtitle
  const own = ['title', 'lang', 'author', 'authors', 'subtitle', 'date_text', 'version', 'parts']
  const parts = TITELEI_SLOTS.filter((slot) => titelei.parts.some((part) => part.slot === slot))
  const entries = [
    `title: ${typstString(oneLine(title))}`,
    `lang: ${typstString(lang(language))}`,
    `author: ${typstString(
      authorLine(
        authors.map((a) => oneLine(a.name)),
        language,
      ),
    )}`,
    `authors: (${authors
      .map(
        (a) =>
          `(name: ${typstString(oneLine(a.name))}, affiliation: ${typstString(oneLine(a.affiliation))})`,
      )
      .join(', ')}${authors.length === 1 ? ',' : ''})`,
    `subtitle: ${typstString(oneLine(subtitle))}`,
    `version: ${typstString(oneLine(titelei.version))}`,
    ...(titelei.date !== '' ? [`date_text: ${typstString(dayText(titelei.date))}`] : []),
    `parts: (${parts.map((slot) => `${slot}: include ${typstString(`content/${partFile(slot)}`)}`).join(', ')}${parts.length === 0 ? ':' : ''})`,
    ...Object.entries(options)
      .filter(([key]) => /^[a-z][a-z0-9_]*$/.test(key) && !own.includes(key))
      .map(([key, value]) => `${key}: ${literal(value)}`),
  ]
  return `(${entries.join(', ')})`
}

/** The text of a link to a heading: its number as the template prints it, or its title. */
function headingTexts(
  sheets: BuildInput['sheets'],
  numbering: HeadingNumbering,
  supplement: SupplementOverrides,
  language: string,
): (label: string) => string | null {
  const numbered = numberTargets(
    sheets.map((sheet) => ({
      path: sheet.path,
      inExport: true,
      targets: scanTargets(parseTypst(sheet.text), sheet.text),
    })),
    numbering,
  )
  const byLabel = new Map<string, NumberedTarget>(
    numbered.flatMap((t) => (t.kind === 'sec' && t.label ? [[t.label, t] as const] : [])),
  )
  const supplements = { ...supplementsFor(language), ...supplement }
  return (label) => {
    const target = byLabel.get(label)
    return target ? referenceText(target, supplements) : null
  }
}

const bibliographyTitle = (language: string): string =>
  lang(language) === 'de' ? 'Literaturverzeichnis' : 'Bibliography'

/** The title the template sets for the bibliography, or the language's own. */
const bibliographyTitleOf = (style: ResolvedStyle, language: string): string => {
  const own = style['bibliography']?.['title_text']
  return typeof own === 'string' ? own : bibliographyTitle(language)
}

export function buildExport(input: BuildInput): BuildOutput {
  const { profile, template } = input
  const style = parseStyle(
    template.files.find((file) => file.path === 'style.toml')?.content ?? '',
  ).style
  const references = referenceStyleOf(style)
  const headingText = headingTexts(
    input.sheets,
    references.numbering,
    references.supplements,
    input.language,
  )
  const files: ExportFile[] = []
  const problems: SheetProblem[] = []
  const counts: BuildCounts = { highlights: 0, comments: 0, missingCitations: 0, checks: 0 }

  // What a citation may name: a work, or a label of the export (a cross-reference written `@label`).
  const labels = new Set(
    input.sheets.flatMap((sheet) =>
      scanTargets(parseTypst(sheet.text), sheet.text).flatMap((t) => (t.label ? [t.label] : [])),
    ),
  )
  const works = input.works
  const unknownWork = works ? (key: string) => !works.has(key) && !labels.has(key) : undefined

  const includes: string[] = []
  for (const sheet of input.sheets) {
    const done = preprocessSheet(sheet.text, {
      marks: profile.marks,
      comments: profile.comments,
      headingText,
      ...(unknownWork ? { unknownWork } : {}),
    })
    files.push({ path: `${BUILD_DIR}/content/${sheet.path}`, content: done.text })
    for (const problem of done.problems)
      problems.push({
        sheet: sheet.path,
        line: problem.line,
        message: { kind: 'reference', label: problem.label },
      })
    for (const key of Object.keys(counts) as (keyof BuildCounts)[]) counts[key] += done.counts[key]
    includes.push(`#include ${typstString(`content/${sheet.path}`)}`)
  }

  const titelei = input.titelei ?? EMPTY_TITELEI
  for (const part of titelei.parts) {
    const done = preprocessSheet(part.text, {
      marks: profile.marks,
      comments: profile.comments,
      headingText,
      ...(unknownWork ? { unknownWork } : {}),
    })
    files.push({ path: `${BUILD_DIR}/content/${partFile(part.slot)}`, content: done.text })
    for (const problem of done.problems)
      problems.push({
        sheet: slotPath(part.slot),
        line: problem.line,
        message: { kind: 'reference', label: problem.label },
      })
    for (const key of Object.keys(counts) as (keyof BuildCounts)[]) counts[key] += done.counts[key]
  }

  const options = resolveOptions(template.info, profile.options)
  const main = [
    '// Generated by the app on every export. Do not edit.',
    `// Project: ${input.title.replace(/[\r\n]+/g, ' ')}`,
    '#import "prelude.typ": *',
    '#import "template/lib.typ": project',
    `#show: project.with(${metaLiteral(input.title, input.language, options, titelei)})`,
    ...[quoteStyleSetRule(input.quoteStyle ?? 'auto')].filter((rule) => rule !== null),
    ...(input.blockQuoteMarks ? ['#set quote(quotes: true)'] : []),
    '',
    // A paragraph break between sheets, so the last paragraph of one is not joined to the next.
    includes.join('\n#parbreak()\n'),
    ...(input.bibliography
      ? [
          '',
          `#bibliography(${typstString(input.bibliography)}, title: ${typstString(bibliographyTitleOf(style, input.language))}, style: ${typstString(typstStyleFor(profile.citationStyle))})`,
        ]
      : []),
    '',
  ].join('\n')

  files.push(
    { path: MAIN_FILE, content: main },
    { path: `${BUILD_DIR}/prelude.typ`, content: input.prelude },
    ...template.files.map((file) => ({
      path: `${BUILD_DIR}/template/${file.path}`,
      content: file.content,
    })),
    {
      path: `${BUILD_DIR}/template/style.typ`,
      content: styleToTypst(style),
    },
  )
  return { files, main: MAIN_FILE, problems, counts }
}
