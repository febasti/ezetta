import { treePathOf } from '../project/paths'

/**
 * Versions of a project, the pure part: what is kept, how a version is named and read
 * back, and when one is due. The version store itself (git in a hidden folder) is in the main
 * process.
 */

/**
 * `auto`: taken by the app while the writer works, and when the project closes. `named`: saved by
 * the writer with a name. `export`: taken before a PDF is made. `restore`: the state before
 * something was brought back, so that restoring can itself be undone.
 */
export type VersionKind = 'auto' | 'named' | 'export' | 'restore'

export const VERSION_KINDS: readonly VersionKind[] = ['auto', 'named', 'export', 'restore']

/** A version is taken at most this often while there are changes. */
export const AUTO_INTERVAL_MS = 10 * 60 * 1000

/** Files larger than this (images, PDFs) are left out of the versions: they would fill the disk. */
export const MAX_VERSIONED_BYTES = 25 * 1024 * 1024

/** The folder of the version store, inside the project and hidden. */
export const HISTORY_DIR = '.ezetta/history.git'

/**
 * True for the files that belong in the versions: everything of the project except hidden files
 * and folders (the store itself, `.git`), `_build/` (made by the export), and `node_modules`.
 */
export function isVersioned(path: string): boolean {
  const parts = path.split('/')
  if (parts.some((part) => part.startsWith('.'))) return false
  return parts[0] !== '_build' && parts[0] !== 'node_modules'
}

/** A version's message: the writer's name for it (if any), and its kind as a trailer. */
export function encodeMessage(kind: VersionKind, name: string | null): string {
  const title = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  return `${title}\n\nEzetta-Kind: ${kind}\n`
}

export function decodeMessage(message: string): { kind: VersionKind; name: string | null } {
  const kind = /^Ezetta-Kind: (\w+)\s*$/m.exec(message)?.[1]
  const first = message.split('\n')[0]?.trim() ?? ''
  return {
    kind: VERSION_KINDS.find((k) => k === kind) ?? 'auto',
    name: first === '' || first.startsWith('Ezetta-Kind:') ? null : first,
  }
}

/** Files larger than this are not compared word by word. */
export const MAX_TEXT_COMPARE_BYTES = 2 * 1024 * 1024

/** True for a file that is not text to compare: it has a NUL byte near its start (an image, a PDF), or is very large. */
export function isBinary(bytes: Uint8Array): boolean {
  if (bytes.length > MAX_TEXT_COMPARE_BYTES) return true
  const head = Math.min(bytes.length, 8000)
  for (let i = 0; i < head; i += 1) if (bytes[i] === 0) return true
  return false
}

/**
 * The path in the project's tree of a sheet, for a file path of the project: a sheet of `content/` by
 * its path in it, a sheet of the material (`material/`) by its path under `:material`; null for any other file.
 */
export function sheetOfPath(path: string): string | null {
  return path.endsWith('.typ') ? treePathOf(path) : null
}

/** A sheet's name for a list: its first line without heading marks, or the start of its text. */
export function sheetTitle(content: string): string {
  for (const raw of content.split('\n')) {
    const line = raw
      .replace(/^\s*=+\s*/, '')
      .replace(/<[^>]*>\s*$/, '')
      .trim()
    if (line !== '') return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line
  }
  return ''
}

/** True when a new automatic version is due: something changed, and the last one is old enough. */
export function autoVersionDue(lastAt: number | null, now: number, changed: boolean): boolean {
  return changed && (lastAt === null || now - lastAt >= AUTO_INTERVAL_MS)
}
