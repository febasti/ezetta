import { execFileSync } from 'node:child_process'
import { appendFile, cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { HISTORY_DIR } from '@core/history/versions'
import { ProjectHistory } from '../../src/main/services/history'
import { mergePacks, packLoose } from '../../src/main/services/packs'
import { generateThesis } from './fixture'

/**
 * A year of versions on the large project: how many files and bytes the version store holds, and
 * how long taking and listing versions take. Not part of `npm run bench:core` (it takes about four
 * minutes); run it alone with `npm run bench:history`. `EZETTA_BENCH_PACK=0` keeps the store loose
 * all year, as it was before packing, and times its first packing.
 *
 * The writer drafts for 34 weeks (the sheets start as their first paragraph and grow to their full
 * text, chapter by chapter), then revises for 10 weeks (small changes all over). Five days a week,
 * four hours a day, a version every 10 minutes when something changed, as the app does. Each week
 * two works go into the bibliography and an export is made; every other week an image is added
 * (400 kB that does not compress, like a photo); once a month the writer names a version.
 */

const DAYS = Number(process.env.EZETTA_BENCH_DAYS ?? 220)
const DRAFT_DAYS = Math.round(DAYS * (170 / 220))
const INTERVALS = 24 // 4 hours of 10 minutes
const START = Date.UTC(2026, 0, 5, 8, 0, 0)
const DAY = 24 * 3600 * 1000

function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface StoreSize {
  files: number
  bytes: number
  disk: number
}

async function storeSize(dir: string): Promise<StoreSize> {
  const out: StoreSize = { files: 0, bytes: 0, disk: 0 }
  const walk = async (d: string): Promise<void> => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) await walk(path)
      else {
        const s = await stat(path)
        out.files += 1
        out.bytes += s.size
        out.disk += s.blocks * 512
      }
    }
  }
  await walk(dir)
  return out
}

const mb = (n: number): string => `${(n / 1048576).toFixed(1)} MB`
const row = (label: string, s: StoreSize, extra = ''): string =>
  `${label.padEnd(44)} ${String(s.files).padStart(7)} files ${mb(s.bytes).padStart(10)} ${mb(s.disk).padStart(10)} on disk ${extra}`

const lines: string[] = []
const say = (line: string): void => {
  lines.push(line)
  process.stdout.write(`${line}\n`)
}

let base: string
let root: string

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'ezetta-history-bench-'))
  root = join(base, 'Grosse Arbeit')
  await generateThesis(root)
})
afterAll(async () => {
  if (process.env.EZETTA_BENCH_OUT) await writeFile(process.env.EZETTA_BENCH_OUT, lines.join('\n'))
  if (!process.env.EZETTA_BENCH_KEEP) await rm(base, { recursive: true, force: true })
  else process.stdout.write(`kept in ${base}\n`)
})

