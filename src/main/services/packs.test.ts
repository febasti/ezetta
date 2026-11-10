import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectHistory } from './history'
import { PACK_MAX_OBJECT, mergePacks, packLoose } from './packs'

let root: string
let gitdir: string
let clock: number
const write = async (path: string, content: string | Buffer): Promise<void> => {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}
const history = (options: { packAfter?: number; mergeAfter?: number } = {}) =>
  new ProjectHistory(root, { now: () => (clock += 60_000), ...options })

/** The loose objects of the store. */
const loose = async (): Promise<string[]> => {
  const out: string[] = []
  const objects = join(gitdir, 'objects')
  for (const dir of await readdir(objects))
    if (/^[0-9a-f]{2}$/.test(dir))
      for (const f of await readdir(join(objects, dir))) out.push(dir + f)
  return out
}
const packs = async (): Promise<string[]> =>
  (await readdir(join(gitdir, 'objects', 'pack')).catch(() => [] as string[])).filter((f) =>
    f.endsWith('.idx'),
  )

/** Git's own check of the store, where git is installed (it is on CI and on the maintainer's machine). */
const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const fsck = (): void => {
  if (hasGit) execFileSync('git', ['--git-dir', gitdir, 'fsck', '--strict', '--no-progress'])
}

/** Takes `n` versions, each with a changed sheet. */
const versions = async (h: ProjectHistory, n: number, from = 0): Promise<string[]> => {
  const ids: string[] = []
  for (let i = from; i < from + n; i += 1) {
    await write(`content/a/s${i % 3}.typ`, `= Blatt\n\nFassung ${i}.\n`)
    ids.push((await h.snapshot('auto'))!.id)
  }
  return ids
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ezetta-packs-'))
  gitdir = join(root, '.ezetta', 'history.git')
  clock = Date.UTC(2026, 10, 10, 9, 0, 0)
  await write('project.toml', '[project]\nversion = 1\n')
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('packing the version store', () => {
  it('moves loose objects into a pack that git and the versions read', async () => {
    const h = history({ packAfter: 1_000_000 })
    const ids = await versions(h, 6)
    const before = (await loose()).length
    expect(before).toBeGreaterThan(20)
    expect(await packLoose(gitdir, 1)).toBe(true)
    expect(await loose()).toEqual([])
    expect(await packs()).toHaveLength(1)
    fsck()
    const reread = history()
    expect((await reread.list()).map((v) => v.id)).toEqual([...ids].reverse())
    expect(await reread.read(ids[0]!, 'content/a/s0.typ')).toBe('= Blatt\n\nFassung 0.\n')
    expect(await reread.read(ids[4]!, 'content/a/s1.typ')).toBe('= Blatt\n\nFassung 4.\n')
  })

  it('does nothing below the threshold', async () => {
    await versions(history({ packAfter: 1_000_000 }), 2)
    expect(await packLoose(gitdir, 1000)).toBe(false)
    expect(await packs()).toEqual([])
  })

  it('leaves large objects loose', async () => {
    const h = history({ packAfter: 1_000_000 })
    const photo = randomBytes(PACK_MAX_OBJECT + 10_000)
    await write('assets/foto.jpg', photo)
    const id = (await versions(h, 2))[0]!
    await packLoose(gitdir, 1)
    expect(await loose()).toHaveLength(1)
    fsck()
    expect(Buffer.from((await history().readBytes(id, 'assets/foto.jpg'))!).equals(photo)).toBe(
      true,
    )
  })

  it('merges packs into one, each object once', async () => {
    const h = history({ packAfter: 1_000_000 })
    const ids = await versions(h, 3)
    await packLoose(gitdir, 1)
    ids.push(...(await versions(h, 3, 3)))
    await packLoose(gitdir, 1)
    expect(await packs()).toHaveLength(2)
    expect(await mergePacks(gitdir, 2)).toBe(false)
    expect(await mergePacks(gitdir, 1)).toBe(true)
    expect(await packs()).toHaveLength(1)
    expect(await loose()).toEqual([])
    fsck()
    const reread = history()
    expect(await reread.list()).toHaveLength(6)
    for (const [i, id] of ids.entries())
      expect(await reread.read(id, `content/a/s${i % 3}.typ`)).toBe(`= Blatt\n\nFassung ${i}.\n`)
  })

  it.skipIf(!hasGit)('leaves a pack with deltas alone', async () => {
    const h = history({ packAfter: 1_000_000 })
    await versions(h, 4)
    execFileSync('git', ['--git-dir', gitdir, 'repack', '-a', '-d', '-q'])
    const theirs = await packs()
    await versions(h, 3, 4)
    await packLoose(gitdir, 1)
    expect(await mergePacks(gitdir, 1)).toBe(false)
    expect(await packs()).toEqual(expect.arrayContaining(theirs))
    fsck()
  })

  it('packs as versions are taken, and writes only what changed after that', async () => {
    const h = history({ packAfter: 10, mergeAfter: 2 })
    await write('content/b/fest.typ', 'Bleibt.\n')
    await versions(h, 12)
    expect((await packs()).length).toBeGreaterThan(0)
    expect((await packs()).length).toBeLessThanOrEqual(2)
    fsck()
    await packLoose(gitdir, 1) // nothing loose before the next version
    await write('content/a/s0.typ', 'Neu.\n')
    await h.snapshot('auto')
    // The sheet, the trees of `content/a`, `content` and the top, and the version: not `content/b`.
    expect(await loose()).toHaveLength(5)
    expect(await history().read((await h.list())[0]!.id, 'content/b/fest.typ')).toBe('Bleibt.\n')
  })

  it('removes nothing while the store is held', async () => {
    const h = history({ packAfter: 1 })
    await versions(h, 1)
    await packLoose(gitdir, 1)
    await h.hold(async () => {
      await versions(h, 3, 1)
      expect((await loose()).length).toBeGreaterThan(0)
    })
    await versions(h, 1, 4)
    expect(await loose()).toEqual([])
  })

  it('lists every version, not only the newest 200', { timeout: 30_000 }, async () => {
    const h = history({ packAfter: 64 })
    await versions(h, 205)
    expect(await h.list()).toHaveLength(205)
    expect(await h.list(10)).toHaveLength(10)
    fsck()
  })
})
