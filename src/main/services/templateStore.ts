import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  MAX_FONT_BYTES,
  optionAccepts,
  setOptionOverride,
  cleanName,
  customToToml,
  fontFileName,
  parseCustom,
  newTemplateId,
  parseSets,
  setValue,
  setsToToml,
} from '@core/export/custom'
import type { OptionOverride, Sets } from '@core/export/custom'
import type { TemplateOption } from '@core/export/template'
import { IpcFailure } from '@shared/ipc'
import { FONTS_DIR, loadTemplates } from './exporter'
import type { Template } from './exporter'
import { renameRetrying, writeFileAtomic } from './rootedFs'
import { ZipError, extractZip } from './unzip'
import { writeZip } from './zip'
import type { ZipEntry } from './zip'

/**
 * The writer's own templates live in the app's data folder, outside every project: one
 * folder per template, named after its id, with `custom.toml` (name, base) and `style.toml` (only
 * the values the writer changed). This service changes them; `loadTemplates` reads them.
 */
export interface TemplateStoreDeps {
  bundledDir: string
  customDir: string
  /** Moves a file or folder to the system trash. */
  trash: (absPath: string) => Promise<void>
  /** Asks the writer for font files; the paths, none when they cancel. */
  pickFonts: (dialogTitle: string, filterName: string) => Promise<string[]>
  /** Asks where to save a template file; the path, null when they cancel. */
  pickSavePath: (
    dialogTitle: string,
    filterName: string,
    fileName: string,
  ) => Promise<string | null>
  /** Asks for a template file; the path, null when they cancel. */
  pickTemplateFile: (dialogTitle: string, filterName: string) => Promise<string | null>
  /** The families the compiler finds: its own and those in a folder of font files. */
  families: (fontsDir: string | null) => Promise<string[]>
}

export interface TemplateDetail {
  id: string
  name: string
  builtin: boolean
  base: string | null
  /** What the base template sets (for a bundled template: what it sets itself). */
  baseSets: Sets
  /** What the writer changed on top of the base. */
  overrides: Sets
  /** The font files the writer added. */
  fonts: string[]
  /** The families a property can name. */
  families: string[]
  /** The options of the template, with the writer's changes. */
  options: OptionDetail[]
}

/** An option as the editor shows it: what the base says, what the template says, and whether the dialog offers it. */
export type OptionDetail = TemplateOption & { baseDefault: string | boolean; hidden: boolean }

