import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRootedFs, writeFileAtomic } from './rootedFs'

let base: string
let root: string
let outside: string
const trashItem = vi.fn(async () => undefined)

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'wm-fs-')))
  root = join(base, 'project')
  outside = join(base, 'outside')
  await mkdir(join(root, 'content'), { recursive: true })
  await mkdir(outside)
  await writeFile(join(outside, 'secret.txt'), 'secret')
  trashItem.mockClear()
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('writeFileAtomic', () => {
  it('creates and overwrites files and leaves no temporary files behind', async () => {
    const target = join(root, 'content', 'a.typ')
    await writeFileAtomic(target, 'eins')
    await writeFileAtomic(target, 'zwei äöü')
    expect(await readFile(target, 'utf8')).toBe('zwei äöü')
    expect(await readdir(join(root, 'content'))).toEqual(['a.typ'])
  })

  it('creates missing parent directories', async () => {
    await writeFileAtomic(join(root, '_build', 'main.typ'), 'x')
    expect(await readFile(join(root, '_build', 'main.typ'), 'utf8')).toBe('x')
  })

  it('keeps the old content and cleans up when the write cannot complete', async () => {
    const target = join(root, 'content', 'a.typ')
    await writeFileAtomic(target, 'alt')
    // A directory in the way makes the final rename fail after the temporary file was written.
    await mkdir(join(root, 'content', 'dir.typ'))
    await expect(writeFileAtomic(join(root, 'content', 'dir.typ'), 'neu')).rejects.toThrow()
    expect(await readFile(target, 'utf8')).toBe('alt')
    expect((await readdir(join(root, 'content'))).sort()).toEqual(['a.typ', 'dir.typ'])
  })
})

describe('createRootedFs', () => {
  it('reads, writes, lists, renames, and trashes inside the root', async () => {
    const fs = createRootedFs(root, trashItem)
    await fs.writeFileAtomic('content/g/a.typ', 'Text')
    expect(await fs.readFile('content/g/a.typ')).toBe('Text')
    expect(await fs.readDir('content')).toEqual([{ name: 'g', kind: 'dir' }])
    await fs.rename('content/g/a.typ', 'content/g/b.typ')
    expect(await fs.exists('content/g/a.typ')).toBe(false)
    await fs.trash('content/g/b.typ')
    expect(trashItem).toHaveBeenCalledWith(join(root, 'content', 'g', 'b.typ'))
  })

  it('hides dotfiles and symbolic links from listings', async () => {
    const fs = createRootedFs(root, trashItem)
    await writeFile(join(root, 'content', '.DS_Store'), '')
    await writeFile(join(root, 'content', 'x.typ'), '')
    await symlink(outside, join(root, 'content', 'link'))
    expect(await fs.readDir('content')).toEqual([{ name: 'x.typ', kind: 'file' }])
  })

  it('rejects traversal and absolute paths', async () => {
    const fs = createRootedFs(root, trashItem)
    for (const path of [
      '../outside/secret.txt',
      'content/../../outside/secret.txt',
      '/etc/passwd',
      'a\\..\\b',
    ]) {
      await expect(fs.readFile(path), path).rejects.toThrow()
      await expect(fs.writeFileAtomic(path, 'x'), path).rejects.toThrow()
    }
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret')
  })

  it('rejects a symbolic link that points out of the project', async () => {
    const fs = createRootedFs(root, trashItem)
    await symlink(outside, join(root, 'content', 'link'))
    await expect(fs.readFile('content/link/secret.txt')).rejects.toThrow(/leaves the project/)
    await expect(fs.writeFileAtomic('content/link/new.typ', 'x')).rejects.toThrow(
      /leaves the project/,
    )
    await expect(fs.readDir('content/link')).rejects.toThrow(/leaves the project/)
    expect(await readdir(outside)).toEqual(['secret.txt'])
  })

  it('refuses to rename over an existing different file, but allows a case-only rename', async () => {
    const fs = createRootedFs(root, trashItem)
    await fs.writeFileAtomic('content/a.typ', 'a')
    await fs.writeFileAtomic('content/b.typ', 'b')
    await expect(fs.rename('content/a.typ', 'content/b.typ')).rejects.toThrow(/EEXIST/)
    await fs.rename('content/a.typ', 'content/A.typ')
    expect(await readFile(join(root, 'content', 'A.typ'), 'utf8')).toBe('a')
    expect(await readFile(join(root, 'content', 'b.typ'), 'utf8')).toBe('b')
  })

  it('reads a bibliography file outside the project, and only that kind of file', async () => {
    const fs = createRootedFs(root, trashItem)
    const bib = join(outside, 'library.bib')
    await writeFile(bib, '@book{a, title={T}}')
    expect(await fs.readExternalText(bib)).toBe('@book{a, title={T}}')
    // Not a relative path, not another kind of file, not a missing file, not a folder.
    await expect(fs.readExternalText('library.bib')).rejects.toThrow()
    await expect(fs.readExternalText(join(outside, 'secret.txt'))).rejects.toThrow(
      /Not a bibliography/,
    )
    await expect(fs.readExternalText(join(outside, 'missing.bib'))).rejects.toThrow()
    await mkdir(join(outside, 'folder.bib'))
    await expect(fs.readExternalText(join(outside, 'folder.bib'))).rejects.toThrow()
  })
})
