import { isAbsolute, relative } from 'node:path'

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
