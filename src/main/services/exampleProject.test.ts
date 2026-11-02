import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashFolder, prepareExample } from './exampleProject'

let base: string
let examplesDir: string
let copiesDir: string
const trashed: string[] = []
const trashItem = vi.fn(async (path: string) => {
  trashed.push(path)
  // What the system does: the folder is gone from where it was.
  await rm(path, { recursive: true, force: true })
})
const deps = () => ({ examplesDir, copiesDir, trashItem })

async function writeExample(files: Record<string, string>): Promise<void> {
  await rm(join(examplesDir, 'de'), { recursive: true, force: true })
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(examplesDir, 'de', path, '..'), { recursive: true })
    await writeFile(join(examplesDir, 'de', path), text)
  }
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'wm-example-'))
  examplesDir = join(base, 'examples')
  copiesDir = join(base, 'data', 'examples')
  trashed.length = 0
  trashItem.mockClear()
  await writeExample({
    'project.toml': '[project]\nversion = 1\ntitle = "Beispiel"\n',
    'content/a/eins.typ': 'Eins.',
  })
})
afterEach(() => rm(base, { recursive: true, force: true }))

const copyPath = () => join(copiesDir, 'de')
const original = () => hashFolder(join(examplesDir, 'de'))

describe('the example project', () => {
  it('is copied the first time, and the copy is opened', async () => {
    const outcome = await prepareExample(deps(), 'de')
    expect(outcome).toEqual({ status: 'ready', path: copyPath() })
    expect(await readFile(join(copyPath(), 'content/a/eins.typ'), 'utf8')).toBe('Eins.')
  })

  it('is opened as it is when the writer has not changed it, and what the app writes by itself is no change', async () => {
    await prepareExample(deps(), 'de')
    // The app's own files in an opened project: its versions and the export's files.
    await mkdir(join(copyPath(), '.ezetta', 'history.git'), { recursive: true })
    await writeFile(join(copyPath(), '.ezetta', 'history.git', 'HEAD'), 'ref')
    await mkdir(join(copyPath(), '_build'), { recursive: true })
    await writeFile(join(copyPath(), '_build', 'out.pdf'), 'pdf')
    expect(await prepareExample(deps(), 'de')).toEqual({ status: 'ready', path: copyPath() })
    expect(trashed).toEqual([])
  })

  it('never lets what is tried out reach the original', async () => {
    const before = await original()
    await prepareExample(deps(), 'de')
    await writeFile(join(copyPath(), 'content/a/eins.typ'), 'Verändert.')
    await writeFile(join(copyPath(), 'content/a/neu.typ'), 'Neu.')
    await rm(join(copyPath(), 'project.toml'))
    expect(await original()).toBe(before)
    expect(await readFile(join(examplesDir, 'de', 'content/a/eins.typ'), 'utf8')).toBe('Eins.')
  })

  it('asks when the writer changed the copy, and goes on with it, or starts over', async () => {
    await prepareExample(deps(), 'de')
    await writeFile(join(copyPath(), 'content/a/eins.typ'), 'Mein Text.')
    expect(await prepareExample(deps(), 'de')).toEqual({ status: 'modified', path: copyPath() })
    expect(trashed).toEqual([])

    expect(await prepareExample(deps(), 'de', 'continue')).toEqual({
      status: 'ready',
      path: copyPath(),
    })
    expect(await readFile(join(copyPath(), 'content/a/eins.typ'), 'utf8')).toBe('Mein Text.')

    expect(await prepareExample(deps(), 'de', 'fresh')).toEqual({
      status: 'ready',
      path: copyPath(),
    })
    // The changed copy went to the trash, and the new one is the example again.
    expect(trashed).toEqual([copyPath()])
    expect(await readFile(join(copyPath(), 'content/a/eins.typ'), 'utf8')).toBe('Eins.')
    expect(await prepareExample(deps(), 'de')).toEqual({ status: 'ready', path: copyPath() })
  })

  it('counts a file the writer added or took away as a change', async () => {
    await prepareExample(deps(), 'de')
    await writeFile(join(copyPath(), 'dictionary.txt'), 'Wort')
    expect((await prepareExample(deps(), 'de')).status).toBe('modified')
    await rm(join(copyPath(), 'dictionary.txt'))
    expect((await prepareExample(deps(), 'de')).status).toBe('ready')
    await rm(join(copyPath(), 'content'), { recursive: true })
    expect((await prepareExample(deps(), 'de')).status).toBe('modified')
  })

  it('is made again from a newer example when the writer changed nothing', async () => {
    await prepareExample(deps(), 'de')
    await writeExample({
      'project.toml': '[project]\nversion = 1\ntitle = "Beispiel"\n',
      'content/a/eins.typ': 'Eins, besser.',
      'content/a/zwei.typ': 'Zwei.',
    })
    expect(await prepareExample(deps(), 'de')).toEqual({ status: 'ready', path: copyPath() })
    expect(trashed).toEqual([copyPath()])
    expect(await readdir(join(copyPath(), 'content/a'))).toEqual(['eins.typ', 'zwei.typ'])
  })

  it('asks, and does not replace the copy, when the writer changed it and a newer example came', async () => {
    await prepareExample(deps(), 'de')
    await writeFile(join(copyPath(), 'content/a/eins.typ'), 'Mein Text.')
    await writeExample({
      'project.toml': '[project]\nversion = 1\ntitle = "Beispiel 2"\n',
      'content/a/eins.typ': 'Neu.',
    })
    expect((await prepareExample(deps(), 'de')).status).toBe('modified')
    expect(await readFile(join(copyPath(), 'content/a/eins.typ'), 'utf8')).toBe('Mein Text.')
  })

  it('treats a copy without its state as changed, and keeps the languages apart', async () => {
    await prepareExample(deps(), 'de')
    await rm(join(copiesDir, 'de.json'))
    expect((await prepareExample(deps(), 'de')).status).toBe('modified')
    await expect(prepareExample(deps(), 'en')).rejects.toThrow('missing')
  })
})
