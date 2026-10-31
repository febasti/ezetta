import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  OUTPUT_FILE,
  MAIN_FILE,
  PREVIEW_DIR,
  PREVIEW_PAGE_PATTERN,
  buildExport,
} from '@core/export/build'
import { sampleSheet, sampleTitle } from '@core/export/sample'
import type { SampleLanguage } from '@core/export/sample'
import type { PreparedExport } from '@core/project/session'
import { parseDiagnostics } from '@core/export/diagnostics'
import type { Diagnostic } from '@core/export/diagnostics'
import type { ExportProfile } from '@core/export/profile'
import {
  applyOptionOverrides,
  mergeSets,
  parseCustom,
  parseSets,
  setsToToml,
} from '@core/export/custom'
import type { OptionOverride, Sets } from '@core/export/custom'
import { DEFAULT_TEMPLATE } from '@core/export/profile'
import { parseStyle } from '@core/export/style'
import { referenceStyleOf } from '@core/export/numbering'
import type { ReferenceStyle } from '@core/export/numbering'
import { CITATION_STYLES } from '@core/export/styles'
import { parseTemplate, resolveOptions } from '@core/export/template'
import type { TemplateInfo } from '@core/export/template'
import { IpcFailure } from '@shared/ipc'
import type { z } from 'zod'
import type {
  exportInfoSchema,
  exportPreviewSchema,
  exportResultSchema,
  thumbnailSchema,
} from '@shared/export'
import { unwrap } from './projectHost'
import type { ProjectHost } from './projectHost'
import { writeFileAtomic } from './rootedFs'

/**
 * The export: the project's files are prepared by the core, the bundled Typst compiles
 * them (a child process, `spawn`, fixed arguments, `--root` at the project, system fonts ignored so
 * the output is the same on every machine), and the PDF is put where the writer said.
 */

export type ExportInfo = z.infer<typeof exportInfoSchema>
export type ExportPreview = z.infer<typeof exportPreviewSchema>
export type ExportResult = z.infer<typeof exportResultSchema>
export type Thumbnail = z.infer<typeof thumbnailSchema>

export interface Template {
  info: TemplateInfo
  files: { path: string; content: string }[]
  /** Set for the writer's own template: the bundled one it is made from, and the values it changes. */
  custom: { base: string; overrides: Sets; options: Record<string, OptionOverride> } | null
  /** The folder of the font files the writer added, when there are any. */
  fontsDir: string | null
}

/**
 * The templates: the bundled ones in `dir` (each a folder with `template.toml` and `style.toml`; the
 * engine `engine.typ` next to the folders is shared, and a template that has a `lib.typ` of its own
 * uses that), then the writer's own in `customDir` (each a folder with `custom.toml` naming its
 * base, and a `style.toml` of only the values changed; see `core/export/custom.ts`).
 */
export async function loadTemplates(
  dir: string,
  customDir?: string,
): Promise<{ templates: Template[]; prelude: string }> {
  const templates: Template[] = []
  let prelude = ''
  try {
    prelude = await readFile(join(dir, 'prelude.typ'), 'utf8')
    const engine = await readFile(join(dir, 'engine.typ'), 'utf8').catch(() => '')
    // The margin notes (a vendored package) are shared like the engine, which imports them.
    const marginNotes = await readFile(join(dir, 'marginalia.typ'), 'utf8').catch(() => '')
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folder = join(dir, entry.name)
      let toml: string
      try {
        toml = await readFile(join(folder, 'template.toml'), 'utf8')
      } catch {
        continue
      }
      const info = parseTemplate(toml)
      if (!info.ok) continue
      const files: Template['files'] = []
      for (const file of await readdir(folder)) {
        if (file === 'template.toml' || !/\.(typ|toml|csl)$/.test(file)) continue
        files.push({ path: file, content: await readFile(join(folder, file), 'utf8') })
      }
      if (engine && !files.some((file) => file.path === 'lib.typ'))
        files.push({ path: 'lib.typ', content: engine })
      if (marginNotes) files.push({ path: 'marginalia.typ', content: marginNotes })
      templates.push({ info: info.value, files, custom: null, fontsDir: null })
    }
  } catch {
    // No templates folder: nothing to export with.
  }
  if (customDir) templates.push(...(await loadCustomTemplates(customDir, templates)))
  return { templates, prelude }
}

