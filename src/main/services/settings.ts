import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from './rootedFs'

export interface RecentProject {
  path: string
  title: string
}

/** Where and when a project was last backed up. Machine-specific, so it is not in the project file. */
export interface BackupConfig {
  /** The folder the backups are written to. */
  folder: string
  lastAt: number | null
  /** What the project looked like then (`ProjectBackup.fingerprint`), to tell whether it changed. */
  lastFingerprint: string | null
  lastFile: string | null
}

const MAX_RECENT = 10

/** Where the window was when it closed, to open it there again. */
export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

export type AppTheme = 'light' | 'dark' | 'sepia'
const THEMES: readonly AppTheme[] = ['light', 'dark', 'sepia']

/** App-level settings in the user data folder. Corrupt or missing files are replaced by defaults,
 * because nothing in here is the writer's text. */
export class SettingsStore {
  private recent: RecentProject[] = []
  /** The personal dictionary: words the spelling check accepts in every project. */
  private words: string[] = []
  /** The backup of each project, by the project's folder. */
  private backups: Record<string, BackupConfig> = {}
  private window: WindowState | null = null
  /** The theme the renderer last chose, so the next window opens in its colours. */
  private theme: AppTheme | null = null
  /** Whether the next start opens the project that was open last (off: the welcome screen). */
  private reopenLast = false
  private readonly file: string

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'settings.json')
  }

  async load(): Promise<void> {
    try {
      const data: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      const stored = (data as { words?: unknown }).words
      this.words = Array.isArray(stored)
        ? stored.filter((w): w is string => typeof w === 'string')
        : []
      const list = (data as { recent?: unknown }).recent
      if (Array.isArray(list)) {
        this.recent = list
          .filter(
            (e): e is RecentProject => typeof e?.path === 'string' && typeof e?.title === 'string',
          )
          .slice(0, MAX_RECENT)
      }
      const backups = (data as { backups?: unknown }).backups
      this.backups = {}
      if (backups && typeof backups === 'object') {
        for (const [root, value] of Object.entries(backups)) {
          const v = value as Partial<BackupConfig> | null
          if (v && typeof v.folder === 'string')
            this.backups[root] = {
              folder: v.folder,
              lastAt: typeof v.lastAt === 'number' ? v.lastAt : null,
              lastFingerprint: typeof v.lastFingerprint === 'string' ? v.lastFingerprint : null,
              lastFile: typeof v.lastFile === 'string' ? v.lastFile : null,
            }
        }
      }
      const w = (data as { window?: Partial<WindowState> | null }).window
      this.window =
        w && [w.x, w.y, w.width, w.height].every((n) => typeof n === 'number' && Number.isFinite(n))
          ? {
              x: w.x!,
              y: w.y!,
              width: w.width!,
              height: w.height!,
              maximized: w.maximized === true,
            }
          : null
      const theme = (data as { theme?: unknown }).theme
      this.theme = THEMES.includes(theme as AppTheme) ? (theme as AppTheme) : null
      this.reopenLast = (data as { reopenLast?: unknown }).reopenLast === true
    } catch {
      this.recent = []
      this.words = []
      this.backups = {}
      this.window = null
      this.theme = null
      this.reopenLast = false
    }
  }

  windowState(): WindowState | null {
    return this.window
  }

  async setWindowState(state: WindowState): Promise<void> {
    this.window = state
    await this.save()
  }

  appTheme(): AppTheme | null {
    return this.theme
  }

  async setAppTheme(theme: AppTheme): Promise<void> {
    if (this.theme === theme) return
    this.theme = theme
    await this.save()
  }

  reopensLastProject(): boolean {
    return this.reopenLast
  }

  async setReopenLastProject(on: boolean): Promise<void> {
    if (this.reopenLast === on) return
    this.reopenLast = on
    await this.save()
  }

  recentProjects(): readonly RecentProject[] {
    return this.recent
  }

  backupConfig(root: string): BackupConfig | null {
    return this.backups[root] ?? null
  }

  async setBackupConfig(root: string, config: BackupConfig | null): Promise<void> {
    if (config === null) delete this.backups[root]
    else this.backups[root] = config
    await this.save()
  }

  personalWords(): readonly string[] {
    return this.words
  }

  async addPersonalWord(word: string): Promise<void> {
    const clean = word.trim()
    if (clean === '' || /[\r\n]/.test(clean) || this.words.includes(clean)) return
    this.words = [...this.words, clean].sort((a, b) => a.localeCompare(b))
    await this.save()
  }

  async addRecent(project: RecentProject): Promise<void> {
    this.recent = [project, ...this.recent.filter((p) => p.path !== project.path)].slice(
      0,
      MAX_RECENT,
    )
    await this.save()
  }

  async removeRecent(path: string): Promise<void> {
    this.recent = this.recent.filter((p) => p.path !== path)
    await this.save()
  }

  private async save(): Promise<void> {
    await writeFileAtomic(
      this.file,
      JSON.stringify(
        {
          recent: this.recent,
          words: this.words,
          backups: this.backups,
          window: this.window,
          theme: this.theme,
          reopenLast: this.reopenLast,
        },
        null,
        2,
      ),
    )
  }
}
