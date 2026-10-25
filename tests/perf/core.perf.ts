import { mkdtemp, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseTypst } from '@core/typst/parser'
import { scanCitations } from '@core/typst/citations'
import { scanFigures } from '@core/typst/figures'
import { scanTargets } from '@core/typst/targets'
import { analyzeSheet } from '@core/typst/text'
import { ProjectSession } from '@core/project/session'
import { ProjectHistory } from '../../src/main/services/history'
import { ProjectBackup } from '../../src/main/services/backup'
import { createRootedFs } from '../../src/main/services/rootedFs'
import { generateLongSheet, generateThesis } from './fixture'
import type { FixtureInfo } from './fixture'

const rows: { what: string; ms: number; note?: string }[] = []
const time = async <T>(what: string, work: () => Promise<T> | T, note?: string): Promise<T> => {
  const start = performance.now()
  const result = await work()
  rows.push({ what, ms: Math.round((performance.now() - start) * 10) / 10, note })
  return result
}
const heapMb = (): number => Math.round(process.memoryUsage().heapUsed / 1048576)
const rssMb = (): number => Math.round(process.memoryUsage().rss / 1048576)

let base: string
let info: FixtureInfo
let root: string

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'wm-perf-'))
  root = join(base, 'Grosse Arbeit')
  info = await time('generate the project (not measured)', () => generateThesis(root))
})
afterAll(async () => {
  const width = Math.max(...rows.map((r) => r.what.length))
  process.stdout.write(
    '\n' +
      rows
        .map(
          (r) =>
            `${r.what.padEnd(width)}  ${r.ms ? String(r.ms).padStart(9) + ' ms' : ' '.repeat(12)}  ${r.note ?? ''}`,
        )
        .join('\n') +
      '\n',
  )
  await rm(base, { recursive: true, force: true })
})

describe('the core on an 80,000-word project', () => {
  it('opens the project, makes snapshots, and refreshes after a change', async () => {
    const fs = createRootedFs(root, async () => undefined)
    const before = heapMb()
    const opened = await time('ProjectSession.open (160 sheets)', () => ProjectSession.open(fs))
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    const session = opened.value
    const snapshot = await time('session.snapshot()', () => session.snapshot())
    const json = JSON.stringify(snapshot)
    rows.push({
      what: 'snapshot as JSON (what IPC sends)',
      ms: 0,
      note: `${Math.round(json.length / 1024)} KB`,
    })
    await time('JSON.stringify(snapshot)', () => JSON.stringify(snapshot))
    await time('session.refresh() with nothing changed', () => session.refresh(null))
    const sheet = info.sheets[3]!
    await appendFile(join(root, 'content', sheet), '\nNoch ein Absatz.\n')
    await time('session.refresh() after one sheet changed', () =>
      session.refresh([`content/${sheet}`]),
    )
    rows.push({ what: 'heap after open (MB)', ms: 0, note: `${heapMb() - before} MB more` })
  })

  it('parses and scans sheets', async () => {
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(join(root, 'content', info.sheets[0]!), 'utf8')
    await time('parseTypst (one sheet of 500 words)', () => parseTypst(text))
    const tree = parseTypst(text)
    await time('scanCitations (one sheet)', () => scanCitations(tree, text))
    await time('scanFigures (one sheet)', () => scanFigures(tree, text))
    await time('scanTargets (one sheet)', () => scanTargets(tree, text))
    await time('analyzeSheet (one sheet)', () => analyzeSheet(text))
    // The whole project, sheet after sheet, as a full scan does.
    const all = await Promise.all(
      info.sheets.map((s) => readFile(join(root, 'content', s), 'utf8')),
    )
    await time('parse + scan all 160 sheets', () => {
      for (const t of all) {
        const p = parseTypst(t)
        scanCitations(p, t)
        scanFigures(p, t)
        scanTargets(p, t)
        analyzeSheet(t)
      }
    })
    const long = all.join('\n\n')
    await time(
      `parseTypst of the whole project as one text (${Math.round(long.length / 1024)} KB)`,
      () => parseTypst(long),
    )
  })

  it('versions: first, unchanged, one file changed, listing, differences', async () => {
    const history = new ProjectHistory(root)
    await time('history.snapshot (first, 190 files)', () => history.snapshot('auto'))
    await time('history.snapshot (nothing changed)', () => history.snapshot('auto'))
    await appendFile(join(root, 'content', info.sheets[10]!), '\nNoch ein Absatz.\n')
    const version = await time('history.snapshot (one file changed)', () =>
      history.snapshot('auto'),
    )
    await time('history.list', () => history.list())
    await time('history.differences', () => history.differences(version!.id))
    rows.push({ what: 'rss after versions (MB)', ms: 0, note: `${rssMb()} MB` })
  })

  it('backup: fingerprint and zip of the whole project', async () => {
    const folder = join(base, 'Sicherung')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(folder)
    let config = {
      folder,
      lastAt: null as number | null,
      lastFingerprint: null as string | null,
      lastFile: null as string | null,
    }
    const backup = new ProjectBackup({
      root,
      title: () => 'Grosse Arbeit',
      config: () => config,
      save: async (c) => void (config = c),
      trash: async () => undefined,
    })
    await time('backup.fingerprint', () => backup.fingerprint())
    await time('backup.run (zip)', () => backup.run({ force: true }))
    const list = await backup.list()
    rows.push({ what: 'zip size', ms: 0, note: `${Math.round(list[0]!.size / 1024)} KB` })
  })
})

describe('a project with many large images', () => {
  it('versions and backup with 150 images of 2 MB', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { randomBytes } = await import('node:crypto')
    const heavy = join(base, 'Schwer')
    await mkdir(join(heavy, 'assets'), { recursive: true })
    await generateLongSheet(heavy, 2000)
    const data = randomBytes(2 * 1024 * 1024)
    for (let i = 0; i < 150; i += 1)
      await writeFile(
        join(heavy, 'assets', `foto-${i}.jpg`),
        data.subarray(i, i + 2 * 1024 * 1024 - 150),
      )
    const history = new ProjectHistory(heavy)
    await time('history.snapshot, first (150 images, 300 MB)', () => history.snapshot('auto'))
    await time('history.snapshot, nothing changed', () => history.snapshot('auto'))
    await time('history.snapshot, nothing changed (again)', () => history.snapshot('auto'))
    const folder = join(base, 'Sicherung2')
    await mkdir(folder)
    let config = {
      folder,
      lastAt: null as number | null,
      lastFingerprint: null as string | null,
      lastFile: null as string | null,
    }
    const backup = new ProjectBackup({
      root: heavy,
      title: () => 'Schwer',
      config: () => config,
      save: async (c) => void (config = c),
      trash: async () => undefined,
    })
    await time('backup.fingerprint (150 images)', () => backup.fingerprint())
    await time('backup.run (zip of 300 MB of images)', () => backup.run({ force: true }))
    const list = await backup.list()
    rows.push({ what: 'zip size', ms: 0, note: `${Math.round(list[0]!.size / 1048576)} MB` })
    rows.push({ what: 'rss after (MB)', ms: 0, note: `${rssMb()} MB` })
  })
})

describe('one very long sheet', () => {
  it('parses a text of 20,000 words', async () => {
    const longRoot = join(base, 'Lang')
    await generateLongSheet(longRoot, 20_000)
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(join(longRoot, 'content', 'lang', 's-lang01.typ'), 'utf8')
    await time(`parseTypst (${Math.round(text.length / 1024)} KB)`, () => parseTypst(text))
    await time('analyzeSheet', () => analyzeSheet(text))
  })
})
