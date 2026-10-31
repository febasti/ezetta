import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { basename, join, relative, resolve, sep } from 'node:path'
import { MAX_ASSET_BYTES } from '@core/project/assets'
import { ProjectSession } from '@core/project/session'
import type { OpError, Outcome, ProjectSnapshot } from '@core/project/session'
import { IpcFailure } from '@shared/ipc'
import type { ProjectChangedDto } from '@shared/project'
import { isInside } from '../security/paths'
import { createRootedFs, renameRetrying } from './rootedFs'
import type { SettingsStore } from './settings'
import { ProjectBackup } from './backup'
import { ZipError, commonTopFolder, extractZip, listZip } from './unzip'
import type { BackupOutcome } from './backup'
import { ProjectHistory } from './history'
import type { VersionEntry, VersionFile } from './history'
import { watchProject } from './watcher'
import type { ProjectWatcher } from './watcher'
import { AUTO_INTERVAL_MS, isBinary } from '@core/history/versions'
import { backupDue } from '@core/history/backup'
import type { BackupFile } from '@core/history/backup'
import type { BackupStatusDto } from '@shared/backup'
import type { VersionKind } from '@core/history/versions'

export interface ProjectHostDeps {
  settings: SettingsStore
  trashItem: (absPath: string) => Promise<void>
  pickFolderToOpen: (title: string) => Promise<string | null>
  /** Asks for the location and name of a new project folder. */
  pickNewProjectPath: (title: string) => Promise<string | null>
  /** Asks for an image file anywhere on the computer. */
  pickImageFile: (title: string, filterName: string) => Promise<string | null>
  /** The system dialog to pick the folder backups are written to. */
  pickBackupFolder: (title: string) => Promise<string | null>
  /** The system dialog to pick a backup file (a zip). */
  pickBackupFile: (title: string, filterName: string) => Promise<string | null>
  /** The system dialog to pick the folder a backup is unpacked into. */
  pickRestoreFolder: (title: string) => Promise<string | null>
  /** The system dialog to pick a BibTeX file. */
  pickBibliographyFile: (title: string, filterName: string) => Promise<string | null>
  emitChanged: (payload: ProjectChangedDto) => void
  log: (message: string, cause?: unknown) => void
  watch?: typeof watchProject
  /** The versions of a project folder. Tests pass a fake. */
  history?: (root: string) => ProjectHistory
  /** Milliseconds between automatic versions, and before the first one (tests change them). */
  versionIntervalMs?: number
  firstVersionDelayMs?: number
  /** Tells the renderer that a backup started, finished or failed. */
  emitBackup?: (status: BackupStatusDto) => void
  /** Milliseconds between the checks whether a backup is due, and before the first (tests change them). */
  backupCheckMs?: number
  firstBackupDelayMs?: number
}

/** Turns a failed core outcome into the typed failure the IPC layer sends to the renderer. */
export function unwrap<T>(outcome: Outcome<T>): T {
  if (outcome.ok) return outcome.value
  throw new IpcFailure(outcome.error.code, outcome.error.message)
}

const fromError = (error: OpError): IpcFailure => new IpcFailure(error.code, error.message)

/**
 * Owns the one open project: its core session, the folder watcher, and the pushes to the renderer.
 * Adapter only; every rule lives in `core`.
 */
export class ProjectHost {
  private open_: {
    session: ProjectSession
    root: string
    watcher: ProjectWatcher
    history: ProjectHistory
    timer: NodeJS.Timeout | null
    backup: ProjectBackup
    backupTimer: NodeJS.Timeout | null
    backupRunning: boolean
    backupJob: Promise<BackupOutcome['status']> | null
    backupError: string | null
  } | null = null
  private lastSent = ''

  constructor(private readonly deps: ProjectHostDeps) {}

  /** Absolute folder of the open project, for the asset protocol. */
  get root(): string | null {
    return this.open_?.root ?? null
  }

  session(): ProjectSession {
    if (!this.open_) throw new IpcFailure('no_project', 'No project is open')
    return this.open_.session
  }

  /** The current snapshot. Remembers it, so the watcher does not push what the renderer has. */
  snapshot(): ProjectSnapshot | null {
    if (!this.open_) return null
    const snapshot = this.open_.session.snapshot()
    this.lastSent = fingerprint(snapshot)
    return snapshot
  }

