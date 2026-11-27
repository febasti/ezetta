import { chmod, mkdir, mkdtemp, readdir, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import git from 'isomorphic-git'
import { ProjectHistory } from './history'

let root: string
let clock: number
const write = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}
const history = () => new ProjectHistory(root, { now: () => (clock += 60_000) })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'wm-history-'))
  clock = Date.UTC(2026, 9, 12, 10, 0, 0)
  await write('project.toml', '[project]\nversion = 1\n')
  await write('content/a/eins.typ', '= Eins\n\nText.\n')
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('ProjectHistory', () => {
  it('takes a first version of the project, and none while nothing changes', async () => {
    const h = history()
    const first = await h.snapshot('auto')
    expect(first).toMatchObject({ kind: 'auto', name: null })
    expect(await h.snapshot('auto')).toBeNull()
    expect(await h.list()).toHaveLength(1)
  })

  it('keeps a named version even when nothing changed, and not a named one in an empty project', async () => {
    const h = history()
    await h.snapshot('auto')
    expect(await h.snapshot('named', 'Gleicher Stand')).toMatchObject({ kind: 'named' })
    expect((await h.list()).map((v) => v.kind)).toEqual(['named', 'auto'])
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    expect(await history().snapshot('named', 'Leer')).toBeNull()
  })

  it('sees a change that keeps the size of the file, even right after the last version', async () => {
    const h = history()
    await write('content/a/eins.typ', '= Alt\n\nAlter Text.\n')
    const first = await h.snapshot('auto')
    // Same size, same second: the stat cache of git would call the file unchanged.
    await write('content/a/eins.typ', '= Neu\n\nNeuer Text.\n')
    const second = await h.snapshot('auto')
    expect(second).not.toBeNull()
    expect(await h.read(first!.id, 'content/a/eins.typ')).toBe('= Alt\n\nAlter Text.\n')
    expect(await h.read(second!.id, 'content/a/eins.typ')).toBe('= Neu\n\nNeuer Text.\n')
  })

  it('keeps its store in a hidden folder and leaves the project folder alone', async () => {
    await history().snapshot('auto')
    expect((await readdir(root)).sort()).toEqual(['.ezetta', 'content', 'project.toml'])
    expect(await readdir(join(root, '.ezetta'))).toEqual(['history.git'])
  })

  it('lists versions newest first, with their kind and name', async () => {
    const h = history()
    await h.snapshot('auto')
    await write('content/a/eins.typ', '= Eins\n\nMehr Text.\n')
    await h.snapshot('named', 'Abgabe an Betreuer')
    await write('content/a/eins.typ', '= Eins\n\nNoch mehr Text.\n')
    await h.snapshot('export')
    const list = await h.list()
    expect(list.map((v) => [v.kind, v.name])).toEqual([
      ['export', null],
      ['named', 'Abgabe an Betreuer'],
      ['auto', null],
    ])
    expect(list[0]!.time).toBeGreaterThan(list[2]!.time)
  })

  it('lists the files that are not the same now as in a version, and those that are new since', async () => {
    const h = history()
    await write('content/a/zwei.typ', '= Zwei\n')
    await write('assets/bild.png', 'PNG\u0000\u0001')
    const first = await h.snapshot('auto')
    // Nothing changed since: nothing differs.
    expect(await h.differences(first!.id)).toEqual({ files: [], newSince: [] })
    await write('content/a/eins.typ', '= Eins\n\nGeändert.\n')
    await rm(join(root, 'content/a/zwei.typ'))
    await write('content/a/drei.typ', '= Drei\n') // new since
    await write('project.toml', '[project]\nversion = 2\n') // not a sheet
    await rm(join(root, 'assets/bild.png'))
    const { files, newSince } = await h.differences(first!.id)
    expect(files).toEqual([
      { path: 'assets/bild.png', sheet: null, change: 'deleted', title: '', binary: true },
      {
        path: 'content/a/eins.typ',
        sheet: 'a/eins.typ',
        change: 'modified',
        title: 'Eins',
        binary: false,
      },
      {
        path: 'content/a/zwei.typ',
        sheet: 'a/zwei.typ',
        change: 'deleted',
        title: 'Zwei',
        binary: false,
      },
      { path: 'project.toml', sheet: null, change: 'modified', title: '', binary: false },
    ])
    expect(newSince).toEqual(['content/a/drei.typ'])
    // A later version has all of it; compared with now it differs in nothing.
    const second = await h.snapshot('auto')
    expect(await h.differences(second!.id)).toEqual({ files: [], newSince: [] })
  })

  it('keeps the files of the material too, and names its sheets by their place in the tree', async () => {
    const h = history()
    await write('material/Recherche/notiz.typ', '= Notiz\n\nAlt.\n')
    const first = await h.snapshot('auto')
    expect(await h.read(first!.id, 'material/Recherche/notiz.typ')).toBe('= Notiz\n\nAlt.\n')
    await write('material/Recherche/notiz.typ', '= Notiz\n\nNeu.\n')
    await rm(join(root, 'content/a/eins.typ'))
    await write('material/Recherche/neu.typ', '= Neu\n')
    const { files, newSince } = await h.differences(first!.id)
    expect(files).toEqual([
      {
        path: 'content/a/eins.typ',
        sheet: 'a/eins.typ',
        change: 'deleted',
        title: 'Eins',
        binary: false,
      },
      {
        path: 'material/Recherche/notiz.typ',
        sheet: ':material/Recherche/notiz.typ',
        change: 'modified',
        title: 'Notiz',
        binary: false,
      },
    ])
    expect(newSince).toEqual(['material/Recherche/neu.typ'])
  })

  it('gives the bytes of a file, an image included, unchanged', async () => {
    const h = history()
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128, 7])
    await mkdir(join(root, 'assets'), { recursive: true })
    await writeFile(join(root, 'assets/bild.png'), bytes)
    const first = await h.snapshot('auto')
    expect(Buffer.from((await h.readBytes(first!.id, 'assets/bild.png'))!).equals(bytes)).toBe(true)
    expect(await h.readBytes(first!.id, 'assets/nein.png')).toBeNull()
  })

  it('reads a file as it was in a version, and null where it was not there', async () => {
    const h = history()
    const first = await h.snapshot('auto')
    await write('content/a/eins.typ', '= Eins\n\nNeu.\n')
    await h.snapshot('auto')
    expect(await h.read(first!.id, 'content/a/eins.typ')).toBe('= Eins\n\nText.\n')
    expect(await h.read(first!.id, 'content/a/gibt-es-nicht.typ')).toBeNull()
  })

  it('leaves out the build folder, hidden files and files that are too large', async () => {
    await write('_build/out.pdf', 'pdf')
    await write('.hidden/x.typ', 'x')
    await write('assets/gross.bin', 'x'.repeat(10))
    const h = history()
    const first = await h.snapshot('auto')
    expect(await h.read(first!.id, 'assets/gross.bin')).toBe('x'.repeat(10))
    expect(await h.read(first!.id, '_build/out.pdf')).toBeNull()
    expect(await h.read(first!.id, '.hidden/x.typ')).toBeNull()
  })

  it('finds its versions again in a new instance (they are on disk)', async () => {
    await history().snapshot('named', 'Stand 1')
    const again = history()
    expect((await again.list()).map((v) => v.name)).toEqual(['Stand 1'])
    expect(await again.snapshot('auto')).toBeNull()
  })

  it('queues calls made at once: one version is taken, the second finds nothing to take', async () => {
    const h = history()
    const [first, second, list] = await Promise.all([
      h.snapshot('auto'),
      h.snapshot('auto'),
      h.list(),
    ])
    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(list).toHaveLength(1)
  })
})

