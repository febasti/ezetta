import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

/**
 * The app's log: one file in a folder of the app's data, so that what went wrong on a writer's
 * computer can be read afterwards (the console of a packaged app is seen by no one). When the file
 * passes its size it becomes `ezetta.old.log`, replacing the one before: the two never take more
 * than twice the size. Writing never throws; a log that cannot be written is simply not written.
 * It is for problems: nothing logs the text of a sheet on purpose.
 */
export interface LogFile {
  readonly path: string
  write: (message: string, cause?: unknown) => void
}

export const LOG_NAME = 'ezetta.log'
const OLD_NAME = 'ezetta.old.log'

export function createLogFile(
  dir: string,
  options: { maxBytes?: number; now?: () => Date } = {},
): LogFile {
  const maxBytes = options.maxBytes ?? 1_000_000
  const now = options.now ?? (() => new Date())
  const path = join(dir, LOG_NAME)
  let size: number | null = null

  const currentSize = (): number => {
    if (size === null) {
      mkdirSync(dir, { recursive: true })
      size = statSync(path, { throwIfNoEntry: false })?.size ?? 0
    }
    return size
  }

  return {
    path,
    write(message, cause) {
      const detail =
        cause === undefined || cause === ''
          ? ''
          : ` ${typeof cause === 'string' ? cause : inspect(cause, { depth: 4, breakLength: Infinity })}`
      const line = `${now().toISOString()} ${message}${detail}\n`
      try {
        const bytes = Buffer.byteLength(line)
        if (currentSize() > 0 && currentSize() + bytes > maxBytes) {
          renameSync(path, join(dir, OLD_NAME))
          size = 0
        }
        appendFileSync(path, line)
        size = currentSize() + bytes
      } catch {
        // The log is a help, never a reason to fail.
      }
    },
  }
}