describe('a year of versions', () => {
  it('measures the store', { timeout: 3 * 3600 * 1000 }, async () => {
    const rnd = random(11)
    const contentDir = join(root, 'content')
    const sheets: string[] = []
    for (const group of (await readdir(contentDir)).sort())
      for (const name of (await readdir(join(contentDir, group))).sort())
        sheets.push(join(contentDir, group, name))

    // Every sheet starts as its first paragraph; the rest is what drafting adds, in order.
    const full = new Map<string, string>()
    const written = new Map<string, number>()
    for (const sheet of sheets) {
      const text = await readFile(sheet, 'utf8')
      full.set(sheet, text)
      const first = text.indexOf('\n\n', text.indexOf('\n\n') + 2)
      const cut = first > 0 ? first + 2 : text.length
      written.set(sheet, cut)
      await writeFile(sheet, text.slice(0, cut))
    }
    const totalChars = [...full.values()].reduce((n, t) => n + t.length, 0)
    const startChars = [...written.values()].reduce((n, c) => n + c, 0)
    const perInterval = Math.ceil((totalChars - startChars) / (DRAFT_DAYS * INTERVALS))

    let clock = START
    // EZETTA_BENCH_PACK=0 keeps the store loose all year, as before packing, to time its first packing.
    const packAfter = process.env.EZETTA_BENCH_PACK === '0' ? Number.MAX_SAFE_INTEGER : undefined
    const history = new ProjectHistory(root, { now: () => clock, packAfter })
    const store = join(root, ...HISTORY_DIR.split('/'))
    const kinds: Record<string, number> = {}
    const take = async (kind: 'auto' | 'named' | 'export', name: string | null = null) => {
      const start = performance.now()
      const v = await history.snapshot(kind, name)
      if (v) kinds[kind] = (kinds[kind] ?? 0) + 1
      return performance.now() - start
    }

    // A change in place: a sentence of a sheet is replaced by its words in another order.
    const revise = async (sheet: string): Promise<void> => {
      const text = await readFile(sheet, 'utf8')
      const sentences = text.split('. ')
      if (sentences.length < 3) return
      const i = 1 + Math.floor(rnd() * (sentences.length - 2))
      const words = sentences[i]!.split(' ')
      for (let k = words.length - 1; k > 0; k -= 1) {
        const j = Math.floor(rnd() * (k + 1))
        ;[words[k], words[j]] = [words[j]!, words[k]!]
      }
      sentences[i] = words.join(' ')
      await writeFile(sheet, sentences.join('. '))
    }

    await take('auto') // the first version, when the project is first opened
    say(`Simulated ${DAYS} working days (${DRAFT_DAYS} drafting), ${INTERVALS} intervals a day.`)
    say(`${'after day'.padEnd(44)} ${'store'.padStart(13)} ${'size'.padStart(10)}`)

    let cursor = 0 // the sheet being drafted
    let lastSnapshotMs = 0
    for (let day = 1; day <= DAYS; day += 1) {
      const week = Math.floor((day - 1) / 5)
      clock = START + (week * 7 + ((day - 1) % 5)) * DAY
      await take('auto') // opening the project
      for (let i = 0; i < INTERVALS; i += 1) {
        clock += 10 * 60 * 1000
        if (day <= DRAFT_DAYS) {
          let budget = perInterval
          while (budget > 0 && cursor < sheets.length) {
            const sheet = sheets[cursor]!
            const done = written.get(sheet)!
            const text = full.get(sheet)!
            const next = Math.min(text.length, done + budget)
            await appendFile(sheet, text.slice(done, next))
            budget -= next - done
            written.set(sheet, next)
            if (next >= text.length) cursor += 1
          }
          // Now and then a change in a sheet written earlier.
          if (rnd() < 0.3 && cursor > 0) await revise(sheets[Math.floor(rnd() * cursor)]!)
        } else {
          const n = 1 + Math.floor(rnd() * 2)
          for (let k = 0; k < n; k += 1) await revise(sheets[Math.floor(rnd() * sheets.length)]!)
        }
        lastSnapshotMs = await take('auto')
      }
      if (day % 5 === 0) {
        const n = week * 2
        await appendFile(
          join(root, 'library.bib'),
          `\n@article{neu${n},\n  author = {Neu, Ada},\n  title = {Ein neuer Titel ${n}},\n  journal = {Journal},\n  year = {2026}\n}\n@book{neu${n + 1},\n  author = {Neu, Ben},\n  title = {Ein Buch ${n + 1}},\n  publisher = {Verlag},\n  year = {2025}\n}\n`,
        )
        if (week % 2 === 0)
          await writeFile(join(root, 'assets', `foto-${week}.jpg`), randomBytes(400_000))
        clock += 60 * 1000
        await take('export')
      }
      if (day % 20 === 0) await take('named', `Stand Tag ${day}`)
      await take('auto') // closing the project
      if (day % 20 === 0 || day === DAYS) {
        const listStart = performance.now()
        await history.list()
        const listMs = performance.now() - listStart
        say(
          row(
            `day ${day}`,
            await storeSize(store),
            `snapshot ${lastSnapshotMs.toFixed(0)} ms, list ${listMs.toFixed(0)} ms`,
          ),
        )
      }
    }

    const project = await storeSize(root).then(async (all) => {
      const s = await storeSize(store)
      return { files: all.files - s.files, bytes: all.bytes - s.bytes, disk: all.disk - s.disk }
    })
    say('')
    say(`Versions: ${JSON.stringify(kinds)}`)
    say(row('the project itself (without the store)', project))
    say(row('the version store', await storeSize(store)))
    const listStart = performance.now()
    const all = await new ProjectHistory(root).list()
    say(
      `listing all ${all.length} versions (a fresh start): ${(performance.now() - listStart).toFixed(0)} ms`,
    )

    // A store from before packing (or one kept unpacked here): its first packing, in one go.
    const packStart = performance.now()
    const packed = await packLoose(store, 1)
    await mergePacks(store, 1)
    if (packed)
      say(
        row(
          `packed in one go, ${((performance.now() - packStart) / 1000).toFixed(1)} s`,
          await storeSize(store),
        ),
      )

    // What git itself makes of it: packed with deltas (the best case, needs git on the machine).
    const gitCopy = join(base, 'git-repack.git')
    await cp(store, gitCopy, { recursive: true })
    execFileSync('git', ['--git-dir', gitCopy, 'repack', '-a', '-d', '-f', '-q'])
    execFileSync('git', ['--git-dir', gitCopy, 'prune-packed'])
    say(row('packed by git (with deltas), for comparison', await storeSize(gitCopy)))
    execFileSync('git', ['--git-dir', store, 'fsck', '--strict', '--no-progress'])
  })
})