// What a crash of the computer can leave behind: files of the store that are there but empty.
describe('a store that can no longer be read', () => {
  const store = (): string => join(root, '.ezetta', 'history.git')
  const emptyObjects = async (): Promise<void> => {
    const objects = join(store(), 'objects')
    for (const dir of await readdir(objects))
      if (dir.length === 2)
        for (const file of await readdir(join(objects, dir)))
          await truncate(join(objects, dir, file), 0)
  }
  const aside = async (): Promise<string[]> =>
    (await readdir(join(root, '.ezetta'))).filter((name) => name.startsWith('history-damaged-'))

  it('is set aside, never deleted, and the versions go on in a new one', async () => {
    await history().snapshot('named', 'Stand 1')
    await emptyObjects()
    await write('content/a/eins.typ', '= Eins\n\nMehr Text.\n')
    const told: string[] = []
    const h = new ProjectHistory(root, {
      now: () => (clock += 60_000),
      onSetAside: (folder) => told.push(folder),
    })
    const next = await h.snapshot('auto')
    expect(next).not.toBeNull()
    expect(await h.read(next!.id, 'content/a/eins.typ')).toContain('Mehr Text.')
    expect(await h.list()).toHaveLength(1)
    // The old store is beside the new one, whole, under a name that says what it is.
    const kept = await aside()
    expect(kept).toHaveLength(1)
    expect(told).toEqual([join(root, '.ezetta', kept[0]!)])
    expect(await readdir(join(root, '.ezetta', kept[0]!))).toContain('HEAD')
    // And the versions after it are taken as always.
    await write('content/a/eins.typ', '= Eins\n\nNoch mehr.\n')
    expect(await h.snapshot('auto')).not.toBeNull()
    expect(await h.list()).toHaveLength(2)
    expect(await aside()).toHaveLength(1)
  })

  it('is set aside too when HEAD is empty or its objects are gone', async () => {
    await history().snapshot('auto')
    await truncate(join(store(), 'HEAD'), 0)
    await write('content/a/eins.typ', 'zwei\n')
    expect(await history().snapshot('auto')).not.toBeNull()
    expect(await aside()).toHaveLength(1)

    const objects = join(store(), 'objects')
    for (const dir of await readdir(objects))
      if (dir.length === 2) await rm(join(objects, dir), { recursive: true })
    await write('content/a/eins.typ', 'drei\n')
    expect(await history().snapshot('auto')).not.toBeNull()
    expect(await aside()).toHaveLength(2)
  })

  it('a sound store is left alone when a version fails for another reason', async () => {
    // A store that cannot be written to: a test of permissions, which Windows does not have this way.
    if (process.platform === 'win32') return
    const h = history()
    await h.snapshot('auto')
    const objects = join(store(), 'objects')
    const told: string[] = []
    const again = new ProjectHistory(root, {
      now: () => (clock += 60_000),
      onSetAside: (folder) => told.push(folder),
    })
    await write('content/a/eins.typ', 'zwei\n')
    await chmod(objects, 0o555)
    try {
      await expect(again.snapshot('auto')).rejects.toBeDefined()
    } finally {
      await chmod(objects, 0o755)
    }
    expect(told).toEqual([])
    expect(await aside()).toEqual([])
    expect(await again.snapshot('auto')).not.toBeNull()
    expect(await again.list()).toHaveLength(2)
  })

  it('an empty object file is written again, not taken for the object', async () => {
    const h = history()
    await write('content/a/eins.typ', 'eins\n')
    await h.snapshot('auto')
    await write('content/a/eins.typ', 'zwei\n')
    await h.snapshot('auto')
    // The object of the first text is emptied; the newest version does not need it.
    const { oid } = await git.hashBlob({ object: new TextEncoder().encode('eins\n') })
    await truncate(join(store(), 'objects', oid.slice(0, 2), oid.slice(2)), 0)
    // The same text again: its object is needed, and the empty file must not stand in for it.
    await write('content/a/eins.typ', 'eins\n')
    const next = await h.snapshot('auto')
    expect(await history().read(next!.id, 'content/a/eins.typ')).toBe('eins\n')
    expect(await aside()).toEqual([])
  })
})
