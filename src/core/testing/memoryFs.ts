import type { DirEntry, FileSystem } from '../ports'

/** In-memory FileSystem for tests. Paths are project-relative, as in the real port. */
export class MemoryFs implements FileSystem {
  readonly files = new Map<string, string>()
  readonly dirs = new Set<string>([''])
  readonly trashed: string[] = []
  /** Binary files (images), by path. */
  readonly bytes = new Map<string, Uint8Array>()
  /** When set, the next write to a path matching this predicate throws, to test failure handling. */
  failWrite: ((path: string) => boolean) | null = null
  writes = 0

  constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) this.put(path, content)
  }

  put(path: string, content: string): void {
    this.mkdirSync(path.split('/').slice(0, -1).join('/'))
    this.files.set(path, content)
  }

  private mkdirSync(path: string): void {
    const parts = path === '' ? [] : path.split('/')
    for (let i = 1; i <= parts.length; i += 1) this.dirs.add(parts.slice(0, i).join('/'))
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }

  async readExternalText(absPath: string): Promise<string> {
    const content = this.files.get(absPath)
    if (content === undefined) throw new Error(`ENOENT: ${absPath}`)
    return content
  }

  async writeFileAtomic(path: string, content: string): Promise<void> {
    if (this.failWrite?.(path)) throw new Error(`EIO: ${path}`)
    this.writes += 1
    this.put(path, content)
  }

  async writeBytesAtomic(path: string, content: Uint8Array): Promise<void> {
    if (this.failWrite?.(path)) throw new Error(`EIO: ${path}`)
    this.mkdirSync(path.split('/').slice(0, -1).join('/'))
    this.bytes.set(path, content)
  }

  async readDir(path: string): Promise<DirEntry[]> {
    if (!this.dirs.has(path)) throw new Error(`ENOENT: ${path}`)
    const prefix = path === '' ? '' : `${path}/`
    const out: DirEntry[] = []
    for (const file of [...this.files.keys(), ...this.bytes.keys()]) {
      if (file.startsWith(prefix) && !file.slice(prefix.length).includes('/'))
        out.push({ name: file.slice(prefix.length), kind: 'file' })
    }
    for (const dir of this.dirs) {
      if (dir !== '' && dir.startsWith(prefix) && !dir.slice(prefix.length).includes('/'))
        out.push({ name: dir.slice(prefix.length), kind: 'dir' })
    }
    return out.filter((e) => !e.name.startsWith('.'))
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.bytes.has(path) || this.dirs.has(path)
  }

  async mkdir(path: string): Promise<void> {
    this.mkdirSync(path)
  }

  async rename(from: string, to: string): Promise<void> {
    if (await this.exists(to)) throw new Error(`EEXIST: ${to}`)
    if (this.files.has(from)) {
      this.put(to, this.files.get(from)!)
      this.files.delete(from)
      return
    }
    if (!this.dirs.has(from)) throw new Error(`ENOENT: ${from}`)
    const moved = (p: string): string => (p === from ? to : `${to}${p.slice(from.length)}`)
    for (const [file, content] of [...this.files]) {
      if (file.startsWith(`${from}/`)) {
        this.files.delete(file)
        this.put(moved(file), content)
      }
    }
    for (const dir of [...this.dirs]) {
      if (dir === from || dir.startsWith(`${from}/`)) {
        this.dirs.delete(dir)
        this.mkdirSync(moved(dir))
      }
    }
  }

  async trash(path: string): Promise<void> {
    if (!(await this.exists(path))) throw new Error(`ENOENT: ${path}`)
    this.trashed.push(path)
    this.files.delete(path)
    for (const file of [...this.files.keys()])
      if (file.startsWith(`${path}/`)) this.files.delete(file)
    for (const dir of [...this.dirs])
      if (dir === path || dir.startsWith(`${path}/`)) this.dirs.delete(dir)
  }
}
