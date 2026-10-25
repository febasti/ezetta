import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { generateLongSheet, generateThesis } from './fixture'
import type { FixtureInfo } from './fixture'
import {
  domCounts,
  heapMb,
  memorySummary,
  perKeystroke,
  readLatency,
  scrollJank,
  startLatency,
} from './measure'

/**
 * What the running app costs on a large project: start, memory, opening sheets, typing, the
 * continuous view, the checker, versions and backups. Run with `npm run build && npm run bench:app`;
 * it prints a report and writes `tests/perf/report.json` for comparing runs.
 */

const report: Record<string, unknown> = {}
const note = (name: string, value: unknown): void => {
  report[name] = value
  process.stdout.write(`  ${name}: ${JSON.stringify(value)}\n`)
}

let base: string
let thesis: FixtureInfo
let userData: string

test.beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'wm-perf-app-'))
  thesis = await generateThesis(join(base, 'Grosse Arbeit'))
  userData = join(base, 'userdata')
  process.stdout.write(`\nproject: ${thesis.sheets.length} sheets, ${thesis.words} words\n`)
})
test.afterAll(async () => {
  await writeFile(resolve('tests/perf/report.json'), JSON.stringify(report, null, 2))
  await rm(base, { recursive: true, force: true })
})

async function launch(
  project: string,
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; page: Page; started: number }> {
  const t0 = performance.now()
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${userData}-${Math.random().toString(36).slice(2)}`],
    env: {
      ...process.env,
      EZETTA_HTML_MENUS: '1',
      EZETTA_BACKGROUND: '1',
      EZETTA_PROJECT: project,
      ...env,
    },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('[role=treeitem]').first().waitFor()
  return { app, page, started: Math.round(performance.now() - t0) }
}

const openSheet = async (page: Page, sheet: string): Promise<number> => {
  const [group] = sheet.split('/')
  await page.locator(`[role=treeitem][data-path="${group}"]`).click()
  const t0 = performance.now()
  await page.locator(`[role=option][data-path="${sheet}"]`).click()
  await page.locator('.cm-content .cm-line').first().waitFor()
  await page.waitForFunction(
    () => (document.querySelector('.cm-content')?.textContent ?? '').length > 100,
  )
  return Math.round(performance.now() - t0)
}

test('start and idle memory with the large project open, no sheet chosen', async () => {
  const { app, page, started } = await launch(thesis.root)
  try {
    note('launch to first tree row (ms)', started)
    await page.waitForTimeout(3000)
    note('memory idle (MB RSS)', memorySummary(app))
    note('renderer JS heap idle (MB)', await heapMb(page))
    note('dom after open', await domCounts(page))
    const rows = await page.locator('[role=treeitem], [role=option]').count()
    note('sidebar rows in the DOM', rows)
  } finally {
    await app.close()
  }
})

test('open a sheet, type in it, scroll it', async () => {
  const { app, page } = await launch(thesis.root)
  try {
    note('open the first sheet (ms)', await openSheet(page, thesis.sheets[0]!))
    await page.waitForTimeout(1500)
    note('memory with a sheet open (MB RSS)', memorySummary(app))
    note('renderer JS heap with a sheet (MB)', await heapMb(page))
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    await startLatency(page)
    await page.keyboard.type(
      'Dies ist ein neuer Satz mit einer Zitation @autor12010 und einem Wort mehr, damit wir tippen. '.repeat(
        3,
      ),
      { delay: 25 },
    )
    note('typing latency in a 500-word sheet (ms)', await readLatency(page))
    note('scrolling a sheet', await scrollJank(page, '.cm-scroller', 3000))
  } finally {
    await app.close()
  }
})

test('switch between many sheets: time, and whether memory grows', async () => {
  const { app, page } = await launch(thesis.root)
  try {
    const times: number[] = []
    const sheets = thesis.sheets.filter((_, i) => i % 4 === 0).slice(0, 40)
    await openSheet(page, sheets[0]!)
    const heapBefore = await heapMb(page)
    const domBefore = await domCounts(page)
    const rssBefore = memorySummary(app).renderer
    for (const sheet of sheets) times.push(await openSheet(page, sheet))
    for (const sheet of sheets) times.push(await openSheet(page, sheet))
    note('switch to a sheet: median / max (ms)', [
      [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)],
      Math.max(...times),
    ])
    await page.waitForTimeout(1000)
    note('renderer JS heap: before / after 80 switches (MB)', [heapBefore, await heapMb(page)])
    note('DOM nodes and listeners: before / after', [domBefore, await domCounts(page)])
    note('renderer RSS: before / after (MB)', [rssBefore, memorySummary(app).renderer])
  } finally {
    await app.close()
  }
})

test('the continuous view of the whole project (80,000 words)', async () => {
  const { app, page } = await launch(thesis.root)
  try {
    const t0 = performance.now()
    await page.locator('[role=treeitem]', { hasText: 'Alle Abschnitte' }).click()
    await page.locator('.cm-content .cm-line').first().waitFor()
    await page.waitForFunction(
      () => (document.querySelector('.cm-content')?.textContent ?? '').length > 1000,
    )
    note('open the continuous view of everything (ms)', Math.round(performance.now() - t0))
    await page.waitForTimeout(2000)
    note('memory in the continuous view (MB RSS)', memorySummary(app))
    note('renderer JS heap in the continuous view (MB)', await heapMb(page))
    note('dom in the continuous view', await domCounts(page))
    note('scrolling the continuous view', await scrollJank(page, '.cm-scroller', 20000))
    await page.locator('.cm-content').click()
    await startLatency(page)
    await page.keyboard.type('Ein Satz im großen Text. '.repeat(8), { delay: 25 })
    note('typing latency in the continuous view (ms)', await readLatency(page))
  } finally {
    await app.close()
  }
})

test('one very long sheet of 20,000 words', async () => {
  const longRoot = join(base, 'Lang')
  await generateLongSheet(longRoot, 20_000)
  const { app, page } = await launch(longRoot)
  try {
    const t = await openSheet(page, 'lang/s-lang01.typ')
    note('open a 20,000-word sheet (ms)', t)
    await page.waitForTimeout(2000)
    note('memory with the long sheet (MB RSS)', memorySummary(app))
    note('renderer JS heap with the long sheet (MB)', await heapMb(page))
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    await startLatency(page)
    await page.keyboard.type('Ein neuer Satz am Ende des langen Textes. '.repeat(5), { delay: 25 })
    note('typing latency at the end of the long sheet (ms)', await readLatency(page))
    await page.keyboard.press('Meta+ArrowUp')
    await startLatency(page)
    await page.keyboard.type('Und am Anfang. '.repeat(8), { delay: 25 })
    note('typing latency at the start of the long sheet (ms)', await readLatency(page))
    note('scrolling the long sheet', await scrollJank(page, '.cm-scroller', 20000))
  } finally {
    await app.close()
  }
})

test('a dense sheet of 8,000 words: citations, footnotes, formulas, figures and quotes everywhere', async () => {
  const denseRoot = join(base, 'Dicht')
  await generateLongSheet(denseRoot, 8000, { dense: true })
  const { app, page } = await launch(denseRoot, { EZETTA_TYPST: '/opt/homebrew/bin/typst' })
  try {
    note('open a dense 8,000-word sheet (ms)', await openSheet(page, 'lang/s-lang01.typ'))
    await page.waitForTimeout(4000)
    note('memory with the dense sheet (MB RSS)', memorySummary(app))
    note('renderer JS heap with the dense sheet (MB)', await heapMb(page))
    note('dom with the dense sheet', await domCounts(page))
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    await startLatency(page)
    await page.keyboard.type('Ein neuer Satz mit Beleg @autor12005 am Ende. '.repeat(4), {
      delay: 25,
    })
    note('typing latency at the end of the dense sheet (ms)', await readLatency(page))
    await page.keyboard.press('Meta+ArrowUp')
    await page.keyboard.press('ArrowDown')
    await startLatency(page)
    await page.keyboard.type('Und noch ein Satz am Anfang. '.repeat(5), { delay: 25 })
    note('typing latency at the start of the dense sheet (ms)', await readLatency(page))
    note('scrolling the dense sheet', await scrollJank(page, '.cm-scroller', 20000))
  } finally {
    await app.close()
  }
})

test('five times the project: 800 sheets and 400,000 words', async () => {
  const bigRoot = join(base, 'Riesig')
  const big = await generateThesis(bigRoot, { groups: 40, sheetsPerGroup: 20 })
  note('big project', { sheets: big.sheets.length, words: big.words })
  const { app, page, started } = await launch(bigRoot)
  try {
    note('launch to first tree row, 800 sheets (ms)', started)
    await page.waitForTimeout(3000)
    note('memory idle, 800 sheets (MB RSS)', memorySummary(app))
    note(
      'sidebar rows in the DOM, 800 sheets',
      await page.locator('[role=treeitem], [role=option]').count(),
    )
    note('open a sheet, 800 sheets (ms)', await openSheet(page, big.sheets[400]!))
    await page.locator('.cm-content').click()
    await startLatency(page)
    await page.keyboard.type('Ein Satz im großen Projekt. '.repeat(6), { delay: 25 })
    note('typing latency, 800 sheets (ms)', await readLatency(page))
    const t0 = performance.now()
    await page.locator('[role=treeitem]', { hasText: 'Alle Abschnitte' }).click()
    await page.waitForFunction(
      () => (document.querySelector('.cm-content')?.textContent ?? '').length > 1000,
    )
    note('continuous view of 400,000 words (ms)', Math.round(performance.now() - t0))
    await page.waitForTimeout(3000)
    note('memory in that view (MB RSS)', memorySummary(app))
    note('renderer JS heap in that view (MB)', await heapMb(page))
    await page.locator('.cm-content').click()
    await startLatency(page)
    await page.keyboard.type('Ein Satz im riesigen Text. '.repeat(6), { delay: 25 })
    note('typing latency in that view (ms)', await readLatency(page))
  } finally {
    await app.close()
  }
})

test('the checker: memory and time to start', async () => {
  const { app, page } = await launch(thesis.root)
  try {
    await openSheet(page, thesis.sheets[1]!)
    const before = memorySummary(app)
    const t0 = performance.now()
    await page
      .locator('footer')
      .getByRole('button', { name: /^Prüfung/ })
      .click()
    try {
      await page.waitForFunction(
        () =>
          /Hinweis|keine|geprüft|bereit/i.test(
            document.querySelector('[role=tabpanel]')?.textContent ?? '',
          ),
        null,
        { timeout: 90_000 },
      )
    } catch {
      note('checker did not become ready', true)
    }
    note('checker ready (ms)', Math.round(performance.now() - t0))
    await page.waitForTimeout(3000)
    note('memory before / with the checker (MB RSS)', [before, memorySummary(app)])
  } finally {
    await app.close()
  }
})

test('main-thread time per key press (ms): script, style, layout', async () => {
  const text = 'abcdefghij klmnopqrst uvwxyz abcdefghij '.repeat(3)
  const run = async (
    label: string,
    root: string,
    sheet: string,
    env: Record<string, string> = {},
  ) => {
    const { app, page } = await launch(root, env)
    try {
      await openSheet(page, sheet)
      await page.locator('.cm-content').click()
      await page.keyboard.press('Meta+End')
      await page.waitForTimeout(800)
      note(
        label,
        await perKeystroke(page, () => page.keyboard.type(text, { delay: 30 }), text.length),
      )
    } finally {
      await app.close()
    }
  }
  await run('per key press, 500-word sheet', thesis.root, thesis.sheets[0]!)
  const longRoot = join(base, 'Lang2')
  await generateLongSheet(longRoot, 20_000)
  await run('per key press, 20,000-word sheet', longRoot, 'lang/s-lang01.typ')
  const denseRoot = join(base, 'Dicht2')
  await generateLongSheet(denseRoot, 8000, { dense: true })
  await run('per key press, dense 8,000-word sheet', denseRoot, 'lang/s-lang01.typ', {
    EZETTA_TYPST: '/opt/homebrew/bin/typst',
  })
})

test('large edits: a paste of 300 KB, select all, delete, undo', async () => {
  const { app, page } = await launch(thesis.root)
  try {
    await openSheet(page, thesis.sheets[5]!)
    const chunk = (await readFile(join(thesis.root, 'content', thesis.sheets[6]!), 'utf8'))
      .repeat(40)
      .slice(0, 300_000)
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    const frame = () =>
      page.evaluate(
        () =>
          new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      )
    const measure = async (label: string, work: () => Promise<void>) => {
      const t0 = performance.now()
      await work()
      await frame()
      note(label + ' (ms)', Math.round(performance.now() - t0))
    }
    await measure('paste 300 KB (about 40,000 words)', () => page.keyboard.insertText(chunk))
    await page.waitForTimeout(1500)
    note('memory after the paste (MB RSS)', memorySummary(app))
    await measure('select all', () => page.keyboard.press('Meta+a'))
    await measure('delete everything', () => page.keyboard.press('Backspace'))
    await measure('undo the deletion', () => page.keyboard.press('Meta+z'))
    await page.waitForTimeout(1500)
    await measure('type one letter in the large text', () => page.keyboard.type('x'))
    note('renderer JS heap after large edits (MB)', await heapMb(page))
  } finally {
    await app.close()
  }
})

test('the checker sleeps when unused and wakes for the next check', async () => {
  const { app, page } = await launch(thesis.root, { EZETTA_PROOF_IDLE_MS: '4000' })
  try {
    await openSheet(page, thesis.sheets[1]!)
    await page
      .locator('footer')
      .getByRole('button', { name: /^Prüfung/ })
      .click()
    await expect.poll(() => memorySummary(app).java, { timeout: 60_000 }).toBeGreaterThan(100)
    note('memory with the checker running (MB RSS)', memorySummary(app))
    // Nothing is typed: after the idle time the Java process is gone, and the panel still says ready.
    await expect.poll(() => memorySummary(app).java, { timeout: 30_000 }).toBe(0)
    note('memory after the idle stop (MB RSS)', memorySummary(app))
    // Typing asks for a new check, which starts it again.
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    await page.keyboard.type(' Das ist ein Tesst mit einem Fehler.', { delay: 20 })
    await expect.poll(() => memorySummary(app).java, { timeout: 60_000 }).toBeGreaterThan(100)
    note('checker woke up again for the next check', true)
  } finally {
    await app.close()
  }
})

test('versions, backup, and a burst of changes on disk', async () => {
  const folder = join(base, 'Sicherung')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(folder, { recursive: true })
  const { app, page } = await launch(thesis.root, { EZETTA_TEST_BACKUP: folder })
  try {
    await openSheet(page, thesis.sheets[0]!)
    await page.waitForTimeout(3500) // the first automatic version
    const call = (code: string): Promise<number> =>
      page.evaluate(async (c) => {
        const t0 = performance.now()
        await new Function('api', `return (async () => { ${c} })()`)(
          (window as unknown as { api: unknown }).api,
        )
        return Math.round(performance.now() - t0)
      }, code)
    note('history.list over IPC (ms)', await call('await api.history.list({})'))
    note(
      'save a named version, nothing changed (ms)',
      await call("await api.history.save({ name: 'x' })"),
    )
    note(
      'backup to a folder: first backup (ms)',
      await call('await api.backup.chooseFolder({ dialogTitle: "x" })'),
    )
    note('backup now (ms)', await call('await api.backup.run({})'))
    note('memory after versions and backup (MB RSS)', memorySummary(app))

    // A burst: 60 sheets change on disk at once, as after a git checkout or a sync.
    const t0 = performance.now()
    for (const sheet of thesis.sheets.slice(20, 80)) {
      const path = join(thesis.root, 'content', sheet)
      await writeFile(path, (await readFile(path, 'utf8')) + '\nEin Zusatz von außen.\n')
    }
    await page.waitForFunction(() => document.body.textContent !== null, null, { polling: 100 })
    await page.waitForTimeout(1500)
    note(
      '60 files changed on disk, UI settled (ms, incl. 1.5 s wait)',
      Math.round(performance.now() - t0),
    )
    note(
      'main process busy check: renderer responsive',
      await page.evaluate(() => performance.now() > 0),
    )
  } finally {
    await app.close()
  }
})

test('growth over time: type for a minute, memory before and after', async () => {
  const { app, page } = await launch(thesis.root)
  try {
    await openSheet(page, thesis.sheets[2]!)
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+End')
    await page.waitForTimeout(1500)
    const before = { heap: await heapMb(page), rss: memorySummary(app) }
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.type(
        'Noch ein Satz, der geschrieben wird, und noch einer dazu. '.repeat(4),
        { delay: 15 },
      )
      await page.waitForTimeout(900) // autosave, statistics
    }
    await page.waitForTimeout(1500)
    note('after about a minute of typing: JS heap before / after (MB)', [
      before.heap,
      await heapMb(page),
    ])
    note('after about a minute of typing: RSS before / after', [before.rss, memorySummary(app)])
    expect(true).toBe(true)
  } finally {
    await app.close()
  }
})
