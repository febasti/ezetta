import type { BackupFileDto, BackupStatusDto } from '@shared/backup'
import { call } from '../../lib/api'
import { i18n } from '../../i18n/i18n.svelte'
import { confirmDialog, notify } from '../../lib/ui.svelte'
import { editor } from '../editor/editorSession.svelte'
import { project } from '../sidebar/project.svelte'

/**
 * The backup of the open project as the renderer sees it: where it goes, when it was last
 * made, and the backups in the folder. The main process makes them; this only asks and shows.
 */
class BackupStore {
  status = $state.raw<BackupStatusDto | null>(null)
  files = $state.raw<BackupFileDto[]>([])
  busy = $state(false)

  /** Subscribes to the main process, which says when a backup starts, ends or fails. */
  init(): void {
    window.api.on.backup.changed((status) => {
      this.status = status
      if (!status.running) void this.loadFiles()
    })
  }

  async refresh(): Promise<void> {
    const status = await call(window.api.backup.status({}))
    if (status) this.status = status
  }

  async loadFiles(): Promise<void> {
    const result = await call(window.api.backup.list({}))
    if (result) this.files = result.files
  }

  /** Asks for the folder, and makes the first backup there. */
  async chooseFolder(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const result = await call(
        window.api.backup.chooseFolder({ dialogTitle: i18n.t('backup.chooseTitle') }),
      )
      if (!result) return
      this.status = result.status
      if (result.problem) notify('error', i18n.t(`backup.problem.${result.problem}`))
      await this.loadFiles()
    } finally {
      this.busy = false
    }
  }

  async disable(): Promise<void> {
    const status = await call(window.api.backup.disable({}))
    if (status) this.status = status
    this.files = []
  }

  async runNow(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const result = await call(window.api.backup.run({}))
      if (!result) return
      this.status = result.status
      if (result.result === 'done') notify('info', i18n.t('backup.done'))
      else if (result.result === 'unreachable')
        notify('error', i18n.t('backup.unreachable', { folder: result.status.folder ?? '' }))
      await this.loadFiles()
    } finally {
      this.busy = false
    }
  }

  /** Unpacks one of this project's backups into a new folder, and opens it. */
  async restore(name: string): Promise<boolean> {
    if (this.busy) return false
    // Said before, because another project is open: what will happen to it, and what will not.
    const confirmed = await confirmDialog({
      title: i18n.t('backup.restoreConfirmTitle'),
      message: i18n.t('backup.restoreConfirmMessage'),
      confirmLabel: i18n.t('backup.restoreConfirm'),
    })
    if (!confirmed) return false
    this.busy = true
    try {
      await editor.flush()
      const result = await call(
        window.api.backup.restore({ name, dialogTitle: i18n.t('backup.restoreTitle') }),
      )
      if (!result?.snapshot) return false
      await project.adopt(result.snapshot)
      notify('info', i18n.t('backup.restoredAt', { path: result.path ?? '' }), 15_000)
      return true
    } finally {
      this.busy = false
    }
  }

  /** The way back on a new computer: pick a backup file, then where to unpack it. */
  async restoreFromFile(): Promise<boolean> {
    if (this.busy) return false
    this.busy = true
    try {
      const result = await call(
        window.api.backup.restoreFile({
          fileDialogTitle: i18n.t('backup.restoreFileTitle'),
          filterName: i18n.t('backup.zipFilter'),
          folderDialogTitle: i18n.t('backup.restoreTitle'),
        }),
      )
      if (!result?.snapshot) return false
      await project.adopt(result.snapshot)
      notify('info', i18n.t('backup.restoredFresh', { path: result.path ?? '' }), 15_000)
      return true
    } finally {
      this.busy = false
    }
  }

  async reveal(name: string): Promise<void> {
    await call(window.api.backup.reveal({ name }))
  }
}

export const backup = new BackupStore()
