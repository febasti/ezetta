import type { z } from 'zod'
import { mergeSets } from '@core/export/custom'
import type { Sets } from '@core/export/custom'
import { resolveStyle } from '@core/export/style'
import type { exportInfoSchema, exportResultSchema } from '@shared/export'
import type { templateDetailSchema, templateEntrySchema } from '@shared/templates'
import { call } from '../../lib/api'
import { i18n } from '../../i18n/i18n.svelte'
import type { Locale } from '../../i18n/translate'
import { confirmDialog, notify, promptDialog } from '../../lib/ui.svelte'
import { editor } from '../editor/editorSession.svelte'
import { preview } from './preview.svelte'
import { project } from '../sidebar/project.svelte'
import { headingNumbering } from './numbering.svelte'

export type ExportInfo = z.infer<typeof exportInfoSchema>
export type ExportResult = z.infer<typeof exportResultSchema>
export type Profile = ExportInfo['profile']
export type TemplateEntry = z.infer<typeof templateEntrySchema>
export type TemplateDetail = z.infer<typeof templateDetailSchema>
export type PropValue = string | boolean

/** The id of the panel with what the export itself needs: citation style, options, warnings, the result. */
export const EXPORT = '__export'

/** The id of the panel for font files, which is shown where an element's properties are. */
export const FONTS = '__fonts'

/** The id of the panel for the options of the template, which the export panel offers. */
export const OPTIONS = '__options'

/** Pause after the last change before the pages are made again. */
const REFRESH_PAUSE_MS = 600

/**
 * The one dialog for templates and export: the templates on the left, of which the
 * chosen one is the export's template; the elements of that template with their properties; the
 * export's own settings in a panel of their own; and the pages, made by the compiler, beside them.
 * A change of the template is written at once. The profile (template, options, citation style, …)
 * is remembered when the dialog closes or an export is made.
 */
class ExportStore {
  open = $state(false)
  info = $state.raw<ExportInfo | null>(null)
  profile = $state<Profile | null>(null)
  busy = $state(false)
  result = $state.raw<ExportResult | null>(null)

  list = $state.raw<TemplateEntry[]>([])
  detail = $state.raw<TemplateDetail | null>(null)
  /** The panel shown: an element's id, or one of `EXPORT`, `FONTS`, `OPTIONS`. */
  elementId = $state(EXPORT)
  /** The id of a property whose last value was refused, to mark it. */
  refused = $state<string | null>(null)
  /** The first page of each template as a picture (a data URL), by template id. */
  thumbnails = $state.raw<Record<string, string>>({})

  private timer: ReturnType<typeof setTimeout> | undefined
  private thumbTimer: ReturnType<typeof setTimeout> | undefined
  /** The profile as it was last saved, to tell whether closing has anything to write. */
  private saved = ''

  /** The id of the template shown, which is the profile's. */
  selectedId = $derived(this.profile?.template ?? '')
  /** How many things are still open in the text, which the export would print or leave out. */
  openCount = $derived.by(() => {
    const w = this.info?.warnings
    return w
      ? w.comments +
          w.missingCitations +
          w.checks +
          w.references.length +
          w.unknownCitations.length +
          w.emptyImages.length
      : 0
  })
  /** What the template sets: its base's values with the writer's on top. */
  sets = $derived<Sets>(this.detail ? mergeSets(this.detail.baseSets, this.detail.overrides) : {})
  resolved = $derived(resolveStyle({ element: this.sets }, { keepTokens: true }).style)

  /** Opens the dialog on a panel: unsaved text is written first, so the export has what is on the screen. */
  async show(panel: string = EXPORT): Promise<void> {
    if (!project.snapshot) return
    await editor.flush()
    const [info, list] = await Promise.all([
      call(window.api.export.info({})),
      call(window.api.templates.list({})),
    ])
    if (!info || !list) return
    this.info = info
    this.list = list
    this.profile = structuredClone(info.profile) as Profile
    this.saved = JSON.stringify(this.profile)
    this.result = null
    this.elementId = panel
    const detail = await call(window.api.templates.get({ id: info.profile.template }))
    if (!detail) return
    this.detail = detail
    this.refused = null
    this.open = true
    void this.loadThumbnails()
  }

  /** Remembers the profile when it changed, and tells the rest of the app which template it names now. */
  private async save(): Promise<void> {
    const profile = this.profile
    if (!profile || JSON.stringify(profile) === this.saved) return
    const snapshot = $state.snapshot(profile) as Profile
    if (await call(window.api.export.saveProfile({ profile: snapshot }))) {
      this.saved = JSON.stringify(profile)
    }
  }

