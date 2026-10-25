import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupFileName } from '@core/history/backup'
import { ProjectBackup } from './backup'
import type { BackupConfig } from './settings'

let base: string
let root: string
let folder: string
let config: BackupConfig | null
let clock: number
const trashed: string[] = []

const write = async (path: string, content: string): Promise<void> => {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}
const backup = () =>
  new ProjectBackup({
    root,
    title: () => 'Dissertation',
    config: () => config,
    save: async (c) => void (config = c),
    trash: async (p) => {
      trashed.push(p)
      await rm(p)
    },
    now: () => clock,
  })

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'wm-backup-'))
  root = join(base, 'Dissertation')
  folder = join(base, 'Sicherung')
  await mkdir(folder, { recursive: true })
  await write('project.toml', '[project]\nversion = 1\n')
  await write('content/a/eins.typ', '= Eins\n')
  await write('_build/out.pdf', 'pdf')
  await write('.ezetta/history.git/HEAD', 'ref: refs/heads/main\n')
  config = { folder, lastAt: null, lastFingerprint: null, lastFile: null }
  clock = new Date(2026, 9, 12, 14, 30).getTime()
  trashed.length = 0
})
afterEach(() => rm(base, { recursive: true, force: true }))

describe('ProjectBackup', () => {
  it('makes a zip named with the title and the time, and remembers it', async () => {
    const result = await backup().run()
    expect(result).toEqual({ status: 'done', file: 'Dissertation 2026-10-12 14.30.zip' })
    expect(await readdir(folder)).toEqual(['Dissertation 2026-10-12 14.30.zip'])
    expect(config).toMatchObject({ lastAt: clock, lastFile: 'Dissertation 2026-10-12 14.30.zip' })
    expect(config!.lastFingerprint).toMatch(/^[0-9a-f]{40}$/)
  })

  it('makes nothing while the project is unchanged, unless asked to', async () => {
    const b = backup()
    await b.run()
    clock += 3_600_000
    expect(await b.run()).toEqual({ status: 'unchanged' })
    expect(await b.run({ force: true })).toMatchObject({ status: 'done' })
    expect(await readdir(folder)).toHaveLength(2)
  })

  it('makes another when a file changes', async () => {
    const b = backup()
    await b.run()
    clock += 3_600_000
    await write('content/a/eins.typ', '= Eins\n\nMehr.\n')
    const later = new Date(Date.now() + 5000)
    await utimes(join(root, 'content/a/eins.typ'), later, later)
    expect(await b.run()).toMatchObject({ status: 'done' })
  })

  it('says so when there is no folder or it is not reachable', async () => {
    config = null
    expect(await backup().run()).toEqual({ status: 'no_folder' })
    config = { folder: join(base, 'nicht-da'), lastAt: null, lastFingerprint: null, lastFile: null }
    expect(await backup().run()).toEqual({ status: 'unreachable' })
    expect(await readdir(base)).not.toContain('nicht-da')
  })

  it('refuses a folder inside the project, and one that does not exist', async () => {
    const b = backup()
    expect(await b.folderProblem(join(root, 'content'))).toBe('inside')
    expect(await b.folderProblem(root)).toBe('inside')
    expect(await b.folderProblem(join(base, 'nein'))).toBe('missing')
    expect(await b.folderProblem(folder)).toBeNull()
  })

  it('leaves no temporary file behind when it fails', async () => {
    const b = backup()
    const signal = AbortSignal.abort()
    await expect(b.run({ force: true, signal })).rejects.toBeDefined()
    expect(await readdir(folder)).toEqual([])
  })

  it('lists its own backups newest first, and nothing else', async () => {
    const b = backup()
    await b.run()
    clock += 3_600_000
    await b.run({ force: true })
    await writeFile(join(folder, 'Andere 2026-10-12 14.30.zip'), 'x')
    await writeFile(join(folder, 'notizen.txt'), 'x')
    const list = await b.list()
    expect(list.map((f) => f.name)).toEqual([
      'Dissertation 2026-10-12 15.30.zip',
      'Dissertation 2026-10-12 14.30.zip',
    ])
    expect(list[0]!.size).toBeGreaterThan(0)
  })

  it('thins out old backups to the trash, and touches only its own files', async () => {
    // Fifteen backups on one day: the newest ten stay, and the newest of the day is among them.
    for (let i = 0; i < 15; i += 1)
      await writeFile(
        join(folder, backupFileName('Dissertation', new Date(2026, 9, 12, 6, i * 2).getTime())),
        'x',
      )
    await writeFile(join(folder, 'Andere 2026-10-12 06.00.zip'), 'x')
    await writeFile(join(folder, 'foto.jpg'), 'x')
    await backup().run({ force: true })
    expect(trashed).toHaveLength(6) // 15 old + 1 new = 16, ten kept
    const left = await readdir(folder)
    expect(left).toContain('Andere 2026-10-12 06.00.zip')
    expect(left).toContain('foto.jpg')
    expect(left.filter((n) => n.startsWith('Dissertation '))).toHaveLength(10)
  })
})