/** The folder of the fonts of a custom template, inside its folder. */
export const FONTS_DIR = 'fonts'

/** The folder when it has files in it, else null. */
async function hasFiles(dir: string): Promise<string | null> {
  try {
    return (await readdir(dir)).length > 0 ? dir : null
  } catch {
    return null
  }
}

async function loadCustomTemplates(dir: string, bundled: readonly Template[]): Promise<Template[]> {
  const out: Template[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const custom = parseCustom(await readFile(join(dir, entry.name, 'custom.toml'), 'utf8'))
      // The folder is named after the id, so an id can never point somewhere else.
      if (!custom || custom.id !== entry.name || bundled.some((t) => t.info.id === custom.id))
        continue
      const base = bundled.find((t) => t.info.id === custom.base)
      if (!base) continue
      const overrides = parseSets(
        await readFile(join(dir, entry.name, 'style.toml'), 'utf8').catch(() => ''),
      )
      const baseSets = parseSets(base.files.find((f) => f.path === 'style.toml')?.content ?? '')
      const style = { path: 'style.toml', content: setsToToml(mergeSets(baseSets, overrides)) }
      out.push({
        info: {
          ...base.info,
          id: custom.id,
          name: { de: custom.name, en: custom.name },
          options: applyOptionOverrides(base.info.options, custom.options),
        },
        files: [...base.files.filter((f) => f.path !== 'style.toml'), style],
        custom: { base: custom.base, overrides, options: custom.options },
        fontsDir: await hasFiles(join(dir, entry.name, FONTS_DIR)),
      })
    } catch {
      // Not a template folder.
    }
  }
  return out.sort((a, b) => a.info.name.de.localeCompare(b.info.name.de))
}

export interface CompileRun {
  code: number | null
  output: string
}
/** What to make: the PDF of an export (the default), or page images for the preview. `signal` stops it. */
export interface CompileOptions {
  preview?: boolean
  signal?: AbortSignal
  /** Folders with font files besides the ones the compiler brings. */
  fontPaths?: readonly string[]
  /** Resolution of the page images; the preview's by default. */
  ppi?: number
}
/** Runs the compiler in the project folder and gathers what it printed. */
export type Compiler = (cwd: string, options?: CompileOptions) => Promise<CompileRun>

/** The resolution of the preview's pages: sharp on a high-resolution screen, about 150 KB a page. */
const PREVIEW_PPI = 150

/** A thumbnail is shown about 130 pixels wide, twice that on a high-resolution screen. */
const THUMBNAIL_PPI = 72

/** How many thumbnails are kept: one per template and look, so a few dozen is plenty. */
const THUMBNAIL_CACHE = 64

/** Whether the compiler can be started: `typst --version` answers. */
export function compilerAvailable(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

export function spawnCompiler(binary: string): Compiler {
  return (cwd, options = {}) =>
    new Promise((resolve) => {
      const child = spawn(
        binary,
        [
          'compile',
          '--root',
          cwd,
          '--ignore-system-fonts',
          ...(options.fontPaths ?? []).flatMap((path) => ['--font-path', path]),
          '--diagnostic-format',
          'short',
          ...(options.preview
            ? ['--format', 'png', '--ppi', String(options.ppi ?? PREVIEW_PPI)]
            : []),
          MAIN_FILE,
          options.preview ? PREVIEW_PAGE_PATTERN : OUTPUT_FILE,
        ],
        {
          cwd,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          signal: options.signal,
          windowsHide: true,
        },
      )
      let output = ''
      const take = (chunk: Buffer): void => {
        if (output.length < 2_000_000) output += chunk.toString('utf8')
      }
      child.stdout.on('data', take)
      child.stderr.on('data', take)
      const timer = setTimeout(() => child.kill(), 180_000)
      child.once('error', () => {
        clearTimeout(timer)
        resolve({ code: null, output })
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve({ code, output })
      })
    })
}

/** Pages in a PDF: its page objects, not the page tree. */
export const countPages = (pdf: Buffer): number | null => {
  const found = pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g)
  return found ? found.length : null
}

