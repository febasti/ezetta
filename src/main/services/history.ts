import fs from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { dirname, join } from 'node:path'
import { isCompressedAlready } from './zip'
import git from 'isomorphic-git'
import type { TreeEntry } from 'isomorphic-git'
import {
  HISTORY_DIR,
  MAX_VERSIONED_BYTES,
  decodeMessage,
  encodeMessage,
  isBinary,
  isVersioned,
  sheetOfPath,
  sheetTitle,
} from '@core/history/versions'
import type { VersionKind } from '@core/history/versions'
import { renameRetrying } from './rootedFs'

export interface VersionEntry {
  /** The commit id. */
  id: string
  /** When it was taken, in milliseconds. */
  time: number
  kind: VersionKind
  name: string | null
}

export interface VersionFile {
  /** The path in the project, such as `content/methoden/s-k4x9tm.typ`. */
  path: string
  /** The sheet's path inside `content/`, or null for any other file. */
  sheet: string | null
  /** `modified`: the file is not the same now. `deleted`: it is gone. */
  change: 'modified' | 'deleted'
  /** A sheet's first line in the version (empty for other files). */
  title: string
  /** Not text that can be compared word by word: an image, or a file too large for that. */
  binary: boolean
}

const AUTHOR = { name: 'Ezetta', email: 'versions@ezetta.invalid' }

const decoder = new TextDecoder('utf-8')
const deflate = promisify(zlib.deflate)

/**
 * The versions of one project: git, through `isomorphic-git`, so nothing has to be
 * installed, in a hidden folder inside the project (`.ezetta/history.git`) that tracks the
 * project folder. A `.git` the writer has of their own is not touched. Nothing here writes to the
 * project's files: restoring is the host's job. Calls are queued, so two never work on the store at
 * once.
 */
export class ProjectHistory {
  private readonly gitdir: string
  private queue: Promise<unknown> = Promise.resolve()
  private ready = false

  constructor(
    private readonly root: string,
    private readonly options: {
      now?: () => number
      log?: (message: string, cause?: unknown) => void
    } = {},
  ) {
    this.gitdir = join(root, ...HISTORY_DIR.split('/'))
  }

