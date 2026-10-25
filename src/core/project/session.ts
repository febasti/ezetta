import type { FileSystem } from '../ports'
import { analyzeSheet } from '../typst/text'
import { BUILD_DIR, buildExport } from '../export/build'
import type { BuildInput, BuildOutput } from '../export/build'
import { defaultProfile } from '../export/profile'
import type { ExportProfile } from '../export/profile'
import { citationOverview } from '../typst/citations'
import type { QuoteStyle } from '../typst/quoteStyle'
import { bibliographyForTypst } from '../bib/forTypst'
import { scanFigures } from '../typst/figures'
import { scanTargets } from '../typst/targets'
import { parseTypst } from '../typst/parser'
import { assetFileName, ASSETS_DIR, imageTypeOf, MAX_ASSET_BYTES } from './assets'
import { defaultManifest, parseManifest, serializeManifest } from './manifest'
import type { ItemSettings, Manifest } from './manifest'
import { addEntry, moveEntry, patchItem, removeEntry, withOrder } from './operations'
import {
  basename,
  CONTENT_DIR,
  dirname,
  isSafeRelativePath,
  isSameOrBelow,
  isMaterial,
  isSheetFile,
  join,
  MANIFEST_FILE,
  MATERIAL,
  MATERIAL_DIR,
  nameKey,
  newSheetName,
  projectFile,
  SHEET_EXT,
  treePathOf,
  validateName,
} from './paths'
import type { DiskDir, GroupNode, SheetStats, Warning } from './tree'
import { exportOrder, findNode, NO_STATS, outsideGroups, reconcile } from './tree'
import { parseBibtex } from '../bib/bibtex'
import type { BibLibrary } from '../bib/bibtex'
import type { FootnoteRestart } from '../typst/footnotes'
import { withWord } from '../proof/issues'

export type OpErrorCode =
  | 'not_a_project'
  | 'already_a_project'
  | 'manifest_invalid'
  | 'invalid_name'
  | 'invalid_path'
  | 'invalid_move'
  | 'exists'
  | 'not_found'
  | 'not_an_image'
  | 'too_large'
  | 'not_a_bibliography'
  | 'io'

export interface OpError {
  code: OpErrorCode
  message: string
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: OpError }

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value })
const fail = (code: OpErrorCode, message: string): Outcome<never> => ({
  ok: false,
  error: { code, message },
})

export interface ProjectSnapshot {
  /** Increases with every change, so a late snapshot can be told from a newer one. */
  revision: number
  title: string
  language: string
  citationStyle: string
  goalWords: number | null
  /** How footnotes are numbered across the project. */
  footnoteRestart: FootnoteRestart
  /** Changes whenever the bibliography file does, so the editor knows to read it again. */
  bibliographyStamp: string
  /** The bibliography file as stored: relative to the project, or absolute for a file outside it. */
  bibliographyPath: string
  /** Quotation marks around block quotes, from the project language like all quotation marks. */
  quoteBlockMarks: boolean
  quoteStyle: QuoteStyle
  /** Whether versions of the project are taken automatically. */
  historyEnabled: boolean
  /** Spelling and grammar settings. `language` is '' while the project language decides. */
  proofing: {
    language: string
    level: 'default' | 'picky'
    disabledRules: string[]
    disabledCategories: string[]
  }
  tree: GroupNode
  warnings: Warning[]
  totalWords: number
  totalSheets: number
}

/** An export, and the citations in it that the bibliography has no work for. */
export type PreparedExport = BuildOutput & {
  unknownCitations: { sheet: string; line: number; key: string }[]
  /** Figures whose image is not chosen yet: they print as an empty frame. */
  emptyImages: { sheet: string; line: number }[]
}

export interface RefreshResult {
  snapshot: ProjectSnapshot
  /** Sheets whose content on disk differs from what this session last read or wrote. */
  externallyChanged: string[]
}

/** Small non-cryptographic string hash (cyrb53) to notice content changes without keeping copies. */
/** An absolute path (a file outside the project), as opposed to one relative to the project. */
export const isExternalPath = (path: string): boolean =>
  path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)

