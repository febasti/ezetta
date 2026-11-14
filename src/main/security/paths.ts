import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

/** True when `candidate` is strictly inside `root` (the root itself does not count). Both paths
 * must already be resolved to absolute paths. */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return (
    rel !== '' &&
    rel !== '..' &&
    !rel.startsWith(`..${'/'}`) &&
    !rel.startsWith('..\\') &&
    !isAbsolute(rel)
  )
}

/**
 * The real path of `relPath` below `root`, with every link followed, or null when it is not a file
 * inside the root, is missing, or leads out of it through a link. A check of the written path alone
 * lets a link in the project folder point anywhere on the computer.
 */
export async function realFileInside(root: string, relPath: string): Promise<string | null> {
  const written = resolve(join(root, relPath))
  if (!isInside(resolve(root), written)) return null
  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(written)])
    return isInside(realRoot, realFile) ? realFile : null
  } catch {
    return null
  }
}
