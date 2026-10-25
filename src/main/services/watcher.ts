import { isAbsolute, relative, sep } from 'node:path'
import chokidar from 'chokidar'

export interface ProjectWatcher {
  /**
   * Also watches files outside the project folder, such as a bibliography that another program
   * writes. They are reported by their absolute path. Replaces the files named before.
   */
  setExternal(paths: readonly string[]): void
  close(): Promise<void>
}

const isOutside = (rel: string): boolean => rel === '..' || rel.startsWith('..') || isAbsolute(rel)

const IGNORED_TOP_LEVEL = new Set(['_build', 'node_modules', '.git'])

/**
 * Watches a project folder recursively and reports batches of changed, project-relative paths
 * (with "/" separators). Events are collected for `debounceMs` so a burst, such as a git checkout
 * or a folder move, arrives as one batch. Hidden files, `_build/`, and `.git` are ignored.
 */
export function watchProject(
  root: string,
  onChange: (paths: string[]) => void,
  options: { debounceMs?: number; onError?: (error: unknown) => void } = {},
): ProjectWatcher {
  const debounceMs = options.debounceMs ?? 200
  let pending = new Set<string>()
  let timer: NodeJS.Timeout | null = null

  const flush = (): void => {
    timer = null
    const paths = [...pending]
    pending = new Set()
    if (paths.length > 0) onChange(paths)
  }

  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    ignored: (path) => {
      const rel = relative(root, path)
      if (rel === '' || isOutside(rel)) return false // a file outside the project that was asked for
      const parts = rel.split(sep)
      return IGNORED_TOP_LEVEL.has(parts[0]!) || parts.some((part) => part.startsWith('.'))
    },
  })
  const record = (path: string): void => {
    const rel = relative(root, path)
    pending.add(isOutside(rel) ? path : rel.split(sep).join('/'))
    timer ??= setTimeout(flush, debounceMs)
  }
  watcher.on('all', (_event, path) => record(path))
  watcher.on('error', (error) => options.onError?.(error))

  let external: readonly string[] = []
  return {
    setExternal(paths) {
      for (const path of external) if (!paths.includes(path)) void watcher.unwatch(path)
      for (const path of paths) if (!external.includes(path)) watcher.add(path)
      external = [...paths]
    },
    async close() {
      if (timer) clearTimeout(timer)
      pending = new Set()
      await watcher.close()
    },
  }
}