  async pickAndOpen(dialogTitle: string): Promise<ProjectSnapshot | null> {
    const path = await this.deps.pickFolderToOpen(dialogTitle)
    return path === null ? null : this.openPath(path)
  }

  async pickAndCreate(language: string, dialogTitle: string): Promise<ProjectSnapshot | null> {
    const path = await this.deps.pickNewProjectPath(dialogTitle)
    if (path === null) return null
    try {
      await mkdir(path, { recursive: true })
    } catch (cause) {
      throw new IpcFailure('io', String(cause))
    }
    const session = await ProjectSession.create(
      createRootedFs(path, this.deps.trashItem),
      basename(path),
      language,
    )
    if (!session.ok) throw fromError(session.error)
    return this.attach(path, session.value)
  }

  /**
   * Picks a BibTeX file with the system dialog and makes it the project's bibliography. A file
   * outside the project is kept where it is, and watched there: another program (Zotero) writes it.
   */
  async chooseBibliography(
    dialogTitle: string,
    filterName: string,
  ): Promise<ProjectSnapshot | null> {
    const picked = await this.deps.pickBibliographyFile(dialogTitle, filterName)
    if (picked === null) return null
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const root = resolve(open.root)
    const abs = resolve(picked)
    const stored = isInside(root, abs) ? relative(root, abs).split(sep).join('/') : abs
    unwrap(await open.session.setBibliography(stored))
    this.syncExternalWatch()
    return this.snapshot()
  }

  /** Watches the bibliography file when it is outside the project folder. */
  private syncExternalWatch(): void {
    const open = this.open_
    if (!open) return
    const path = open.session.externalBibliography()
    open.watcher.setExternal(path ? [path] : [])
  }

  /** Picks an image with the system dialog and copies it into the project's `assets/` folder. */
  async chooseImage(dialogTitle: string, filterName: string): Promise<string | null> {
    const source = await this.deps.pickImageFile(dialogTitle, filterName)
    if (source === null) return null
    const session = this.session()
    let bytes: Uint8Array
    try {
      if ((await stat(source)).size > MAX_ASSET_BYTES)
        throw new IpcFailure('too_large', basename(source))
      bytes = await readFile(source)
    } catch (cause) {
      if (cause instanceof IpcFailure) throw cause
      throw new IpcFailure('io', `Cannot read ${basename(source)}`)
    }
    return unwrap(await session.addAsset(basename(source), bytes)).path
  }

  async openPath(path: string): Promise<ProjectSnapshot> {
    try {
      if (!(await stat(path)).isDirectory()) throw new Error('not a folder')
    } catch {
      await this.deps.settings.removeRecent(path).catch(() => undefined)
      throw new IpcFailure('not_found', 'The project folder does not exist')
    }
    const session = await ProjectSession.open(createRootedFs(path, this.deps.trashItem))
    if (!session.ok) throw fromError(session.error)
    return this.attach(path, session.value)
  }

  async close(): Promise<void> {
    const current = this.open_
    if (current) {
      // The last state of the project is kept as a version, before anything else lets go of it.
      if (current.timer) clearInterval(current.timer)
      if (current.backupTimer) clearInterval(current.backupTimer)
      if (current.session.historyEnabled())
        await current.history
          .snapshot('auto')
          .catch((cause) => this.deps.log('version failed', cause))
      // The last state is backed up too, if it changed; a big project must not hold the closing up.
      await this.backupAtClose(current)
    }
    this.open_ = null
    this.lastSent = ''
    await current?.watcher.close()
  }

  // --- versions ---------------------------------------------------------------------

  private historyOf(): ProjectHistory {
    if (!this.open_) throw new IpcFailure('no_project', 'No project is open')
    return this.open_.history
  }

  /** Takes a version now, if the project changed and versions are on. `force` for a version the writer asked for. */
  async takeVersion(kind: VersionKind, name: string | null = null): Promise<VersionEntry | null> {
    const open = this.open_
    if (!open || !open.session.historyEnabled()) return null
    try {
      return await open.history.snapshot(kind, name)
    } catch (cause) {
      this.deps.log('version failed', cause)
      return null
    }
  }