export interface ExporterDeps {
  host: ProjectHost
  templatesDir: string
  /** The writer's own templates, in the app's data folder. */
  customTemplatesDir?: string
  compiler: Compiler
  /** Whether a compiler can be started at all. */
  available: () => Promise<boolean>
  pickSavePath: (title: string, filterName: string, fileName: string) => Promise<string | null>
  log: (message: string, cause?: unknown) => void
}

type WireDiagnostic = {
  severity: 'error' | 'warning'
  sheet: string | null
  line: number
  message: string
}
const wire = (d: Diagnostic): WireDiagnostic => ({
  severity: d.severity,
  sheet: d.sheet,
  line: d.line,
  message: d.message,
})
export function createExporter(deps: ExporterDeps): {
  info(): Promise<ExportInfo>
  /** How the template of the saved profile numbers headings. */
  numbering(): Promise<ReferenceStyle>
  /** `profile` previews with the profile as it is being edited; without, the saved one. */
  preview(profile?: ExportProfile): Promise<ExportPreview>
  /** Remembers the profile as the project's. */
  saveProfile(profile: ExportProfile): Promise<void>
  /** The first page of a template, made from a sample text. */
  thumbnail(templateId: string, language: SampleLanguage): Promise<Thumbnail>
  run(request: {
    profile: ExportProfile
    dialogTitle: string
    filterName: string
    fileName: string
  }): Promise<ExportResult>
} {
  const warningsOf = (built: PreparedExport): ExportInfo['warnings'] => ({
    unknownCitations: built.unknownCitations,
    emptyImages: built.emptyImages,
    highlights: built.counts.highlights,
    comments: built.counts.comments,
    missingCitations: built.counts.missingCitations,
    checks: built.counts.checks,
    references: built.problems.map((p) => ({
      sheet: p.sheet,
      line: p.line,
      label: p.message.label,
    })),
  })

  async function templateFor(
    profile: ExportProfile,
  ): Promise<{ template: Template; prelude: string }> {
    const { templates, prelude } = await loadTemplates(deps.templatesDir, deps.customTemplatesDir)
    const template =
      templates.find((t) => t.info.id === profile.template) ??
      templates.find((t) => t.info.id === DEFAULT_TEMPLATE) ??
      templates[0]
    if (!template) throw new IpcFailure('not_found', 'No export template is installed')
    return { template, prelude }
  }

  /** The preview in progress, so a newer one (or an export) can stop it, and the queue that keeps two from writing `_build` at once. */
  let previewJob: AbortController | null = null
  let previewQueue: Promise<unknown> = Promise.resolve()

  async function makePreview(
    controller: AbortController,
    given: ExportProfile | undefined,
  ): Promise<ExportPreview> {
    const superseded = (): ExportPreview => ({ ok: false, reason: 'superseded', diagnostics: [] })
    if (controller.signal.aborted) return superseded()
    const session = deps.host.session()
    const root = deps.host.root
    if (!root) throw new IpcFailure('no_project', 'No project is open')
    if (!(await deps.available())) return { ok: false, reason: 'no_compiler', diagnostics: [] }
    const wanted = given ?? session.exportProfile()
    const { template, prelude } = await templateFor(wanted)
    const profile: ExportProfile = {
      ...wanted,
      template: template.info.id,
      options: resolveOptions(template.info, wanted.options),
    }
    unwrap(await session.prepareExport(profile, template, prelude, { write: true }))
    if (controller.signal.aborted) return superseded()
    // The old pages go, so a document that got shorter does not keep its last pages.
    await rm(join(root, PREVIEW_DIR), { recursive: true, force: true })
    await mkdir(join(root, PREVIEW_DIR), { recursive: true })
    const run = await deps.compiler(root, {
      preview: true,
      signal: controller.signal,
      fontPaths: template.fontsDir ? [template.fontsDir] : [],
    })
    if (controller.signal.aborted) return superseded()
    const diagnostics = parseDiagnostics(run.output).map(wire)
    const pages = (await readdir(join(root, PREVIEW_DIR))).filter((f) => /^p-\d+\.png$/.test(f))
    if (run.code !== 0 || pages.length === 0) {
      if (diagnostics.every((d) => d.severity !== 'error'))
        diagnostics.push({
          severity: 'error',
          sheet: null,
          line: 0,
          message: run.output.trim().split('\n').slice(0, 3).join(' ') || 'The compiler failed.',
        })
      return { ok: false, reason: 'failed', diagnostics }
    }
    return { ok: true, pages: pages.length, stamp: String(Date.now()), diagnostics }
  }

  /** Thumbnails made so far, by what they were made from: a template that did not change is not compiled again. */
  const thumbnails = new Map<string, string>()
  let thumbnailQueue: Promise<unknown> = Promise.resolve()

  /** What a thumbnail depends on, as one key: the template's files, its options, its fonts, the language. */
  async function thumbnailKey(template: Template, language: SampleLanguage): Promise<string> {
    const hash = createHash('sha1')
    hash.update(language)
    hash.update(JSON.stringify([template.files, template.info]))
    if (template.fontsDir) {
      for (const file of (await readdir(template.fontsDir)).sort()) {
        const info = await stat(join(template.fontsDir, file))
        hash.update(`${file}:${info.size}:${info.mtimeMs}`)
      }
    }
    return hash.digest('hex')
  }

  async function makeThumbnail(templateId: string, language: SampleLanguage): Promise<Thumbnail> {
    if (!(await deps.available())) return { png: null }
    const { templates, prelude } = await loadTemplates(deps.templatesDir, deps.customTemplatesDir)
    const template = templates.find((t) => t.info.id === templateId)
    if (!template) return { png: null }
    const key = await thumbnailKey(template, language)
    const known = thumbnails.get(key)
    if (known) return { png: known }
    // A folder of its own outside every project: the compiler reads only inside its root.
    const root = await mkdtemp(join(tmpdir(), 'ezetta-thumbnail-'))
    try {
      const built = buildExport({
        title: sampleTitle(language),
        language,
        sheets: [{ path: 'sample.typ', text: sampleSheet(language) }],
        profile: {
          name: 'Thumbnail',
          template: template.info.id,
          citationStyle: CITATION_STYLES[0]!.id,
          marks: 'hide',
          comments: 'remove',
          options: resolveOptions(template.info, {}),
        },
        template,
        prelude,
        bibliography: null,
        blockQuoteMarks: false,
        quoteStyle: 'auto',
      })
      for (const file of built.files) {
        await mkdir(dirname(join(root, file.path)), { recursive: true })
        await writeFile(join(root, file.path), file.content)
      }
      await mkdir(join(root, PREVIEW_DIR), { recursive: true })
      const run = await deps.compiler(root, {
        preview: true,
        ppi: THUMBNAIL_PPI,
        fontPaths: template.fontsDir ? [template.fontsDir] : [],
      })
      const pages = (await readdir(join(root, PREVIEW_DIR)))
        .map((f) => /^p-(\d+)\.png$/.exec(f))
        .flatMap((m) => (m ? [Number(m[1])] : []))
        .sort((a, b) => a - b)
      // The last page: a title page and contents, where a template has them, come before the text.
      const last = pages[pages.length - 1]
      if (run.code !== 0 || last === undefined) return { png: null }
      const png = (await readFile(join(root, PREVIEW_DIR, `p-${last}.png`))).toString('base64')
      if (thumbnails.size >= THUMBNAIL_CACHE) thumbnails.delete(thumbnails.keys().next().value!)
      thumbnails.set(key, png)
      return { png }
    } catch (cause) {
      deps.log('a thumbnail could not be made', cause)
      return { png: null }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  return {
    preview(profile) {
      previewJob?.abort()
      const controller = new AbortController()
      previewJob = controller
      const result = previewQueue.then(() => makePreview(controller, profile))
      previewQueue = result.catch(() => undefined)
      return result
    },

    thumbnail(templateId, language) {
      // One at a time: the list asks for all of them at once, and the compiler should not fight the preview.
      const result = thumbnailQueue.then(() => makeThumbnail(templateId, language))
      thumbnailQueue = result.catch(() => undefined)
      return result
    },

    async saveProfile(profile) {
      unwrap(await deps.host.session().saveExportProfile(profile))
    },

    async numbering() {
      const { template } = await templateFor(deps.host.session().exportProfile())
      const style = template.files.find((file) => file.path === 'style.toml')?.content ?? ''
      return referenceStyleOf(parseStyle(style).style)
    },

    async info() {
      const session = deps.host.session()
      const saved = session.exportProfile()
      const { templates } = await loadTemplates(deps.templatesDir, deps.customTemplatesDir)
      const { template, prelude } = await templateFor(saved)
      const profile: ExportProfile = {
        ...saved,
        template: template.info.id,
        options: resolveOptions(template.info, saved.options),
      }
      const built = unwrap(
        await session.prepareExport(profile, template, prelude, { write: false }),
      )
      return {
        templates: templates.map((t) => ({ ...t.info, builtin: t.custom === null })),
        styles: CITATION_STYLES.map((s) => ({ id: s.id, label: s.label })),
        profile,
        warnings: warningsOf(built),
        compiler: await deps.available(),
      }
    },

    async run(request) {
      // An export and a preview both write `_build`: a preview in progress stops and is waited for.
      previewJob?.abort()
      await previewQueue
      const session = deps.host.session()
      const root = deps.host.root
      if (!root) throw new IpcFailure('no_project', 'No project is open')
      if (!(await deps.available())) return { ok: false, reason: 'no_compiler', diagnostics: [] }
      const target = await deps.pickSavePath(
        request.dialogTitle,
        request.filterName,
        request.fileName,
      )
      if (target === null) return { ok: false, reason: 'cancelled', diagnostics: [] }

      const { template, prelude } = await templateFor(request.profile)
      const profile: ExportProfile = {
        ...request.profile,
        template: template.info.id,
        options: resolveOptions(template.info, request.profile.options),
      }
      unwrap(await session.saveExportProfile(profile))
      unwrap(await session.prepareExport(profile, template, prelude, { write: true }))

      const run = await deps.compiler(root, {
        fontPaths: template.fontsDir ? [template.fontsDir] : [],
      })
      const diagnostics = parseDiagnostics(run.output).map(wire)
      const failed = run.code !== 0
      if (failed) {
        if (diagnostics.every((d) => d.severity !== 'error'))
          diagnostics.push({
            severity: 'error',
            sheet: null,
            line: 0,
            message: run.output.trim().split('\n').slice(0, 3).join(' ') || 'The compiler failed.',
          })
        return { ok: false, reason: 'failed', diagnostics }
      }
      const pdf = await readFile(join(root, OUTPUT_FILE))
      try {
        await writeFileAtomic(target, pdf)
      } catch (cause) {
        deps.log('the PDF could not be written', cause)
        throw new IpcFailure('io', String(cause))
      }
      return { ok: true, path: target, pages: countPages(pdf), diagnostics }
    },
  }
}

/** The font families the compiler finds: its own and those in `fontsDir`, never the system's. */
export function listFontFamilies(binary: string, fontsDir: string | null): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn(
      binary,
      ['fonts', '--ignore-system-fonts', ...(fontsDir ? ['--font-path', fontsDir] : [])],
      { shell: false, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    )
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      if (output.length < 1_000_000) output += chunk.toString('utf8')
    })
    child.once('error', () => resolve([]))
    child.once('exit', () =>
      resolve(
        [
          ...new Set(
            output
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== ''),
          ),
        ].sort((a, b) => a.localeCompare(b)),
      ),
    )
  })
}
