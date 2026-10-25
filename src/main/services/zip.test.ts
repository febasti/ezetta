import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isCompressedAlready, writeZip } from './zip'

const run = promisify(execFile)
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wm-zip-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const make = async (name: string, content: string | Buffer): Promise<string> => {
  const path = join(dir, 'src', name)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  return path
}

/** A small reader of the central directory, so the test does not trust the writer's own idea of the format. */
async function readZip(path: string): Promise<Map<string, Buffer>> {
  const data = await readFile(path)
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = data.readUInt16LE(end + 10)
  let at = data.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()
  for (let i = 0; i < count; i += 1) {
    expect(data.readUInt32LE(at)).toBe(0x02014b50)
    const crc = data.readUInt32LE(at + 16)
    const packed = data.readUInt32LE(at + 20)
    const size = data.readUInt32LE(at + 24)
    const nameLength = data.readUInt16LE(at + 28)
    const extra = data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32)
    const local = data.readUInt32LE(at + 42)
    const name = data.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28)
    const content = zlib.inflateRawSync(data.subarray(start, start + packed))
    expect(content.length).toBe(size)
    expect(zlib.crc32(content)).toBe(crc)
    files.set(name, content)
    at += 46 + nameLength + extra
  }
  return files
}

describe('writeZip', () => {
  it('writes files with their names, contents and checksums', async () => {
    const big = Buffer.alloc(300_000, 'abc')
    const entries = [
      {
        name: 'Projekt/project.toml',
        path: await make('a.toml', '[project]\n'),
        mtime: Date.now(),
      },
      { name: 'Projekt/content/ä ö ü.typ', path: await make('b.typ', '= Überschrift\n'), mtime: 0 },
      { name: 'Projekt/leer.txt', path: await make('c.txt', ''), mtime: Date.now() },
      { name: 'Projekt/assets/gross.bin', path: await make('d.bin', big), mtime: Date.now() },
    ]
    const zip = join(dir, 'out.zip')
    const result = await writeZip(zip, entries)
    expect(result.files).toBe(4)
    const read = await readZip(zip)
    expect([...read.keys()]).toEqual(entries.map((e) => e.name))
    expect(read.get('Projekt/project.toml')!.toString()).toBe('[project]\n')
    expect(read.get('Projekt/content/ä ö ü.typ')!.toString()).toBe('= Überschrift\n')
    expect(read.get('Projekt/leer.txt')!.length).toBe(0)
    expect(read.get('Projekt/assets/gross.bin')!.equals(big)).toBe(true)
  })

  it.skipIf(!existsSync('/usr/bin/unzip'))('is read by the unzip program', async () => {
    const path = await make('x.typ', '= Text\n')
    const zip = join(dir, 'out.zip')
    await writeZip(zip, [{ name: 'P/x.typ', path, mtime: Date.now() }])
    const { stdout } = await run('/usr/bin/unzip', ['-t', zip])
    expect(stdout).toContain('No errors detected')
    const target = join(dir, 'unpacked')
    await run('/usr/bin/unzip', ['-q', zip, '-d', target])
    expect(await readFile(join(target, 'P', 'x.typ'), 'utf8')).toBe('= Text\n')
  })

  it('writes an empty archive that is still a zip file', async () => {
    const zip = join(dir, 'empty.zip')
    await writeZip(zip, [])
    expect((await stat(zip)).size).toBe(22)
    expect((await readZip(zip)).size).toBe(0)
  })

  it('stops when asked, and when a file cannot be read', async () => {
    const path = await make('x.txt', 'x')
    const controller = new AbortController()
    controller.abort()
    await expect(
      writeZip(join(dir, 'a.zip'), [{ name: 'x', path, mtime: 0 }], controller.signal),
    ).rejects.toBeDefined()
    await expect(
      writeZip(join(dir, 'b.zip'), [{ name: 'x', path: join(dir, 'gibt-es-nicht'), mtime: 0 }]),
    ).rejects.toBeDefined()
  })

  it('stores a file without compressing it, with its checksum in the header, and reads it back', async () => {
    const noise = Buffer.from(Array.from({ length: 50_000 }, (_, i) => (i * 7919) % 251))
    const entries = [
      { name: 'P/foto.jpg', path: await make('f.jpg', noise), mtime: 0, store: true },
      { name: 'P/text.typ', path: await make('t.typ', '= Text\n'.repeat(500)), mtime: 0 },
      { name: 'P/leer.png', path: await make('l.png', ''), mtime: 0, store: true },
    ]
    const zip = join(dir, 'stored.zip')
    await writeZip(zip, entries)
    const data = await readFile(zip)
    // The stored file takes as many bytes as it has, the text takes far fewer.
    expect(data.length).toBeGreaterThan(50_000)
    expect(data.length).toBeLessThan(50_000 + 3000)
    const { extractZip, listZip } = await import('./unzip')
    expect((await listZip(zip)).map((e) => [e.name, e.method])).toEqual([
      ['P/foto.jpg', 0],
      ['P/text.typ', 8],
      ['P/leer.png', 0],
    ])
    const out = join(dir, 'out')
    await extractZip(zip, out)
    expect((await readFile(join(out, 'P/foto.jpg'))).equals(noise)).toBe(true)
    expect((await readFile(join(out, 'P/leer.png'))).length).toBe(0)
  })

  it.skipIf(!existsSync('/usr/bin/unzip'))(
    'an archive with stored files passes the unzip program',
    async () => {
      const zip = join(dir, 'mixed.zip')
      await writeZip(zip, [
        {
          name: 'P/a.png',
          path: await make('a.png', Buffer.alloc(5000, 7)),
          mtime: Date.now(),
          store: true,
        },
        { name: 'P/b.txt', path: await make('b.txt', 'hallo'), mtime: Date.now() },
      ])
      const { stdout } = await run('/usr/bin/unzip', ['-t', zip])
      expect(stdout).toContain('No errors detected')
    },
  )

  it('knows which files are compressed already', () => {
    for (const name of ['a/b.PNG', 'x.jpeg', 'doc.pdf', 'P/.ezetta/history.git/objects/ab/cdef'])
      expect(isCompressedAlready(name)).toBe(true)
    for (const name of ['a.typ', 'library.bib', 'project.toml', 'P/.ezetta/history.git/HEAD'])
      expect(isCompressedAlready(name)).toBe(false)
  })
})