  async versions(limit?: number): Promise<{ enabled: boolean; versions: VersionEntry[] }> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const enabled = open.session.historyEnabled()
    try {
      return { enabled, versions: await open.history.list(limit) }
    } catch (cause) {
      this.deps.log('listing versions failed', cause)
      return { enabled, versions: [] }
    }
  }

  /** The files that are not the same now as in a version, and how many files are new since. */
  async versionFiles(id: string): Promise<{ files: VersionFile[]; newSince: number }> {
    const { files, newSince } = await this.historyOf().differences(id)
    return { files, newSince: newSince.length }
  }

  /** A file in a version and as it is now: as text to compare, or only by size when it is not text. */
  async compareVersion(
    id: string,
    path: string,
  ): Promise<{
    version: string | null
    current: string | null
    binary: boolean
    versionSize: number | null
    currentSize: number | null
  }> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const version = await open.history.readBytes(id, path)
    const current = await readFile(join(open.root, ...path.split('/'))).catch(() => null)
    const binary =
      (version !== null && isBinary(version)) || (current !== null && isBinary(current))
    const text = (bytes: Uint8Array | null): string | null =>
      bytes === null || binary ? null : new TextDecoder().decode(bytes)
    return {
      version: text(version),
      current: text(current),
      binary,
      versionSize: version?.length ?? null,
      currentSize: current?.length ?? null,
    }
  }

  /**
   * Brings a file back as it was in a version, a sheet or any other file. The state before is saved
   * as a version first, so the restore can be undone; the file is written the way every file is
   * (atomically, as bytes, so an image is not changed) and then found by the watcher like any
   * change from outside, so an open editor shows it.
   */
  async restoreVersion(id: string, path: string): Promise<ProjectSnapshot> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const content = await open.history.readBytes(id, path)
    if (content === null) throw new IpcFailure('not_found', 'The version has no such file')
    await open.history.snapshot('restore').catch((cause) => this.deps.log('version failed', cause))
    try {
      await createRootedFs(open.root, this.deps.trashItem).writeBytesAtomic(path, content)
    } catch (cause) {
      throw new IpcFailure('io', String(cause))
    }
    await this.onDiskChange(open.session, [path])
    return this.snapshot()!
  }

  /**
   * Brings the whole project back to a version: every file that is not the same now. With
   * `removeNew` the files that did not exist then go to the system trash; without it nothing is
   * removed. The state before is saved as a version first.
   */
  async restoreAllFromVersion(
    id: string,
    removeNew: boolean,
  ): Promise<{ snapshot: ProjectSnapshot; restored: number; removed: number }> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const { files, newSince } = await open.history.differences(id)
    await open.history.snapshot('restore').catch((cause) => this.deps.log('version failed', cause))
    const fs = createRootedFs(open.root, this.deps.trashItem)
    const touched: string[] = []
    try {
      for (const file of files) {
        const bytes = await open.history.readBytes(id, file.path)
        if (bytes === null) continue
        await fs.writeBytesAtomic(file.path, bytes)
        touched.push(file.path)
      }
      if (removeNew)
        for (const path of newSince) {
          await fs.trash(path)
          touched.push(path)
        }
    } catch (cause) {
      // What was done is found by the watcher; the state before is a version, so nothing is lost.
      if (touched.length > 0) await this.onDiskChange(open.session, touched)
      throw new IpcFailure('io', String(cause))
    }
    if (touched.length > 0) await this.onDiskChange(open.session, touched)
    return {
      snapshot: this.snapshot()!,
      restored: files.length,
      removed: removeNew ? newSince.length : 0,
    }
  }

  async setHistoryEnabled(enabled: boolean): Promise<ProjectSnapshot> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    unwrap(await open.session.setHistoryEnabled(enabled))
    // Turning them on takes one at once; the timer checks the setting every time it runs.
    if (enabled) void this.takeVersion('auto')
    return this.snapshot()!
  }

  private async attach(root: string, session: ProjectSession): Promise<ProjectSnapshot> {
    await this.close()
    const watch = this.deps.watch ?? watchProject
    const watcher = watch(root, (paths) => void this.onDiskChange(session, paths), {
      onError: (cause) => this.deps.log('watcher error', cause),
    })
    const history = this.deps.history?.(root) ?? new ProjectHistory(root, { log: this.deps.log })
    const backup = new ProjectBackup({
      root,
      title: () => session.title(),
      config: () => this.deps.settings.backupConfig(root),
      save: (config) => this.deps.settings.setBackupConfig(root, config),
      trash: this.deps.trashItem,
      log: this.deps.log,
    })
    this.open_ = {
      session,
      root,
      watcher,
      history,
      timer: null,
      backup,
      backupTimer: null,
      backupRunning: false,
      backupJob: null,
      backupError: null,
    }
    this.startVersions(this.open_)
    this.startBackups(this.open_)
    this.syncExternalWatch()
    const snapshot = this.snapshot()!
    await this.deps.settings
      .addRecent({ path: root, title: snapshot.title })
      .catch((cause) => this.deps.log('could not save recent projects', cause))
    return snapshot
  }

  /**
   * Versions while the project is open: one soon after opening (what was there is kept), then every
   * few minutes if something changed. Taking one does nothing when nothing did.
   */
  private startVersions(open: NonNullable<ProjectHost['open_']>): void {
    const take = (): void => {
      if (this.open_ === open) void this.takeVersion('auto')
    }
    open.timer = setInterval(take, this.deps.versionIntervalMs ?? AUTO_INTERVAL_MS)
    open.timer.unref?.()
    const first = setTimeout(take, this.deps.firstVersionDelayMs ?? 2000)
    first.unref?.()
  }

  // --- backup ----------------------------------------------------------------------

  /** A check every few minutes whether a backup is due: something changed, and the last is an hour old. */
  private startBackups(open: NonNullable<ProjectHost['open_']>): void {
    const tick = async (): Promise<void> => {
      if (this.open_ !== open || open.backupRunning) return
      const config = this.deps.settings.backupConfig(open.root)
      if (!config) return
      const changed = (await open.backup.fingerprint()) !== config.lastFingerprint
      if (backupDue(config.lastAt, Date.now(), changed)) await this.runBackup(false)
    }
    const check = (): void =>
      void tick().catch((cause) => this.deps.log('backup check failed', cause))
    open.backupTimer = setInterval(check, this.deps.backupCheckMs ?? 5 * 60 * 1000)
    open.backupTimer.unref?.()
    const first = setTimeout(check, this.deps.firstBackupDelayMs ?? 10_000)
    first.unref?.()
  }

  private async backupAtClose(open: NonNullable<ProjectHost['open_']>): Promise<void> {
    const config = this.deps.settings.backupConfig(open.root)
    if (!config || open.backupRunning) return
    try {
      if ((await open.backup.fingerprint()) === config.lastFingerprint) return
      await open.backup.run({ signal: AbortSignal.timeout(8000) })
    } catch (cause) {
      this.deps.log('backup at close failed', cause)
    }
  }

  async backupStatus(): Promise<BackupStatusDto> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const config = this.deps.settings.backupConfig(open.root)
    return {
      configured: config !== null,
      folder: config?.folder ?? null,
      reachable: config ? (await open.backup.folderProblem(config.folder)) === null : false,
      lastAt: config?.lastAt ?? null,
      lastFile: config?.lastFile ?? null,
      running: open.backupRunning,
      error: open.backupError,
    }
  }

  private async emitBackup(): Promise<void> {
    try {
      this.deps.emitBackup?.(await this.backupStatus())
    } catch {
      // The project closed meanwhile.
    }
  }

  /**
   * Makes a backup now. A failure is kept as the status's error, not thrown: the writer is not in
   * its way. A call made while one is running gets that one's result instead of starting another.
   */
  runBackup(force: boolean): Promise<BackupOutcome['status']> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    open.backupJob ??= this.backupJob(open, force).finally(() => (open.backupJob = null))
    return open.backupJob
  }

  private async backupJob(
    open: NonNullable<ProjectHost['open_']>,
    force: boolean,
  ): Promise<BackupOutcome['status']> {
    open.backupRunning = true
    open.backupError = null
    await this.emitBackup()
    let status: BackupOutcome['status']
    try {
      status = (await open.backup.run({ force })).status
      if (status === 'unreachable') open.backupError = 'unreachable'
    } catch (cause) {
      this.deps.log('backup failed', cause)
      open.backupError = cause instanceof Error ? cause.message : String(cause)
      status = 'unreachable'
    } finally {
      open.backupRunning = false
    }
    await this.emitBackup()
    return status
  }

  /** Picks the backup folder, checks it, and makes the first backup there. */
  async chooseBackupFolder(
    dialogTitle: string,
  ): Promise<{ chosen: boolean; problem: 'missing' | 'inside' | 'unwritable' | null }> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    const folder = await this.deps.pickBackupFolder(dialogTitle)
    if (folder === null) return { chosen: false, problem: null }
    const problem = await open.backup.folderProblem(folder)
    if (problem) return { chosen: false, problem }
    await this.deps.settings.setBackupConfig(open.root, {
      folder,
      lastAt: null,
      lastFingerprint: null,
      lastFile: null,
    })
    await this.runBackup(true)
    return { chosen: true, problem: null }
  }

  /**
   * Unpacks a backup (a zip of a project) into a new folder inside `parent` and opens it as the
   * project. Nothing that exists is overwritten: the folder gets a new name if its own is taken, and
   * the files are unpacked into a hidden temporary folder first and moved into place when complete.
   * Every name in the archive is checked, so a hostile zip cannot write elsewhere.
   */
  async restoreFromZip(zipPath: string, parent: string): Promise<ProjectSnapshot> {
    const temp = join(parent, `.ezetta-restoring-${randomBytes(4).toString('hex')}`)
    try {
      const entries = await listZip(zipPath)
      const top =
        commonTopFolder(entries) ?? (basename(zipPath).replace(/\.zip$/i, '') || 'Projekt')
      await mkdir(temp, { recursive: true })
      await extractZip(zipPath, temp)
      const unpacked = commonTopFolder(entries) === null ? temp : join(temp, top)
      if (!(await stat(join(unpacked, 'project.toml')).catch(() => null)))
        throw new IpcFailure('not_a_project', 'The backup has no project in it')
      let target = join(parent, top)
      for (let n = 2; await stat(target).catch(() => null); n += 1)
        target = join(parent, `${top} (${n})`)
      await renameRetrying(unpacked, target)
      return await this.openPath(target)
    } catch (cause) {
      if (cause instanceof IpcFailure) throw cause
      if (cause instanceof ZipError) throw new IpcFailure('io', cause.message)
      throw new IpcFailure('io', String(cause))
    } finally {
      // Only the temporary folder this made a moment ago.
      await rm(temp, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  /** Restores one of this project's backups: asks where to unpack it, then opens it. Null if cancelled. */
  async restoreBackupByName(name: string, folderTitle: string): Promise<ProjectSnapshot | null> {
    const zip = await this.backupPath(name)
    const parent = await this.deps.pickRestoreFolder(folderTitle)
    return parent === null ? null : this.restoreFromZip(zip, parent)
  }

  /** Restores a backup file the writer picks (the way back with no project open, on a new computer). Null if cancelled. */
  async restoreBackupFromFile(
    fileTitle: string,
    filterName: string,
    folderTitle: string,
  ): Promise<ProjectSnapshot | null> {
    const zip = await this.deps.pickBackupFile(fileTitle, filterName)
    if (zip === null) return null
    const parent = await this.deps.pickRestoreFolder(folderTitle)
    return parent === null ? null : this.restoreFromZip(zip, parent)
  }

  async disableBackup(): Promise<void> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    await this.deps.settings.setBackupConfig(open.root, null)
    open.backupError = null
    await this.emitBackup()
  }

  async backups(): Promise<BackupFile[]> {
    const open = this.open_
    if (!open) throw new IpcFailure('no_project', 'No project is open')
    return open.backup.list()
  }

  /** The path of one of this project's backups, for showing it in the file manager. */
  async backupPath(name: string): Promise<string> {
    const found = (await this.backups()).find((file) => file.name === name)
    const folder = this.open_ && this.deps.settings.backupConfig(this.open_.root)?.folder
    if (!found || !folder) throw new IpcFailure('not_found', 'There is no such backup')
    return resolve(folder, found.name)
  }

  private async onDiskChange(session: ProjectSession, paths: string[]): Promise<void> {
    try {
      const { snapshot, externallyChanged } = await session.refresh(paths)
      if (this.open_?.session !== session) return // a different project was opened meanwhile
      this.syncExternalWatch() // the manifest may name another bibliography file
      const print = fingerprint(snapshot)
      if (print === this.lastSent && externallyChanged.length === 0) return
      this.lastSent = print
      this.deps.emitChanged({ snapshot, externallyChanged })
    } catch (cause) {
      this.deps.log('refresh after disk change failed', cause)
    }
  }
}

/** Snapshot identity without the revision counter. */
function fingerprint(snapshot: ProjectSnapshot): string {
  return JSON.stringify({ ...snapshot, revision: 0 })
}