  /** Leaves the dialog: the profile is saved, the pages are forgotten, and the chips follow the profile. */
  private async leave(): Promise<void> {
    clearTimeout(this.timer)
    clearTimeout(this.thumbTimer)
    this.open = false
    preview.profile = null
    preview.reset()
    await this.save()
    if (project.snapshot) void headingNumbering.refresh()
  }

  async close(): Promise<void> {
    if (this.busy) return
    await this.leave()
  }

  /**
   * Another template: it is the export's from now on, and its properties are shown. A choice the
   * writer made stays where the new template has that option; one that was only the old template's
   * default gives way to the new template's.
   */
  async select(id: string): Promise<void> {
    const detail = await call(window.api.templates.get({ id }))
    if (!detail) return
    const profile = this.profile
    if (profile && profile.template !== id) {
      const from = this.info?.templates.find((t) => t.id === profile.template)
      const to = this.info?.templates.find((t) => t.id === id)
      const kept: Profile['options'] = {}
      for (const [key, value] of Object.entries(profile.options)) {
        const before = from?.options.find((o) => o.id === key)
        if (to?.options.some((o) => o.id === key) && before && value !== before.default)
          kept[key] = value
      }
      profile.options = kept
      profile.template = id
    }
    this.detail = detail
    this.refused = null
  }

  /** Makes the pages again, at once or after the pause that lets a burst of changes count as one. */
  refreshPreview(pause = REFRESH_PAUSE_MS): void {
    clearTimeout(this.timer)
    if (!this.open || !this.profile) return
    this.timer = setTimeout(() => {
      preview.profile = $state.snapshot(this.profile) as Profile
      void preview.refresh()
    }, pause)
  }

  /** The pictures of the templates: all of them when the dialog opens, one again when its template changed. */
  async loadThumbnails(only?: string): Promise<void> {
    const language = i18n.locale
    await Promise.all(
      this.list
        .filter((t) => only === undefined || t.id === only)
        .map(async (t) => {
          // Not through `call`: a missing picture is no reason for an error message.
          const result = await window.api.export.thumbnail({ template: t.id, language })
          if (result.ok && result.value.png)
            this.thumbnails = {
              ...this.thumbnails,
              [t.id]: `data:image/png;base64,${result.value.png}`,
            }
        }),
    )
  }

  /** Reads the templates (and so the options the export offers) again; the profile keeps its choices. */
  private async reload(selectId?: string): Promise<void> {
    const [info, list] = await Promise.all([
      call(window.api.export.info({})),
      call(window.api.templates.list({})),
    ])
    if (info) this.info = info
    if (list) this.list = list
    if (selectId) await this.select(selectId)
    if (this.profile && !this.list.some((t) => t.id === this.profile!.template) && info)
      await this.select(info.profile.template)
    void this.loadThumbnails()
  }

  /** Makes a template of the writer's own from the one shown. */
  async duplicate(): Promise<void> {
    const source = this.list.find((t) => t.id === this.selectedId)
    if (!source) return
    const name = await promptDialog({
      title: i18n.t('templates.duplicate.title'),
      label: i18n.t('templates.duplicate.label'),
      initial: i18n.t('templates.duplicate.initial', { name: source.name[this.lang] }),
    })
    if (name === null) return
    const made = await call(window.api.templates.create({ baseId: source.id, name }))
    if (made) await this.reload(made.id)
  }

  async rename(): Promise<void> {
    const entry = this.list.find((t) => t.id === this.selectedId)
    if (!entry || entry.builtin) return
    const name = await promptDialog({
      title: i18n.t('templates.rename.title'),
      label: i18n.t('templates.duplicate.label'),
      initial: entry.name[this.lang],
    })
    if (name === null) return
    const done = await call(window.api.templates.rename({ id: entry.id, name }))
    if (done) await this.reload(entry.id)
  }

  async remove(): Promise<void> {
    const entry = this.list.find((t) => t.id === this.selectedId)
    if (!entry || entry.builtin) return
    const sure = await confirmDialog({
      title: i18n.t('templates.remove.title'),
      message: i18n.t('templates.remove.message', { name: entry.name[this.lang] }),
      confirmLabel: i18n.t('templates.remove.confirm'),
    })
    if (!sure) return
    const done = await call(window.api.templates.remove({ id: entry.id }))
    if (!done) return
    notify('info', i18n.t('templates.removed', { name: entry.name[this.lang] }))
    this.thumbnails = Object.fromEntries(
      Object.entries(this.thumbnails).filter(([id]) => id !== entry.id),
    )
    await this.reload(entry.base ?? this.list.find((t) => t.builtin)?.id)
  }

