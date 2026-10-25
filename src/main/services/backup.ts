import { createHash } from 'node:crypto'
import { readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { backupFileName, backupsToDelete, parseBackupName } from '@core/history/backup'
import type { BackupFile } from '@core/history/backup'
import { isInside } from '../security/paths'
import type { BackupConfig } from './settings'
import { isCompressedAlready, writeZip } from './zip'
import type { ZipEntry } from './zip'

export type BackupOutcome =
  | { status: 'done'; file: string }
  | { status: 'unchanged' }
  | { status: 'no_folder' }
  /** The folder is not there (a drive that is not plugged in) or cannot be written to. */
  | { status: 'unreachable' }

export interface BackupDeps {
  root: string
  title: () => string
  config: () => BackupConfig | null
  save: (config: BackupConfig) => Promise<void>
  /** Moves a file to the system trash: old backups are thinned out, never deleted for good. */
  trash: (absPath: string) => Promise<void>
  now?: () => number
  log?: (message: string, cause?: unknown) => void
}

/** Folders and files of the project that are not backed up: made again by the export, or from outside. */
const SKIPPED_TOP_LEVEL = new Set(['_build', 'node_modules'])

/**
 * A backup of one project: a zip of the project folder, history included, in a folder
 * the writer chose, named with the title and the time. Made as a hidden temporary file in that
 * folder and renamed when it is complete, so the folder never holds a half-written backup. Old
 * backups of this project are thinned out (`backupsToDelete`), to the system trash. Runs are
 * queued, so two never write at once.
 */
export class ProjectBackup {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: BackupDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** The files to put in a backup, with their names inside the archive. */
  private async entries(): Promise<ZipEntry[]> {
    const top = basename(resolve(this.deps.root))
    const out: ZipEntry[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(join(this.deps.root, ...(dir ? dir.split('/') : [])), {
        withFileTypes: true,
      }).catch(() => [])
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name
        if (!dir && SKIPPED_TOP_LEVEL.has(entry.name)) continue
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) await walk(path)
        else if (entry.isFile()) {
          const abs = join(this.deps.root, ...path.split('/'))
          const info = await stat(abs).catch(() => null)
          if (info) {
            const name = `${top}/${path}`
            // Compressing an image or a stored git object again only costs time.
            out.push({ name, path: abs, mtime: info.mtimeMs, store: isCompressedAlready(path) })
          }
        }
      }
    }
    await walk('')
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** What the project looks like: its files with their sizes and times. Equal while nothing changed. */
  async fingerprint(): Promise<string> {
    const hash = createHash('sha1')
    for (const entry of await this.entries()) {
      const info = await stat(entry.path).catch(() => null)
      if (info) hash.update(`${entry.name}\u0000${info.size}\u0000${Math.floor(info.mtimeMs)}\n`)
    }
    return hash.digest('hex')
  }

  /** Whether the folder can be used: it exists, is not inside the project, and can be written to. */
  async folderProblem(folder: string): Promise<'missing' | 'inside' | 'unwritable' | null> {
    const info = await stat(folder).catch(() => null)
    if (!info?.isDirectory()) return 'missing'
    if (
      resolve(folder) === resolve(this.deps.root) ||
      isInside(resolve(this.deps.root), resolve(folder))
    )
      return 'inside'
    const probe = join(folder, `.ezetta-${process.pid}-${Date.now()}.tmp`)
    try {
      await writeFile(probe, '')
      await unlink(probe)
      return null
    } catch {
      return 'unwritable'
    }
  }

  /** The backups of this project in the folder, newest first. */
  async list(): Promise<BackupFile[]> {
    const folder = this.deps.config()?.folder
    if (!folder) return []
    const names = await readdir(folder).catch(() => [])
    const files: BackupFile[] = []
    for (const name of names) {
      const time = parseBackupName(name, this.deps.title())
      if (time === null) continue
      const info = await stat(join(folder, name)).catch(() => null)
      if (info?.isFile()) files.push({ name, time, size: info.size })
    }
    return files.sort((a, b) => b.time - a.time)
  }

  /** Makes a backup now. Unless `force`, nothing is made while nothing changed since the last one. */
  run(options: { force?: boolean; signal?: AbortSignal } = {}): Promise<BackupOutcome> {
    return this.serial(async () => {
      const config = this.deps.config()
      if (!config) return { status: 'no_folder' }
      if ((await this.folderProblem(config.folder)) !== null) return { status: 'unreachable' }
      const fingerprint = await this.fingerprint()
      if (!options.force && fingerprint === config.lastFingerprint) return { status: 'unchanged' }

      const time = this.now()
      const name = backupFileName(this.deps.title(), time)
      const target = join(config.folder, name)
      const temp = join(config.folder, `.${name}.tmp`)
      try {
        await writeZip(temp, await this.entries(), options.signal)
        await rename(temp, target)
      } catch (cause) {
        await unlink(temp).catch(() => undefined)
        throw cause
      }
      await this.deps.save({
        ...config,
        lastAt: time,
        lastFingerprint: fingerprint,
        lastFile: name,
      })
      await this.thin(time)
      return { status: 'done', file: name }
    })
  }

  /** Moves the backups that are no longer needed to the trash. A failure is logged, never raised. */
  private async thin(now: number): Promise<void> {
    const folder = this.deps.config()?.folder
    if (!folder) return
    try {
      for (const file of backupsToDelete(await this.list(), now))
        await this.deps
          .trash(join(folder, file.name))
          .catch((cause) => this.deps.log?.('could not trash a backup', cause))
    } catch (cause) {
      this.deps.log?.('thinning backups failed', cause)
    }
  }
}
