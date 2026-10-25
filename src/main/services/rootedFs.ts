import { randomBytes } from 'node:crypto'
import { mkdir, open, readdir, readFile, realpath, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import type { DirEntry, FileSystem } from '@core/ports'
import { isSafeRelativePath } from '@core/project/paths'
import { isInside } from '../security/paths'

/** Writes `content` to `absPath` via a temporary file in the same directory, flushes it to disk,
 * then renames it over the target. A crash leaves the old file or the new one, never a
 * half-written file. The temporary file is hidden, so scanners and the watcher ignore it. */
export async function writeFileAtomic(
  absPath: string,
  content: string | Uint8Array,
): Promise<void> {
  const dir = dirname(absPath)
  await mkdir(dir, { recursive: true })
  const temp = join(dir, `.${basename(absPath)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    const handle = await open(temp, 'w')
    try {
      await handle.writeFile(content, typeof content === 'string' ? 'utf8' : undefined)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, absPath)
  } catch (cause) {
    await unlink(temp).catch(() => undefined)
    throw cause
  }
}

/** The most a bibliography file outside the project may hold. */
const MAX_EXTERNAL_BYTES = 50 * 1024 * 1024

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  )

/**
 * The `FileSystem` port backed by Node's fs, confined to `root`. Relative paths are validated, and
 * the real location (after resolving symbolic links) must stay inside the root, so a link inside
 * a project can never be used to read or write elsewhere.
 */
export function createRootedFs(
  root: string,
  trashItem: (absPath: string) => Promise<void>,
): FileSystem {
  const absRoot = resolve(root)
  let realRoot: string | null = null

  const confined = async (rel: string): Promise<string> => {
    if (!isSafeRelativePath(rel)) throw new Error(`Path is not allowed: ${rel}`)
    const abs = rel === '' ? absRoot : resolve(absRoot, ...rel.split('/'))
    realRoot ??= await realpath(absRoot)
    // The nearest existing ancestor decides where the path really lives.
    let probe = abs
    for (;;) {
      try {
        const real = await realpath(probe)
        if (real !== realRoot && !isInside(realRoot, real))
          throw new Error(`Path leaves the project: ${rel}`)
        return abs
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
        const parent = dirname(probe)
        if (parent === probe || !probe.startsWith(absRoot + sep)) return abs
        probe = parent
      }
    }
  }

  return {
    async readFile(path) {
      return readFile(await confined(path), 'utf8')
    },
    async readExternalText(absPath) {
      // Only an absolute path to a regular BibTeX file of a sensible size, never a link elsewhere.
      if (!isAbsolute(absPath) || !/^\.(bib|bibtex)$/i.test(extname(absPath)))
        throw new Error(`Not a bibliography file: ${absPath}`)
      const real = await realpath(absPath)
      const info = await stat(real)
      if (!info.isFile() || info.size > MAX_EXTERNAL_BYTES)
        throw new Error(`Not a readable bibliography file: ${absPath}`)
      return readFile(real, 'utf8')
    },
    async writeFileAtomic(path, content) {
      await writeFileAtomic(await confined(path), content)
    },
    async writeBytesAtomic(path, bytes) {
      await writeFileAtomic(await confined(path), bytes)
    },
    async readDir(path): Promise<DirEntry[]> {
      const entries = await readdir(await confined(path), { withFileTypes: true })
      const out: DirEntry[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
        if (entry.isDirectory()) out.push({ name: entry.name, kind: 'dir' })
        else if (entry.isFile()) out.push({ name: entry.name, kind: 'file' })
      }
      return out
    },
    exists: async (path) => exists(await confined(path)),
    async mkdir(path) {
      await mkdir(await confined(path), { recursive: true })
    },
    async rename(from, to) {
      const [source, target] = [await confined(from), await confined(to)]
      if (await exists(target)) {
        // The same file under another spelling (case-only rename on macOS and Windows) is fine.
        const [a, b] = await Promise.all([stat(source), stat(target)])
        if (a.ino !== b.ino || a.dev !== b.dev) throw new Error(`EEXIST: ${to}`)
      }
      await mkdir(dirname(target), { recursive: true })
      await rename(source, target)
    },
    async trash(path) {
      await trashItem(await confined(path))
    },
  }
}
