export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

export interface AutosaverOptions {
  /** Writes the content. Resolves true on success; false (or a throw) is a failure. */
  write: (path: string, content: string) => Promise<boolean>
  onState: (state: SaveState) => void
  delayMs?: number
  retryMs?: number
}

interface Job {
  path: string
  read: () => string
}

/**
 * Debounced autosave: saves shortly after typing stops, always flushes on demand
 * (blur, switching sheets, quitting), never overlaps two writes, and keeps the text pending after a
 * failure so the next attempt retries it. The content is read when the write starts, so a write
 * always carries the latest text.
 */
export class Autosaver {
  private job: Job | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  private paused = false
  state: SaveState = 'saved'

  constructor(private readonly options: AutosaverOptions) {}

  /** The text of `path` changed. `read` returns its current content. */
  edit(path: string, read: () => string): void {
    if (this.job && this.job.path !== path) void this.flush() // never carry edits across sheets
    this.job = { path, read }
    this.set('unsaved')
    this.schedule(this.options.delayMs ?? 800)
  }

  /** Writes pending text now and resolves when nothing is left to write. With `respectPause`, a
   * paused saver writes nothing (used for blur, which must not settle a conflict by itself). */
  async flush(options: { respectPause?: boolean } = {}): Promise<void> {
    if (this.paused && options.respectPause) return this.chain
    this.clearTimer()
    await this.drain()
  }

  /** Stops the timer-driven saves, for example while a conflict with the file on disk is open.
   * Edits stay pending, and an explicit `flush` (switching sheets, quitting) still writes them. */
  pause(): void {
    this.paused = true
    this.clearTimer()
  }

  resume(): void {
    this.paused = false
    if (this.job) this.schedule(this.options.delayMs ?? 800)
  }

  /** Forgets pending text without writing it (the file was reloaded from disk). */
  discard(): void {
    this.clearTimer()
    this.paused = false
    this.job = null
    if (this.state !== 'saving') this.set('saved')
  }

  get hasPending(): boolean {
    return this.job !== null || this.state === 'saving'
  }

  private schedule(ms: number): void {
    this.clearTimer()
    if (this.paused) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.drain()
    }, ms)
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private drain(): Promise<void> {
    const job = this.job
    if (!job) return this.chain
    this.job = null
    this.set('saving')
    this.chain = this.chain.then(async () => {
      let saved: boolean
      try {
        saved = await this.options.write(job.path, job.read())
      } catch {
        saved = false
      }
      if (saved) {
        if (!this.job) this.set('saved')
      } else {
        this.job ??= job // keep it for the retry
        this.set('error')
        this.schedule(this.options.retryMs ?? 3000)
      }
    })
    return this.chain
  }

  private set(state: SaveState): void {
    if (this.state === state) return
    this.state = state
    this.options.onState(state)
  }
}
