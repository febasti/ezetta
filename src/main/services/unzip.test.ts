import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commonTopFolder, extractZip, listZip, safeEntryPath } from './unzip'
import { writeZip } from './zip'

const run = promisify(execFile)
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wm-unzip-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const make = async (name: string, content: string | Buffer): Promise<string> => {
  const path = join(dir, 'src', name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  return path
}

describe('safeEntryPath', () => {
  it('keeps ordinary relative names and refuses anything that could leave the folder', () => {
    expect(safeEntryPath('Projekt/content/a.typ')).toBe('Projekt/content/a.typ')
    expect(safeEntryPath('Projekt/')).toBe('Projekt/')
    for (const bad of ['', '/etc/passwd', '../x', 'a/../../x', 'C:/x', 'a\\b', 'a/./b', 'a\u0000b'])
      expect(safeEntryPath(bad)).toBeNull()
  })
})

describe('extractZip', () => {
  it('unpacks what writeZip wrote: names, contents, empty files, a large file', async () => {
    const big = Buffer.alloc(400_000, 'xyz')
    const zip = join(dir, 'a.zip')
    await writeZip(zip, [
      { name: 'P/project.toml', path: await make('1', '[project]\n'), mtime: Date.now() },
      { name: 'P/content/ä ö.typ', path: await make('2', '= Überschrift\n'), mtime: 0 },
      { name: 'P/leer.txt', path: await make('3', ''), mtime: 0 },
      { name: 'P/assets/gross.bin', path: await make('4', big), mtime: 0 },
    ])
    const out = join(dir, 'out')
    expect(await extractZip(zip, out)).toMatchObject({ files: 4 })
    expect(await readFile(join(out, 'P/project.toml'), 'utf8')).toBe('[project]\n')
    expect(await readFile(join(out, 'P/content/ä ö.typ'), 'utf8')).toBe('= Überschrift\n')
    expect((await readFile(join(out, 'P/leer.txt'))).length).toBe(0)
    expect((await readFile(join(out, 'P/assets/gross.bin'))).equals(big)).toBe(true)
    expect(commonTopFolder(await listZip(zip))).toBe('P')
  })

  it.skipIf(!existsSync('/usr/bin/zip'))('unpacks an archive made by the zip program', async () => {
    await make('proj/a.typ', '= A\n')
    await make('proj/sub/b.txt', 'bbb')
    await run('/usr/bin/zip', ['-qr', join(dir, 'sys.zip'), 'proj'], { cwd: join(dir, 'src') })
    const out = join(dir, 'out')
    await extractZip(join(dir, 'sys.zip'), out)
    expect(await readFile(join(out, 'proj/a.typ'), 'utf8')).toBe('= A\n')
    expect(await readFile(join(out, 'proj/sub/b.txt'), 'utf8')).toBe('bbb')
  })

  it('refuses names that lead out of the folder, and writes nothing outside', async () => {
    const zip = join(dir, 'evil.zip')
    await writeZip(zip, [{ name: '../evil.txt', path: await make('e', 'x'), mtime: 0 }])
    const out = join(dir, 'out')
    await mkdir(out)
    await expect(extractZip(zip, out)).rejects.toThrow(/unsafe/)
    expect(await readdir(dir)).not.toContain('evil.txt')
    const abs = join(dir, 'abs.zip')
    await writeZip(abs, [{ name: '/tmp/wm-evil.txt', path: await make('f', 'x'), mtime: 0 }])
    await expect(extractZip(abs, out)).rejects.toThrow(/unsafe/)
  })

  it('notices damage: a changed byte, a truncated file, and something that is no zip', async () => {
    const zip = join(dir, 'a.zip')
    await writeZip(zip, [
      { name: 'P/a.txt', path: await make('a', 'Hallo Welt, das ist ein Test.'), mtime: 0 },
    ])
    const bytes = await readFile(zip)
    // A flipped byte in the data (the data starts behind the 30-byte header and the name).
    const damaged = Buffer.from(bytes)
    damaged[30 + 'P/a.txt'.length + 3]! ^= 0xff
    await writeFile(join(dir, 'damaged.zip'), damaged)
    await expect(extractZip(join(dir, 'damaged.zip'), join(dir, 'o1'))).rejects.toBeDefined()
    await writeFile(join(dir, 'cut.zip'), bytes.subarray(0, bytes.length - 30))
    await expect(extractZip(join(dir, 'cut.zip'), join(dir, 'o2'))).rejects.toThrow()
    await writeFile(join(dir, 'text.zip'), 'das ist kein zip')
    await expect(listZip(join(dir, 'text.zip'))).rejects.toThrow(/Not a zip/)
  })

  it('finds the one folder that holds everything, and says when there is none', async () => {
    const a = await make('x', 'x')
    const one = join(dir, 'one.zip')
    await writeZip(one, [
      { name: 'P/a', path: a, mtime: 0 },
      { name: 'P/b/c', path: a, mtime: 0 },
    ])
    expect(commonTopFolder(await listZip(one))).toBe('P')
    const two = join(dir, 'two.zip')
    await writeZip(two, [
      { name: 'P/a', path: a, mtime: 0 },
      { name: 'Q/b', path: a, mtime: 0 },
    ])
    expect(commonTopFolder(await listZip(two))).toBeNull()
    const top = join(dir, 'top.zip')
    await writeZip(top, [{ name: 'a.txt', path: a, mtime: 0 }])
    expect(commonTopFolder(await listZip(top))).toBeNull()
  })
})