function hash(text: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

async function scanDir(fs: FileSystem, path: string): Promise<DiskDir> {
  const dir: DiskDir = { dirs: new Map(), files: [] }
  let entries
  try {
    entries = await fs.readDir(path)
  } catch {
    return dir
  }
  for (const entry of entries) {
    if (entry.kind === 'dir') dir.dirs.set(entry.name, await scanDir(fs, join(path, entry.name)))
    else if (isSheetFile(entry.name)) dir.files.push(entry.name)
  }
  return dir
}

function listSheets(dir: DiskDir, folder = ''): string[] {
  const out = dir.files.map((name) => join(folder, name))
  for (const [name, sub] of dir.dirs) out.push(...listSheets(sub, join(folder, name)))
  return out
}

export class ProjectSession {
  private disk: DiskDir = { dirs: new Map(), files: [] }
  private stats = new Map<string, SheetStats>()
  private hashes = new Map<string, number>()
  /** The bibliography as last read: its path, a stamp of its text, and what it holds. */
  private bibliography = {
    path: '',
    stamp: '',
    library: { entries: [], problems: [] } as BibLibrary,
  }
  private revision = 0
  private queue: Promise<unknown> = Promise.resolve()
  /** Set while project.toml on disk cannot be read. Nothing is written until it is fixed. */
  private manifestProblem: string | null = null
  private manifestWarnings: string[] = []

  private constructor(
    private readonly fs: FileSystem,
    private manifest: Manifest,
  ) {}

  /** Creates the folder skeleton of a new project in an empty location. */
  static async create(
    fs: FileSystem,
    title: string,
    language = 'de',
  ): Promise<Outcome<ProjectSession>> {
    try {
      if (await fs.exists(MANIFEST_FILE))
        return fail('already_a_project', 'This folder already contains a project')
      const manifest = defaultManifest(title, language)
      await fs.mkdir(CONTENT_DIR)
      await fs.mkdir('assets')
      if (!(await fs.exists(manifest.project.bibliography)))
        await fs.writeFileAtomic(manifest.project.bibliography, '')
      if (!(await fs.exists(manifest.proofing.dictionary)))
        await fs.writeFileAtomic(manifest.proofing.dictionary, '')
      await fs.writeFileAtomic(MANIFEST_FILE, serializeManifest(manifest))
      const session = new ProjectSession(fs, manifest)
      await session.rescan(null)
      return ok(session)
    } catch (cause) {
      return fail('io', String(cause))
    }
  }

  static async open(fs: FileSystem): Promise<Outcome<ProjectSession>> {
    let text: string
    try {
      if (!(await fs.exists(MANIFEST_FILE)))
        return fail('not_a_project', 'No project.toml in this folder')
      text = await fs.readFile(MANIFEST_FILE)
    } catch (cause) {
      return fail('io', String(cause))
    }
    const parsed = parseManifest(text)
    if (!parsed.ok) {
      const detail =
        parsed.error.code === 'invalid_toml'
          ? parsed.error.message
          : `unsupported version ${String(parsed.error.version)}`
      return fail('manifest_invalid', detail)
    }
    const session = new ProjectSession(fs, parsed.value.manifest)
    session.manifestWarnings = parsed.value.warnings
    await session.rescan(null)
    await session.moveExcludedFoldersToMaterial()
    return ok(session)
  }

  // --- reading ------------------------------------------------------------------------------

  snapshot(): ProjectSnapshot {
    const { root, warnings } = this.reconciled()
    const all: Warning[] = [
      ...warnings,
      ...this.manifestWarnings.map((message): Warning => ({ kind: 'manifest', message })),
    ]
    if (this.manifestProblem) all.push({ kind: 'manifest', message: this.manifestProblem })
    return {
      revision: this.revision,
      title: this.manifest.project.title,
      language: this.manifest.project.language,
      citationStyle: this.manifest.project.citationStyle,
      goalWords: this.manifest.goals.words ?? null,
      footnoteRestart: this.manifest.footnotes.restart,
      bibliographyStamp: this.bibliography.stamp,
      bibliographyPath: this.manifest.project.bibliography,
      quoteBlockMarks: this.manifest.quotes.blockMarks,
      quoteStyle: this.manifest.quotes.style,
      historyEnabled: this.manifest.history.enabled,
      proofing: {
        language: this.manifest.proofing.language ?? '',
        level: this.manifest.proofing.level === 'picky' ? 'picky' : 'default',
        disabledRules: this.manifest.proofing.disabledRules,
        disabledCategories: this.manifest.proofing.disabledCategories,
      },
      tree: root,
      warnings: all,
      totalWords: root.words,
      totalSheets: root.sheetCount,
    }
  }

  private reconciled(): ReturnType<typeof reconcile> {
    return reconcile(this.manifest, this.disk, (path) => this.stats.get(path) ?? NO_STATS)
  }

  async readSheet(path: string): Promise<Outcome<string>> {
    return this.serial(async () => {
      const checked = this.checkSheetPath(path)
      if (checked) return checked
      try {
        const content = await this.fs.readFile(projectFile(path))
        this.remember(path, content)
        return ok(content)
      } catch (cause) {
        return fail('io', String(cause))
      }
    })
  }

  /** Reads several sheets at once, for the continuous view. Paths that are invalid, gone, or
   * unreadable are left out instead of failing the whole call. */
  async readSheets(
    paths: readonly string[],
  ): Promise<Outcome<{ path: string; content: string }[]>> {
    return this.serial(async () => {
      const out: { path: string; content: string }[] = []
      for (const path of paths) {
        if (this.checkSheetPath(path)) continue
        try {
          const content = await this.fs.readFile(projectFile(path))
          this.remember(path, content)
          out.push({ path, content })
        } catch {
          // the file vanished since the last scan; the next refresh shows it as missing
        }
      }
      return ok(out)
    })
  }

  // --- writing sheet content ------------------------------------------------------------------

  async writeSheet(path: string, content: string): Promise<Outcome<SheetStats>> {
    return this.serial(async () => {
      const checked = this.checkSheetPath(path)
      if (checked) return checked
      try {
        await this.fs.writeFileAtomic(projectFile(path), content)
      } catch (cause) {
        return fail('io', String(cause))
      }
      const stats = this.remember(path, content)
      this.revision += 1
      return ok(stats)
    })
  }

  // --- images ---------------------------------------------------------------------------------

  /**
   * Adds an image to `assets/` and returns its path, relative to the project. The type is checked
   * from the bytes. The name is made safe and never reuses an existing file.
   */
  async addAsset(suggestedName: string, bytes: Uint8Array): Promise<Outcome<{ path: string }>> {
    return this.serial(async () => {
      if (bytes.length > MAX_ASSET_BYTES) return fail('too_large', `${bytes.length} bytes`)
      const type = imageTypeOf(bytes)
      if (!type) return fail('not_an_image', suggestedName)
      try {
        let taken: string[] = []
        try {
          taken = (await this.fs.readDir(ASSETS_DIR)).map((entry) => entry.name)
        } catch {
          // no assets folder yet: it is created with the first image
        }
        const path = join(ASSETS_DIR, assetFileName(suggestedName, type, taken))
        await this.fs.writeBytesAtomic(path, bytes)
        return ok({ path })
      } catch (cause) {
        return fail('io', String(cause))
      }
    })
  }

  // --- structure ----------------------------------------------------------------------------

  /** Creates an empty sheet. Without a `name` it gets a generated one, `s-` and six letters or digits. */
  async createSheet(parent: string, name?: string): Promise<Outcome<{ path: string }>> {
    return this.mutate(async () => {
      if (parent === MATERIAL) return fail('invalid_move', 'The material holds folders only')
      const chosen = name ?? (await this.generatedName(parent))
      const bad = await this.checkNewName(parent, chosen)
      if (bad) return bad
      const file = `${chosen}${SHEET_EXT}`
      const path = join(parent, file)
      await this.fs.writeFileAtomic(projectFile(path), '')
      this.remember(path, '')
      this.manifest = addEntry(this.withEffectiveOrder(), parent, file)
      return ok({ path })
    })
  }

  async createGroup(parent: string, name: string): Promise<Outcome<{ path: string }>> {
    return this.mutate(async () => {
      const bad = await this.checkNewName(parent, name)
      if (bad) return bad
      const path = join(parent, name)
      await this.fs.mkdir(projectFile(path))
      this.manifest = addEntry(this.withEffectiveOrder(), parent, name)
      return ok({ path })
    })
  }

  /** Renames a group or sheet. For sheets, `name` is the title without extension. */
  async rename(path: string, name: string): Promise<Outcome<{ path: string }>> {
    return this.mutate(async () => {
      const node = this.nodeOnDisk(path)
      if (!node || path === MATERIAL) return fail('not_found', path)
      const parent = dirname(path)
      const bad = await this.checkNewName(parent, name, path)
      if (bad) return bad
      const entry = node === 'sheet' ? `${name}${SHEET_EXT}` : name
      const target = join(parent, entry)
      if (target !== path) await this.fs.rename(projectFile(path), projectFile(target))
      const withOrder_ = this.withEffectiveOrder()
      const index = (withOrder_.order[parent] ?? []).indexOf(basename(path))
      this.manifest = moveEntry(withOrder_, path, target, index < 0 ? undefined : index)
      this.moveCaches(path, target)
      return ok({ path: target })
    })
  }

  /** Moves or reorders a group or sheet: into `toParent` ("" for the top level) at `index`. */
  async move(path: string, toParent: string, index?: number): Promise<Outcome<{ path: string }>> {
    return this.mutate(async () => {
      const kind = this.nodeOnDisk(path)
      if (!kind || path === MATERIAL) return fail('not_found', path)
      if (toParent !== '' && toParent !== MATERIAL && this.nodeOnDisk(toParent) !== 'group')
        return fail('not_found', toParent)
      if (toParent === MATERIAL && kind !== 'group')
        return fail('invalid_move', 'The material holds folders only')
      if (kind === 'group' && isSameOrBelow(toParent, path))
        return fail('invalid_move', 'A group cannot move into itself')
      const target = join(toParent, basename(path))
      if (target !== path) {
        if (await this.nameTaken(toParent, basename(path))) return fail('exists', target)
        if (isMaterial(target)) await this.fs.mkdir(MATERIAL_DIR)
        await this.fs.rename(projectFile(path), projectFile(target))
      }
      this.manifest = moveEntry(this.withEffectiveOrder(), path, target, index)
      this.moveCaches(path, target)
      return ok({ path: target })
    })
  }

  /** Moves to the system trash. The manifest entry and its settings go with it. */
  async remove(path: string): Promise<Outcome<null>> {
    return this.mutate(async () => {
      if (!this.nodeOnDisk(path) || path === MATERIAL) return fail('not_found', path)
      await this.fs.trash(projectFile(path))
      this.manifest = removeEntry(this.withEffectiveOrder(), path)
      this.dropCaches(path)
      return ok(null)
    })
  }

  async setItem(
    path: string,
    patch: Partial<Pick<ItemSettings, 'status' | 'goal' | 'export' | 'icon' | 'color'>>,
  ): Promise<Outcome<null>> {
    return this.mutate(async () => {
      if (!isSafeRelativePath(path) || path === '' || path === MATERIAL)
        return fail('invalid_path', path)
      this.manifest = patchItem(this.withEffectiveOrder(), path, patch)
      return ok(null)
    })
  }

  /** Forgets a manifest entry whose file or folder is gone ("Entfernen"). */
  async removeMissing(path: string): Promise<Outcome<null>> {
    return this.mutate(async () => {
      if (this.nodeOnDisk(path)) return fail('invalid_move', 'The item exists on disk')
      this.manifest = removeEntry(this.withEffectiveOrder(), path)
      return ok(null)
    })
  }

  /** Points a missing entry at an existing item ("Neu verknüpfen"): the existing item takes over
   * the position and settings of the missing one. */
  async relink(missingPath: string, targetPath: string): Promise<Outcome<null>> {
    return this.mutate(async () => {
      if (this.nodeOnDisk(missingPath)) return fail('invalid_move', 'The item exists on disk')
      if (!this.nodeOnDisk(targetPath)) return fail('not_found', targetPath)
      if (missingPath === targetPath) return fail('invalid_move', targetPath)
      const base = this.withEffectiveOrder()
      const index = (base.order[dirname(missingPath)] ?? []).indexOf(basename(missingPath))
      // A manifest-only move: position, settings, and everything below follow to the new path.
      const samePlace = dirname(missingPath) === dirname(targetPath) && index >= 0
      this.manifest = moveEntry(base, missingPath, targetPath, samePlace ? index : undefined)
      return ok(null)
    })
  }

  async setProjectTitle(title: string): Promise<Outcome<null>> {
    return this.mutate(async () => {
      if (
        title.trim() === '' ||
        title.length > 200 ||
        [...title].some((c) => c.charCodeAt(0) < 32)
      ) {
        return fail('invalid_name', 'title')
      }
      this.manifest = {
        ...this.manifest,
        project: { ...this.manifest.project, title: title.trim() },
      }
      return ok(null)
    })
  }

  async setFootnoteRestart(restart: FootnoteRestart): Promise<Outcome<null>> {
    return this.mutate(async () => {
      this.manifest = { ...this.manifest, footnotes: { ...this.manifest.footnotes, restart } }
      return ok(null)
    })
  }

  async setQuoteBlockMarks(blockMarks: boolean): Promise<Outcome<null>> {
    return this.mutate(async () => {
      this.manifest = { ...this.manifest, quotes: { ...this.manifest.quotes, blockMarks } }
      return ok(null)
    })
  }

  async setQuoteStyle(style: QuoteStyle): Promise<Outcome<null>> {
    return this.mutate(async () => {
      this.manifest = { ...this.manifest, quotes: { ...this.manifest.quotes, style } }
      return ok(null)
    })
  }

  async setHistoryEnabled(enabled: boolean): Promise<Outcome<null>> {
    return this.mutate(async () => {
      this.manifest = { ...this.manifest, history: { ...this.manifest.history, enabled } }
      return ok(null)
    })
  }

  /** Changes the spelling and grammar settings. A missing field stays as it is; `language` null goes back to the project's. */
  async setProofing(patch: {
    language?: string | null
    level?: 'default' | 'picky'
    disabledRules?: string[]
    disabledCategories?: string[]
  }): Promise<Outcome<null>> {
    return this.mutate(async () => {
      const proofing = { ...this.manifest.proofing }
      if (patch.language === null) delete proofing.language
      else if (patch.language !== undefined) proofing.language = patch.language
      if (patch.level !== undefined) proofing.level = patch.level
      if (patch.disabledRules !== undefined)
        proofing.disabledRules = [...new Set(patch.disabledRules)]
      if (patch.disabledCategories !== undefined)
        proofing.disabledCategories = [...new Set(patch.disabledCategories)]
      this.manifest = { ...this.manifest, proofing }
      return ok(null)
    })
  }

  /** The text of the project dictionary (one word per line). */
  async readDictionary(): Promise<string> {
    try {
      return await this.fs.readFile(this.manifest.proofing.dictionary)
    } catch {
      return ''
    }
  }

  /** Adds a word to the project dictionary. Nothing happens if it is there already. */
  async addDictionaryWord(word: string): Promise<Outcome<null>> {
    return this.serial(async () => {
      const next = withWord(await this.readDictionary(), word)
      if (next === null) return ok(null)
      try {
        await this.fs.writeFileAtomic(this.manifest.proofing.dictionary, next)
      } catch (cause) {
        return fail('io', String(cause))
      }
      return ok(null)
    })
  }

  async setGoal(words: number | null): Promise<Outcome<null>> {
    return this.mutate(async () => {
      const goals = { ...this.manifest.goals }
      if (words === null || words <= 0) delete goals.words
      else goals.words = Math.floor(words)
      this.manifest = { ...this.manifest, goals }
      return ok(null)
    })
  }

  // --- export -------------------------------------------------------------------------------

  /** The project's title, without building a snapshot. */
  title(): string {
    return this.manifest.project.title
  }

  /** Whether versions of the project are kept, without building a snapshot. */
  historyEnabled(): boolean {
    return this.manifest.history.enabled
  }

  /** The export profile in use: the first one in `project.toml`, or the default one. */
  exportProfile(): ExportProfile {
    return this.manifest.exports[0] ?? defaultProfile(this.manifest.project.citationStyle)
  }

  /** Remembers the profile as the first one in `project.toml`. */
  async saveExportProfile(profile: ExportProfile): Promise<Outcome<null>> {
    return this.mutate(async () => {
      this.manifest = { ...this.manifest, exports: [profile, ...this.manifest.exports.slice(1)] }
      return ok(null)
    })
  }

  /**
   * Prepares an export: reads the sheets that are in the export, in order,
   * preprocesses them, and builds the generated files. With `write` the files go into `_build/`
   * (the compiler may only read inside the project, so a bibliography file outside it is copied
   * there too); without, nothing is written and the result tells what an export would find.
   */
  async prepareExport(
    profile: ExportProfile,
    template: BuildInput['template'],
    prelude: string,
    options: { write: boolean },
  ): Promise<Outcome<PreparedExport>> {
    return this.serial(async () => {
      try {
        const sheets: BuildInput['sheets'] = []
        for (const sheet of exportOrder(this.reconciled().root)) {
          let text = ''
          try {
            text = await this.fs.readFile(projectFile(sheet.path))
          } catch {
            // A sheet that vanished since the tree was read counts as empty.
          }
          sheets.push({ path: sheet.path, text })
        }
        // Every citation of the export, in the text, in notes and in captions.
        const cited = sheets.map((sheet) => ({
          sheet,
          spans: citationOverview(sheet.text).spans,
        }))
        const known = new Set(this.bibliography.library.entries.map((e) => e.key))
        const citedKeys = new Set(cited.flatMap((c) => c.spans.map(([key]) => key)))
        // The compiler gets a clean copy of the bibliography (bib/forTypst.ts): only the cited works,
        // each once, with readable dates, so one flaw elsewhere in the writer's file does not stop
        // the whole document. It is written into `_build/`, which the compiler may read; the
        // writer's file is never changed. With nothing cited that the file has, there is none (the
        // compiler would still print its heading).
        let bibliography: string | null = null
        if ([...citedKeys].some((key) => known.has(key))) {
          const path = this.manifest.project.bibliography
          const source = isExternalPath(path)
            ? await this.fs.readExternalText(path)
            : await this.fs.readFile(path)
          const copy = bibliographyForTypst(source, citedKeys)
          if (copy !== null) {
            if (options.write) await this.fs.writeFileAtomic(`${BUILD_DIR}/bibliography.bib`, copy)
            bibliography = `/${BUILD_DIR}/bibliography.bib`
          }
        }
        const output = buildExport({
          title: this.manifest.project.title,
          language: this.manifest.project.language,
          sheets,
          profile,
          template,
          prelude,
          bibliography,
          works: known,
          blockQuoteMarks: this.manifest.quotes.blockMarks,
          quoteStyle: this.manifest.quotes.style,
        })
        if (options.write)
          for (const file of output.files) await this.fs.writeFileAtomic(file.path, file.content)
        // Citations of works the bibliography does not have, in their sheets: they print as a
        // placeholder (export/preprocess.ts), and the export says where they are. A key that is a
        // label of the export is a cross-reference, not a citation.
        const labels = new Set(
          sheets.flatMap((sheet) =>
            scanTargets(parseTypst(sheet.text), sheet.text).flatMap((t) =>
              t.label ? [t.label] : [],
            ),
          ),
        )
        const unknownCitations: PreparedExport['unknownCitations'] = []
        for (const { sheet, spans } of cited)
          for (const [key, from] of spans)
            if (!known.has(key) && !labels.has(key))
              unknownCitations.push({
                sheet: sheet.path,
                line: sheet.text.slice(0, from).split('\n').length,
                key,
              })
        // Figures without an image print as an empty frame: list them, so none is exported by accident.
        const emptyImages: PreparedExport['emptyImages'] = []
        for (const sheet of sheets)
          for (const figure of scanFigures(parseTypst(sheet.text), sheet.text))
            if (figure.empty)
              emptyImages.push({
                sheet: sheet.path,
                line: sheet.text.slice(0, figure.from).split('\n').length,
              })
        return ok({ ...output, unknownCitations, emptyImages })
      } catch (cause) {
        return fail('io', String(cause))
      }
    })
  }

  // --- reconciling with the disk --------------------------------------------------------------

  /**
   * Re-reads the disk after external changes. `changed` lists project-relative paths
   * that the watcher reported, or null for "everything".
   */
  async refresh(changed: readonly string[] | null = null): Promise<RefreshResult> {
    return this.serial(async () => {
      const externallyChanged = await this.rescan(changed)
      return { snapshot: this.snapshot(), externallyChanged }
    })
  }

  private async rescan(changed: readonly string[] | null): Promise<string[]> {
    if (changed === null || changed.includes(MANIFEST_FILE)) await this.reloadManifest()
    const bibliographyPath = this.manifest.project.bibliography
    if (
      changed === null ||
      changed.includes(bibliographyPath) ||
      bibliographyPath !== this.bibliography.path
    )
      await this.reloadBibliography(bibliographyPath)
    this.disk = await this.scanDisk()
    const sheets = listSheets(this.disk)
    const present = new Set(sheets)
    for (const known of [...this.stats.keys()]) if (!present.has(known)) this.dropCaches(known)
    const externallyChanged: string[] = []
    const touched =
      changed === null
        ? null
        : new Set(
            changed.flatMap((p) => {
              const path = treePathOf(p)
              return path === null ? [] : [path]
            }),
          )
    for (const sheet of sheets) {
      const isNew = !this.stats.has(sheet)
      if (!isNew && touched !== null && !touched.has(sheet)) continue
      let content: string
      try {
        content = await this.fs.readFile(projectFile(sheet))
      } catch {
        continue
      }
      const previous = this.hashes.get(sheet)
      const next = hash(content)
      this.remember(sheet, content)
      if (previous !== undefined && previous !== next) externallyChanged.push(sheet)
    }
    this.revision += 1
    return externallyChanged
  }

  /** Reads the bibliography file. A missing or unreadable file is an empty library. */
  private async reloadBibliography(path: string): Promise<void> {
    let text = ''
    try {
      text = isExternalPath(path)
        ? await this.fs.readExternalText(path)
        : await this.fs.readFile(path)
    } catch {
      /* no bibliography yet */
    }
    const stamp = text === '' ? '' : `${text.length}:${hash(text)}`
    if (path === this.bibliography.path && stamp === this.bibliography.stamp) return
    this.bibliography = { path, stamp, library: parseBibtex(text) }
  }

  /**
   * Makes `path` the bibliography file: relative to the project, or absolute for a file outside it
   * (such as a Zotero export), which is read where it is and never copied. It must be readable BibTeX.
   */
  async setBibliography(path: string): Promise<Outcome<null>> {
    if (!/\.(bib|bibtex)$/i.test(path))
      return fail('not_a_bibliography', 'The bibliography must be a .bib file')
    if (!isExternalPath(path) && !isSafeRelativePath(path))
      return fail('invalid_path', 'This path is not allowed')
    try {
      if (isExternalPath(path)) await this.fs.readExternalText(path)
      else await this.fs.readFile(path)
    } catch {
      return fail('not_a_bibliography', 'This file cannot be read')
    }
    return this.mutate(async () => {
      this.manifest = {
        ...this.manifest,
        project: { ...this.manifest.project, bibliography: path },
      }
      await this.reloadBibliography(path)
      return ok(null)
    })
  }

  /** The bibliography file when it is outside the project, so that it can be watched; else null. */
  externalBibliography(): string | null {
    const path = this.manifest.project.bibliography
    return isExternalPath(path) ? path : null
  }

  /** The works of the bibliography file, for citations. */
  library(): BibLibrary {
    return this.bibliography.library
  }

  private async reloadManifest(): Promise<void> {
    try {
      const parsed = parseManifest(await this.fs.readFile(MANIFEST_FILE))
      if (parsed.ok) {
        this.manifest = parsed.value.manifest
        this.manifestWarnings = parsed.value.warnings
        this.manifestProblem = null
      } else {
        this.manifestProblem =
          parsed.error.code === 'invalid_toml'
            ? parsed.error.message
            : `unsupported version ${String(parsed.error.version)}`
      }
    } catch (cause) {
      this.manifestProblem = String(cause)
    }
  }

  // --- internals ----------------------------------------------------------------------------

  /** Runs `fn` after all earlier operations finished, so commands never interleave. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** A structural change: run it, then save the manifest. Nothing is saved when it fails. */
  private mutate<T>(fn: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
    return this.serial(async () => {
      if (this.manifestProblem) return fail('manifest_invalid', this.manifestProblem)
      const before = this.manifest
      try {
        const result = await fn()
        if (!result.ok) {
          this.manifest = before
          return result
        }
        await this.saveManifest()
        await this.rescanDisk()
        this.revision += 1
        return result
      } catch (cause) {
        // Disk and manifest may disagree after a failure; reconciliation repairs that on next load.
        this.manifest = before
        await this.rescanDisk().catch(() => undefined)
        return fail('io', String(cause))
      }
    })
  }

  /** What is on disk: the document in `content/`, and the material, which stands in the tree as a folder of its own. */
  private async scanDisk(): Promise<DiskDir> {
    const disk = await scanDir(this.fs, CONTENT_DIR)
    // Without a folder for it there is no material: the tree has none until the first folder is made.
    if (await this.fs.exists(MATERIAL_DIR))
      disk.dirs.set(MATERIAL, await scanDir(this.fs, MATERIAL_DIR))
    return disk
  }

  /**
   * Folders that are marked `export = false` (how a folder used to be left out of the export) move
   * into the material, as folders of its top level, and lose the mark: leaving a folder out is a
   * place now. A name the material already has gets a number. Nothing happens without such a folder.
   */
  private async moveExcludedFoldersToMaterial(): Promise<void> {
    if (this.manifestProblem) return
    const flagged = outsideGroups(this.reconciled().root).filter((group) => group.path !== MATERIAL)
    if (flagged.length === 0) return
    await this.mutate(async () => {
      let manifest = this.withEffectiveOrder()
      const taken = new Set([...(this.disk.dirs.get(MATERIAL)?.dirs.keys() ?? [])].map(nameKey))
      await this.fs.mkdir(MATERIAL_DIR)
      for (const group of flagged) {
        const base = basename(group.path)
        let name = base
        for (let n = 2; taken.has(nameKey(name)); n += 1) name = `${base} ${n}`
        taken.add(nameKey(name))
        const target = join(MATERIAL, name)
        await this.fs.rename(projectFile(group.path), projectFile(target))
        manifest = patchItem(moveEntry(manifest, group.path, target), target, { export: undefined })
        this.moveCaches(group.path, target)
      }
      this.manifest = manifest
      return ok(null)
    })
  }

  private async rescanDisk(): Promise<void> {
    this.disk = await this.scanDisk()
  }

  private async saveManifest(): Promise<void> {
    await this.fs.writeFileAtomic(MANIFEST_FILE, serializeManifest(this.manifest))
  }

  private withEffectiveOrder(): Manifest {
    return withOrder(this.manifest, this.reconciled().order)
  }

  private remember(path: string, content: string): SheetStats {
    const stats = analyzeSheet(content)
    this.stats.set(path, stats)
    this.hashes.set(path, hash(content))
    return stats
  }

  private dropCaches(path: string): void {
    for (const key of [...this.stats.keys()]) {
      if (isSameOrBelow(key, path)) {
        this.stats.delete(key)
        this.hashes.delete(key)
      }
    }
  }

  private moveCaches(from: string, to: string): void {
    for (const key of [...this.stats.keys()]) {
      if (!isSameOrBelow(key, from)) continue
      const next = key === from ? to : join(to, key.slice(from.length + 1))
      this.stats.set(next, this.stats.get(key)!)
      this.hashes.set(next, this.hashes.get(key)!)
      this.stats.delete(key)
      this.hashes.delete(key)
    }
  }

  private nodeOnDisk(path: string): 'group' | 'sheet' | null {
    if (!isSafeRelativePath(path) || path === '') return null
    const node = findNode(this.reconciled().root, path)
    return node && node.kind !== 'missing' ? node.kind : null
  }

  private checkSheetPath(path: string): Outcome<never> | null {
    if (!isSafeRelativePath(path) || path === '' || !isSheetFile(basename(path)))
      return fail('invalid_path', path)
    if (this.nodeOnDisk(path) !== 'sheet') return fail('not_found', path)
    return null
  }

  private async nameTaken(parent: string, entry: string, except?: string): Promise<boolean> {
    // The material's folder is made with the first folder in it.
    const listing = await this.fs.readDir(projectFile(parent)).catch(() => [])
    return listing.some(
      (e) => nameKey(e.name) === nameKey(entry) && join(parent, e.name) !== except,
    )
  }

  /** Validates the name for a new or renamed item in `parent`. `except` is the item being renamed. */
  /** A generated sheet name that nothing in the folder has. */
  private async generatedName(parent: string): Promise<string> {
    const tried = new Set<string>()
    for (;;) {
      const name = newSheetName((candidate) => tried.has(candidate))
      tried.add(name)
      if (
        !(await this.nameTaken(parent, `${name}${SHEET_EXT}`)) &&
        !(await this.nameTaken(parent, name))
      )
        return name
    }
  }

  private async checkNewName(
    parent: string,
    name: string,
    except?: string,
  ): Promise<Outcome<never> | null> {
    if (!isSafeRelativePath(parent)) return fail('invalid_path', parent)
    if (parent !== '' && parent !== MATERIAL && this.nodeOnDisk(parent) !== 'group')
      return fail('not_found', parent)
    const problem = validateName(name)
    if (problem) return fail('invalid_name', problem)
    for (const candidate of [name, `${name}${SHEET_EXT}`]) {
      if (await this.nameTaken(parent, candidate, except))
        return fail('exists', join(parent, candidate))
    }
    return null
  }
}
