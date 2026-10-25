import { diffCounts, diffWords } from '@core/history/diff'
import type { DiffPiece } from '@core/history/diff'
import type { VersionDto, VersionFileDto } from '@shared/history'
import { call } from '../../lib/api'
import { i18n } from '../../i18n/i18n.svelte'
import { confirmDialog, notify } from '../../lib/ui.svelte'
import { editor } from '../editor/editorSession.svelte'
import { backup } from './backup.svelte'
import { project } from '../sidebar/project.svelte'

/**
 * The dialog of the versions of the project: the versions, newest first; what one
 * changed; and, for a sheet, what bringing it back would change. The app takes the versions by
 * itself; the writer only looks, names one, or restores a sheet.
 */
class HistoryStore {
  open = $state(false)
  tab = $state<'versions' | 'backup'>('versions')
  loading = $state(false)
  busy = $state(false)
  versions = $state.raw<VersionDto[]>([])
  selectedId = $state<string | null>(null)
  files = $state.raw<VersionFileDto[]>([])
  /** Files there now that the chosen version did not have. */
  newSince = $state(0)
  /** Whether bringing everything back also takes those away (to the trash). */
  removeNew = $state(false)
  selectedPath = $state<string | null>(null)
  /** The chosen file in the version and now, with what a restore would change. */
  comparison = $state.raw<{
    version: string | null
    current: string | null
    binary: boolean
    versionSize: number | null
    currentSize: number | null
    pieces: DiffPiece[]
    lost: number
    back: number
  } | null>(null)
  naming = $state(false)
  name = $state('')

  get enabled(): boolean {
    return project.snapshot?.historyEnabled ?? true
  }

  get selected(): VersionDto | null {
    return this.versions.find((v) => v.id === this.selectedId) ?? null
  }

  /** Opens the dialog. Unsaved text is written first, so what is on the screen is what is shown. */
  async show(tab: 'versions' | 'backup' = 'versions'): Promise<void> {
    if (!project.snapshot) return
    await editor.flush()
    this.tab = tab
    this.open = true
    if (tab === 'backup') {
      void backup.refresh()
      void backup.loadFiles()
    }
    this.naming = false
    this.name = ''
    await this.load(null)
  }

  close(): void {
    // Closing while a save or restore is going on is fine: the main process finishes it either way.
    this.open = false
  }

  /** Reads the list again, and chooses `keep` (or the newest version). */
  async load(keep: string | null): Promise<void> {
    this.loading = true
    try {
      const result = await call(window.api.history.list({}))
      if (!result) return
      this.versions = result.versions
      const id = result.versions.find((v) => v.id === keep)?.id ?? result.versions[0]?.id ?? null
      await this.select(id)
    } finally {
      this.loading = false
    }
  }

  async select(id: string | null): Promise<void> {
    this.selectedId = id
    this.selectedPath = null
    this.comparison = null
    this.files = []
    this.newSince = 0
    this.removeNew = false
    if (id === null) return
    const result = await call(window.api.history.files({ id }))
    if (!result || this.selectedId !== id) return
    this.files = result.files
    this.newSince = result.newSince
    const first = result.files[0]
    if (first) await this.selectFile(first.path)
  }

  async selectFile(path: string): Promise<void> {
    const id = this.selectedId
    if (id === null) return
    this.selectedPath = path
    this.comparison = null
    const result = await call(window.api.history.compare({ id, path }))
    if (!result || this.selectedId !== id || this.selectedPath !== path) return
    const pieces = result.binary ? [] : diffWords(result.current ?? '', result.version ?? '')
    this.comparison = { ...result, pieces, ...diffCounts(pieces) }
  }

  /** Names the project as it is now. */
  async saveNamed(): Promise<void> {
    const name = this.name.trim()
    if (name === '' || this.busy) return
    this.busy = true
    try {
      await editor.flush()
      const result = await call(window.api.history.save({ name }))
      if (!result) return
      this.naming = false
      this.name = ''
      this.busy = false
      await this.load(result.version?.id ?? null)
    } finally {
      this.busy = false
    }
  }

  /** Brings the chosen sheet back as it was in the chosen version. */
  async restore(): Promise<void> {
    const id = this.selectedId
    const path = this.selectedPath
    if (id === null || path === null || this.busy) return
    this.busy = true
    try {
      await editor.flush()
      const result = await call(window.api.history.restore({ id, path }))
      if (!result) return
      project.apply(result.snapshot)
      notify('info', i18n.t('history.restored'))
      this.busy = false
      await this.load(id)
      await this.selectFile(path)
    } finally {
      this.busy = false
    }
  }

  /** Brings every file back that is not the same now, after asking: it is a big step, even though the state before is kept. */
  async restoreAll(): Promise<void> {
    const version = this.selected
    if (!version || this.busy || this.files.length + (this.removeNew ? this.newSince : 0) === 0)
      return
    const when = new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(version.time)
    const confirmed = await confirmDialog({
      title: i18n.t('history.restoreAllTitle'),
      message:
        i18n.t('history.restoreAllMessage', { count: this.files.length, when }) +
        (this.removeNew && this.newSince > 0
          ? ' ' + i18n.t('history.restoreAllRemove', { count: this.newSince })
          : ''),
      confirmLabel: i18n.t('history.restoreAllConfirm'),
    })
    if (!confirmed) return
    this.busy = true
    try {
      await editor.flush()
      const result = await call(
        window.api.history.restoreAll({ id: version.id, removeNew: this.removeNew }),
      )
      if (!result) return
      project.apply(result.snapshot)
      notify('info', i18n.t('history.restoredAll', { count: result.restored }))
      this.busy = false
      await this.load(version.id)
    } finally {
      this.busy = false
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const result = await call(window.api.history.setEnabled({ enabled }))
    if (!result) return
    project.apply(result.snapshot)
    await this.load(this.selectedId)
  }
}

export const history = new HistoryStore()