  /** Saves the template shown as a file, to share it or keep it elsewhere. */
  async exportFile(): Promise<void> {
    const entry = this.list.find((t) => t.id === this.selectedId)
    if (!entry || entry.builtin) return
    const name = entry.name[this.lang].replace(/[\\/:*?"<>|]/g, '-')
    const result = await call(
      window.api.templates.exportFile({
        id: entry.id,
        dialogTitle: i18n.t('templates.file.saveTitle'),
        filterName: i18n.t('templates.file.filter'),
        fileName: `${name}.ezetta-template`,
      }),
    )
    if (result?.path) notify('info', i18n.t('templates.file.saved', { path: result.path }))
  }

  /** Adds the template in a file as one of the writer's own, and shows it. */
  async importFile(): Promise<void> {
    const result = await call(
      window.api.templates.importFile({
        dialogTitle: i18n.t('templates.file.loadTitle'),
        filterName: i18n.t('templates.file.filter'),
      }),
    )
    if (!result?.id) return
    await this.reload(result.id)
    notify('info', i18n.t('templates.file.added', { name: this.detail?.name ?? '' }))
  }

  /** Changes the default of an option of the template shown, or whether the export panel offers it; null takes a field back to the base's. */
  async setOption(
    option: string,
    patch: { default?: PropValue | null; hidden?: boolean | null },
  ): Promise<void> {
    const detail = this.detail
    if (!detail || detail.builtin) return
    const result = await call(window.api.templates.setOption({ id: detail.id, option, ...patch }))
    if (result && this.detail?.id === detail.id) {
      this.detail = { ...detail, options: result.options }
      const info = await call(window.api.export.info({}))
      if (info) this.info = info
    }
  }

  /** Asks for font files and adds them to the template shown. */
  async addFonts(): Promise<void> {
    const detail = this.detail
    if (!detail || detail.builtin) return
    const result = await call(
      window.api.templates.addFonts({
        id: detail.id,
        dialogTitle: i18n.t('templates.fonts.pickTitle'),
        filterName: i18n.t('templates.fonts.filter'),
      }),
    )
    if (result && this.detail?.id === detail.id) {
      this.detail = { ...detail, ...result }
      this.refreshPreview()
    }
  }

  async removeFont(file: string): Promise<void> {
    const detail = this.detail
    if (!detail || detail.builtin) return
    const result = await call(window.api.templates.removeFont({ id: detail.id, file }))
    if (result && this.detail?.id === detail.id) {
      this.detail = { ...detail, ...result }
      this.refreshPreview()
    }
  }

  /** Sets a value of the shown template, or with `null` takes it back to the base's. */
  async set(element: string, prop: string, value: PropValue | null): Promise<void> {
    const detail = this.detail
    if (!detail || detail.builtin) return
    const result = await call(window.api.templates.set({ id: detail.id, element, prop, value }))
    if (!result) {
      this.refused = `${element}.${prop}`
      return
    }
    this.refused = null
    if (this.detail?.id === detail.id) this.detail = { ...detail, overrides: result.overrides }
    this.refreshPreview()
    // The template's picture follows, after the same pause.
    clearTimeout(this.thumbTimer)
    this.thumbTimer = setTimeout(() => void this.loadThumbnails(detail.id), REFRESH_PAUSE_MS)
  }

  /** Asks where to save, and exports. */
  async run(): Promise<void> {
    if (!this.profile || this.busy) return
    this.busy = true
    this.result = null
    this.elementId = EXPORT
    try {
      await editor.flush()
      const title = (project.snapshot?.title ?? 'Export').replace(/[\\/:*?"<>|]/g, '-')
      const result = await call(
        window.api.export.run({
          profile: $state.snapshot(this.profile) as Profile,
          dialogTitle: i18n.t('export.saveTitle'),
          filterName: i18n.t('export.filter'),
          fileName: `${title}.pdf`,
        }),
      )
      this.result = result
      // The profile was saved with the export: the chips follow its numbering.
      void headingNumbering.refresh()
    } finally {
      this.busy = false
    }
  }

  /** Opens the sheet a message is about, at its line. */
  async goTo(sheet: string, line: number): Promise<void> {
    const read = await call(window.api.project.readSheet({ path: sheet }))
    let offset = 0
    if (read && line > 1) {
      const lines = read.content.split('\n')
      offset = lines.slice(0, Math.min(line - 1, lines.length)).join('\n').length + 1
    }
    await this.leave()
    await project.openSheet(sheet, offset)
  }

  private get lang(): Locale {
    return i18n.locale
  }
}

export const exporting = new ExportStore()