  private base(): { fs: typeof fs; dir: string; gitdir: string } {
    return { fs, dir: this.root, gitdir: this.gitdir }
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async init(): Promise<void> {
    if (this.ready) return
    await git.init({ ...this.base(), defaultBranch: 'main' })
    this.ready = true
  }

  /**
   * Takes a version of the project as it is on disk now. Returns null when nothing changed since
   * the last one (a version is never taken for nothing).
   *
   * The files are compared by their content, not by the stat cache of an index: git's cache cannot
   * tell two edits of the same size within one second apart, and an edit lost from the versions is
   * worse than the cost of reading a few small files. The tree is written directly.
   */
  snapshot(kind: VersionKind, name: string | null = null): Promise<VersionEntry | null> {
    return this.serial(async () => {
      await this.init()
      const head = await this.headTree()
      const files = new Map<string, string>() // path -> blob id
      let changed = 0
      for (const path of await this.projectFiles()) {
        const bytes = await readFile(join(this.root, ...path.split('/'))).catch(() => null)
        if (bytes === null) continue // gone while we looked
        const { oid } = await git.hashBlob({ object: bytes })
        files.set(path, oid)
        if (head.get(path) !== oid) {
          await this.writeBlob(oid, bytes, path)
          changed += 1
        }
      }
      for (const path of head.keys()) if (!files.has(path)) changed += 1
      // A version the writer names is kept even when nothing changed since the last one: the name is the point.
      if (changed === 0 && (kind !== 'named' || head.size === 0)) return null
      if (files.size === 0) return null
      const tree = await this.writeTree(files)
      const time = this.options.now?.() ?? Date.now()
      const id = await git.commit({
        ...this.base(),
        tree,
        message: encodeMessage(kind, name),
        author: { ...AUTHOR, timestamp: Math.floor(time / 1000) },
      })
      return { id, time: Math.floor(time / 1000) * 1000, kind, name: name?.trim() || null }
    })
  }

  /**
   * Writes a file as a loose git object. `isomorphic-git` would do this in JavaScript, which took
   * 6 seconds for 300 MB of images and held the process while it did; the native zlib runs off the
   * main thread, and a file that is compressed already (an image) is stored without compressing it
   * again, which makes it almost free. Git reads the object like any other.
   */
  private async writeBlob(oid: string, bytes: Uint8Array, path: string): Promise<void> {
    const file = join(this.gitdir, 'objects', oid.slice(0, 2), oid.slice(2))
    if (
      await stat(file).then(
        () => true,
        () => false,
      )
    )
      return
    const raw = Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])
    const packed = await deflate(raw, { level: isCompressedAlready(path) ? 0 : 6 })
    // Written under a temporary name and renamed, so a half-written object is never read, but not
    // flushed to disk: git does not either, and a flush for each of hundreds of small files is slow.
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, packed)
    await renameRetrying(temp, file)
  }

  /** The paths of the project's files that belong in the versions, by walking the folder. */
  private async projectFiles(dir = ''): Promise<string[]> {
    const out: string[] = []
    const entries = await readdir(join(this.root, ...(dir ? dir.split('/') : [])), {
      withFileTypes: true,
    }).catch(() => [])
    for (const entry of entries) {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (!isVersioned(path)) continue
      if (entry.isDirectory()) out.push(...(await this.projectFiles(path)))
      else if (entry.isFile()) {
        const size = await stat(join(this.root, ...path.split('/'))).then(
          (s) => s.size,
          () => 0,
        )
        if (size > MAX_VERSIONED_BYTES) this.options.log?.(`not versioned, too large: ${path}`)
        else out.push(path)
      }
    }
    return out
  }

  /** The files of the newest version, as path -> blob id (empty before the first one). */
  private async headTree(): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (!(await this.hasHead())) return map
    await git.walk({
      ...this.base(),
      trees: [git.TREE({ ref: 'HEAD' })],
      map: async (filepath, [entry]) => {
        if (filepath !== '.' && (await entry?.type()) === 'blob')
          map.set(filepath, (await entry!.oid())!)
        return undefined
      },
    })
    return map
  }

  /** Writes the folders of a set of files as git trees, from the bottom up, and returns the top one. */
  private async writeTree(files: Map<string, string>): Promise<string> {
    interface Dir {
      files: Map<string, string>
      dirs: Map<string, Dir>
    }
    const root: Dir = { files: new Map(), dirs: new Map() }
    for (const [path, oid] of files) {
      const parts = path.split('/')
      let dir = root
      for (const part of parts.slice(0, -1)) {
        let next = dir.dirs.get(part)
        if (!next) dir.dirs.set(part, (next = { files: new Map(), dirs: new Map() }))
        dir = next
      }
      dir.files.set(parts[parts.length - 1]!, oid)
    }
    const write = async (dir: Dir): Promise<string> => {
      const tree: TreeEntry[] = []
      for (const [path, oid] of dir.files) tree.push({ mode: '100644', path, oid, type: 'blob' })
      for (const [path, sub] of dir.dirs)
        tree.push({ mode: '040000', path, oid: await write(sub), type: 'tree' })
      return git.writeTree({ ...this.base(), tree })
    }
    return write(root)
  }

  private async hasHead(): Promise<boolean> {
    return git.resolveRef({ ...this.base(), ref: 'HEAD' }).then(
      () => true,
      () => false,
    )
  }

  /** The newest versions first. */
  list(limit = 200): Promise<VersionEntry[]> {
    return this.serial(async () => {
      await this.init()
      const log = await git
        .log({ ...this.base(), depth: limit })
        .catch((cause: { code?: string }) => {
          if (cause?.code === 'NotFoundError') return []
          throw cause
        })
      return log.map((entry) => ({
        id: entry.oid,
        time: entry.commit.committer.timestamp * 1000,
        ...decodeMessage(entry.commit.message),
      }))
    })
  }

  /**
   * The files that are not the same now as in a version: those changed since (`modified`) and those
   * that are gone (`deleted`), sheets and other files alike (the manifest, the bibliography,
   * images). These are what a restore could bring back. `newSince` are the files there now that the
   * version did not have: a restore removes them only when asked to.
   */
  differences(id: string): Promise<{ files: VersionFile[]; newSince: string[] }> {
    return this.serial(async () => {
      await this.init()
      const inVersion = new Map<string, string>()
      await git.walk({
        ...this.base(),
        trees: [git.TREE({ ref: id })],
        map: async (filepath, [entry]) => {
          if (filepath !== '.' && (await entry?.type()) === 'blob')
            inVersion.set(filepath, (await entry!.oid())!)
          return undefined
        },
      })
      const now = new Map<string, string>()
      for (const path of await this.projectFiles()) {
        const bytes = await readFile(join(this.root, ...path.split('/'))).catch(() => null)
        if (bytes !== null) now.set(path, (await git.hashBlob({ object: bytes })).oid)
      }
      const files: VersionFile[] = []
      for (const [path, oid] of inVersion) {
        const current = now.get(path)
        if (current === oid) continue
        const bytes = await this.bytes(id, path)
        files.push({
          path,
          sheet: sheetOfPath(path),
          change: current === undefined ? 'deleted' : 'modified',
          title:
            sheetOfPath(path) !== null ? sheetTitle(decoder.decode(bytes ?? new Uint8Array())) : '',
          binary: bytes !== null && isBinary(bytes),
        })
      }
      files.sort((a, b) => a.path.localeCompare(b.path))
      return { files, newSince: [...now.keys()].filter((path) => !inVersion.has(path)).sort() }
    })
  }

  /** What a file was like in a version, as bytes, or null when the version has no such file. */
  readBytes(id: string, path: string): Promise<Uint8Array | null> {
    return this.serial(async () => {
      await this.init()
      return this.bytes(id, path)
    })
  }

  /** The text of a file as it was in a version, or null when the version has no such file. */
  read(id: string, path: string): Promise<string | null> {
    return this.serial(async () => {
      await this.init()
      return this.blob(id, path)
    })
  }

  private async bytes(id: string, path: string): Promise<Uint8Array | null> {
    try {
      return (await git.readBlob({ ...this.base(), oid: id, filepath: path })).blob
    } catch (cause) {
      if ((cause as { code?: string })?.code === 'NotFoundError') return null
      throw cause
    }
  }

  private async blob(id: string, path: string): Promise<string | null> {
    const bytes = await this.bytes(id, path)
    return bytes === null ? null : decoder.decode(bytes)
  }
}