export function createTemplateStore(deps: TemplateStoreDeps): {
  list(): Promise<
    { id: string; name: { de: string; en: string }; builtin: boolean; base: string | null }[]
  >
  get(id: string): Promise<TemplateDetail>
  create(baseId: string, name: string): Promise<string>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
  set(id: string, element: string, prop: string, value: string | boolean | null): Promise<Sets>
  /** Writes the template and its fonts as one file where the writer says; null when they cancel. */
  exportFile(
    id: string,
    dialogTitle: string,
    filterName: string,
    fileName: string,
  ): Promise<string | null>
  /** Adds the template in a file the writer picks as one of their own; null when they cancel. */
  importFile(dialogTitle: string, filterName: string): Promise<string | null>
  addFonts(
    id: string,
    dialogTitle: string,
    filterName: string,
  ): Promise<{ fonts: string[]; families: string[] }>
  removeFont(id: string, file: string): Promise<{ fonts: string[]; families: string[] }>
  /** Changes the default of an option of the template, or whether the export dialog offers it; null takes a field back to the base's. */
  setOption(
    id: string,
    option: string,
    patch: { default?: string | boolean | null; hidden?: boolean | null },
  ): Promise<OptionDetail[]>
} {
  const all = async (): Promise<Template[]> =>
    (await loadTemplates(deps.bundledDir, deps.customDir)).templates

  const find = async (id: string): Promise<{ template: Template; all: Template[] }> => {
    const templates = await all()
    const template = templates.find((t) => t.info.id === id)
    if (!template) throw new IpcFailure('not_found', `No template ${id}`)
    return { template, all: templates }
  }

  const custom = async (id: string): Promise<Template> => {
    const { template } = await find(id)
    if (!template.custom)
      throw new IpcFailure('forbidden', 'A bundled template cannot be changed; make a copy first')
    return template
  }

  /**
   * Changes run one after the other: each reads what is stored, changes it and writes it back, so
   * two at once (two fields left in quick succession) would lose the first.
   */
  let queue: Promise<unknown> = Promise.resolve()
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work)
    queue = run.catch(() => undefined)
    return run
  }

  const folder = (id: string): string => join(deps.customDir, id)
  const fontsFolder = (id: string): string => join(folder(id), FONTS_DIR)

  const fontFiles = async (id: string): Promise<string[]> =>
    (await readdir(fontsFolder(id)).catch(() => [] as string[]))
      .filter((file) => fontFileName(file) === file)
      .sort((a, b) => a.localeCompare(b))

  /** The font files of a template and the families a property can name there. */
  const fontsOf = async (id: string): Promise<{ fonts: string[]; families: string[] }> => {
    const fonts = await fontFiles(id)
    return { fonts, families: await deps.families(fonts.length > 0 ? fontsFolder(id) : null) }
  }

  /** The options of a template as the editor shows them. */
  const optionsOf = (template: Template, templates: readonly Template[]): OptionDetail[] => {
    const base = template.custom
      ? (templates.find((t) => t.info.id === template.custom!.base) ?? template)
      : template
    return template.info.options.map((option) => ({
      ...option,
      hidden: option.hidden === true,
      baseDefault: base.info.options.find((o) => o.id === option.id)?.default ?? option.default,
    }))
  }

  /** The changes in `options` that the base's options can take. */
  const validOptions = (
    base: readonly TemplateOption[],
    options: Readonly<Record<string, OptionOverride>>,
  ): Record<string, OptionOverride> => {
    const out: Record<string, OptionOverride> = {}
    for (const option of base) {
      const change = options[option.id]
      if (!change) continue
      const kept: OptionOverride = {}
      if (change.default !== undefined && optionAccepts(option, change.default))
        kept.default = change.default
      if (change.hidden === true) kept.hidden = true
      if (Object.keys(kept).length > 0) out[option.id] = kept
    }
    return out
  }

  const methods: ReturnType<typeof createTemplateStore> = {
    async list() {
      return (await all()).map((t) => ({
        id: t.info.id,
        name: t.info.name,
        builtin: t.custom === null,
        base: t.custom?.base ?? null,
      }))
    },

    async get(id) {
      const { template, all: templates } = await find(id)
      const baseOf = template.custom
        ? templates.find((t) => t.info.id === template.custom!.base)
        : template
      const baseSets = parseSets(baseOf?.files.find((f) => f.path === 'style.toml')?.content ?? '')
      return {
        id,
        name: template.info.name.de,
        builtin: template.custom === null,
        base: template.custom?.base ?? null,
        baseSets,
        overrides: template.custom?.overrides ?? {},
        options: optionsOf(template, templates),
        ...(template.custom
          ? await fontsOf(id)
          : { fonts: [], families: await deps.families(null) }),
      }
    },

    async create(baseId, rawName) {
      const name = cleanName(rawName)
      if (!name) throw new IpcFailure('invalid_name', 'A template needs a name')
      const { template: source, all: templates } = await find(baseId)
      // A copy of a copy is a copy of the bundled template, with the values changed so far.
      const base = source.custom ? source.custom.base : source.info.id
      const overrides = source.custom?.overrides ?? {}
      const id = newTemplateId(
        name,
        templates.map((t) => t.info.id),
      )
      await mkdir(folder(id), { recursive: true })
      await writeFileAtomic(join(folder(id), 'style.toml'), setsToToml(overrides))
      await writeFileAtomic(
        join(folder(id), 'custom.toml'),
        customToToml({ id, name, base, options: source.custom?.options ?? {} }),
      )
      return id
    },

    async rename(id, rawName) {
      const template = await custom(id)
      const name = cleanName(rawName)
      if (!name) throw new IpcFailure('invalid_name', 'A template needs a name')
      await writeFileAtomic(
        join(folder(id), 'custom.toml'),
        customToToml({
          id,
          name,
          base: template.custom!.base,
          options: template.custom!.options,
        }),
      )
    },

    async remove(id) {
      await custom(id)
      await deps.trash(folder(id))
    },

    async addFonts(id, dialogTitle, filterName) {
      await custom(id)
      const picked = await deps.pickFonts(dialogTitle, filterName)
      const taken = new Set(await fontFiles(id))
      for (const source of picked) {
        const wanted = fontFileName(source)
        if (!wanted) continue
        const info = await stat(source).catch(() => null)
        if (!info?.isFile() || info.size > MAX_FONT_BYTES) continue
        // A file of the same name is not overwritten: the other one gets a number.
        let name = wanted
        for (let n = 2; taken.has(name); n++) name = wanted.replace(/(\.[a-z]+)$/, ` ${n}$1`)
        await mkdir(fontsFolder(id), { recursive: true })
        await copyFile(source, join(fontsFolder(id), name))
        taken.add(name)
      }
      return fontsOf(id)
    },

    async removeFont(id, file) {
      await custom(id)
      // Only a file this service would have written: no path, a font extension.
      if (fontFileName(file) !== file)
        throw new IpcFailure('invalid_request', 'Not a font file of this template')
      if (!(await fontFiles(id)).includes(file)) throw new IpcFailure('not_found', 'No such font')
      await deps.trash(join(fontsFolder(id), file))
      return fontsOf(id)
    },

    async exportFile(id, dialogTitle, filterName, fileName) {
      await custom(id)
      const target = await deps.pickSavePath(dialogTitle, filterName, fileName)
      if (target === null) return null
      const mtime = Date.now()
      const entries: ZipEntry[] = [
        { name: `${id}/custom.toml`, path: join(folder(id), 'custom.toml'), mtime },
        { name: `${id}/style.toml`, path: join(folder(id), 'style.toml'), mtime },
        ...(await fontFiles(id)).map((file) => ({
          name: `${id}/${FONTS_DIR}/${file}`,
          path: join(fontsFolder(id), file),
          mtime,
          store: true,
        })),
      ]
      const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`
      try {
        await writeZip(temp, entries)
        await renameRetrying(temp, target)
      } catch (cause) {
        await unlink(temp).catch(() => undefined)
        throw new IpcFailure('io', String(cause))
      }
      return target
    },

    async importFile(dialogTitle, filterName) {
      const source = await deps.pickTemplateFile(dialogTitle, filterName)
      if (source === null) return null
      // Unpacked next to the templates (never into them) and only the parts a template has are kept.
      await mkdir(deps.customDir, { recursive: true })
      const temp = join(deps.customDir, `.importing-${randomBytes(4).toString('hex')}`)
      try {
        await mkdir(temp)
        try {
          await extractZip(source, temp)
        } catch (cause) {
          throw new IpcFailure(
            'io',
            cause instanceof ZipError ? cause.message : 'This is not a template file',
          )
        }
        const top = (await readdir(temp, { withFileTypes: true })).filter((e) => e.isDirectory())
        const unpacked = top.length === 1 ? join(temp, top[0]!.name) : temp
        const info = parseCustom(
          await readFile(join(unpacked, 'custom.toml'), 'utf8').catch(() => ''),
        )
        if (!info) throw new IpcFailure('invalid_request', 'This is not a template file')
        const templates = await all()
        if (!templates.some((t) => t.info.id === info.base && t.custom === null))
          throw new IpcFailure(
            'not_found',
            `The template is based on "${info.base}", which this version of the app does not have`,
          )
        const id = newTemplateId(
          info.name,
          templates.map((t) => t.info.id),
        )
        await mkdir(folder(id), { recursive: true })
        // The values are read and written again, so only valid ones arrive.
        const sets = parseSets(await readFile(join(unpacked, 'style.toml'), 'utf8').catch(() => ''))
        await writeFileAtomic(join(folder(id), 'style.toml'), setsToToml(sets))
        const fonts = await readdir(join(unpacked, FONTS_DIR)).catch(() => [] as string[])
        for (const file of fonts) {
          const name = fontFileName(file)
          const from = join(unpacked, FONTS_DIR, file)
          const info = await stat(from).catch(() => null)
          if (name !== file || !info?.isFile() || info.size > MAX_FONT_BYTES) continue
          await mkdir(fontsFolder(id), { recursive: true })
          await copyFile(from, join(fontsFolder(id), name))
        }
        // The file that makes it a template comes last: a failure before leaves no half template.
        await writeFileAtomic(
          join(folder(id), 'custom.toml'),
          customToToml({
            id,
            name: info.name,
            base: info.base,
            options: validOptions(
              templates.find((t) => t.info.id === info.base)!.info.options,
              info.options,
            ),
          }),
        )
        return id
      } finally {
        await rm(temp, { recursive: true, force: true }).catch(() => undefined)
      }
    },

    async setOption(id, optionId, patch) {
      const template = await custom(id)
      const { all: templates } = await find(id)
      const base = templates.find((t) => t.info.id === template.custom!.base)!
      const next = setOptionOverride(template.custom!.options, base.info.options, optionId, patch)
      if (!next) throw new IpcFailure('invalid_request', `Not a value of the option ${optionId}`)
      await writeFileAtomic(
        join(folder(id), 'custom.toml'),
        customToToml({
          id,
          name: template.info.name.de,
          base: template.custom!.base,
          options: next,
        }),
      )
      const reloaded = (await find(id)).template
      return optionsOf(reloaded, templates)
    },

    async set(id, element, prop, value) {
      const template = await custom(id)
      const result = setValue(template.custom!.overrides, element, prop, value)
      if (!result.ok) throw new IpcFailure('invalid_request', result.message)
      await writeFileAtomic(join(folder(id), 'style.toml'), setsToToml(result.sets))
      return result.sets
    },
  }

  return {
    ...methods,
    create: (...args) => exclusive(() => methods.create(...args)),
    rename: (...args) => exclusive(() => methods.rename(...args)),
    remove: (...args) => exclusive(() => methods.remove(...args)),
    set: (...args) => exclusive(() => methods.set(...args)),
    setOption: (...args) => exclusive(() => methods.setOption(...args)),
    addFonts: (...args) => exclusive(() => methods.addFonts(...args)),
    removeFont: (...args) => exclusive(() => methods.removeFont(...args)),
    importFile: (...args) => exclusive(() => methods.importFile(...args)),
  }
}
