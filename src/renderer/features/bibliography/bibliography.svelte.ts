import type { BibEntry } from '@core/bib/bibtex'
import { call } from '../../lib/api'

/**
 * The works of the project's bibliography file, for citation chips, the `@` menu and the
 * insert dialog. The file is read again whenever the project's snapshot says it changed.
 */
class Bibliography {
  entries = $state.raw<readonly BibEntry[]>([])
  /** What could not be read in the file, with line numbers. */
  problems = $state.raw<readonly string[]>([])
  /** Counts up with every reload, so editors know to draw their chips again. */
  version = $state(0)

  private stamp: string | null = null
  private index = new Map<string, BibEntry>()

  lookup = (key: string): BibEntry | undefined => this.index.get(key)

  /** Reads the file again if its stamp differs from the one last read. */
  async sync(stamp: string): Promise<void> {
    if (stamp === this.stamp) return
    this.stamp = stamp
    const result = await call(window.api.project.readBibliography({}))
    if (!result || this.stamp !== stamp) return
    this.index = new Map(result.entries.map((entry) => [entry.key, entry]))
    this.entries = result.entries
    this.problems = result.problems
    this.version += 1
  }

  clear(): void {
    this.stamp = null
    this.index = new Map()
    this.entries = []
    this.problems = []
    this.version += 1
  }
}

export const bibliography = new Bibliography()
