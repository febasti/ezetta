import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launchAt, MOD, POINTER, TYPST } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const SAMPLE = '= Design\n\nDas Design der Studie ist qualitativ.\n'

// The pages are made by the Typst compiler, so these tests need one installed.
test.skip(!TYPST, 'needs the typst command')

let sandbox: Sandbox
test.beforeEach(async () => {
  // The sandbox's other sheets cite this work: with no bibliography the compiler would stop at it.
  sandbox = await createSandbox({
    [SHEET]: SAMPLE,
    'library.bib':
      '@article{smith2020, author = {Smith, John}, title = {Eine Studie}, year = {2020}}\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

async function open() {
  return launchAt(sandbox, 'methoden/design.typ', { env: { EZETTA_TYPST: TYPST! } })
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export und Vorlagen' })
const pane = (page: Page) => dialog(page).getByRole('region', { name: 'Vorschau' })
const pages = (page: Page) => pane(page).locator('img.page')

async function openDialog(page: Page) {
  await page.getByRole('button', { name: 'Projektmenü' }).click()
  await page.getByRole('menuitem', { name: 'Als PDF exportieren …' }).click()
  await expect(dialog(page)).toBeVisible()
}

test('the pages are shown in the export dialog only, not beside the text', async () => {
  const { app, page } = await open()
  try {
    // The editor has no preview: no button in the toolbar, and Cmd+Alt+P opens nothing.
    await expect(page.locator('.toolbar').getByRole('button', { name: 'Vorschau' })).toHaveCount(0)
    await page.keyboard.press(`${MOD}+Alt+p`)
    await expect(page.locator('img.page')).toHaveCount(0)

    // The export dialog shows the pages, made by the compiler: each a decodable image.
    await openDialog(page)
    await expect(pages(page).first()).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() =>
        pages(page)
          .first()
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
      )
      .toBeGreaterThan(500)
    // Closing it leaves no pages behind in the window.
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('img.page')).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('Das Design der Studie')
  } finally {
    await app.close()
  }
})

test('an error in a sheet is shown where the pages would be', async () => {
  await writeFile(join(sandbox.projectDir, SHEET), '= Design\n\nText.\n\n#nicht_vorhanden(1)\n')
  const { app, page } = await open()
  try {
    await openDialog(page)
    await expect(pane(page).getByRole('alert')).toContainText(
      'Die Vorschau konnte nicht erstellt werden',
      { timeout: 30_000 },
    )
    await expect(pages(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('citations do not stop the pages: an unknown work, a flawed bibliography, a chapter', async () => {
  // A Zotero-like file with what the compiler would refuse the whole document for: an entry that
  // is not closed, a key used twice, a date it cannot read; and a chapter, whose book's title it
  // would print twice.
  await writeFile(
    join(sandbox.projectDir, 'library.bib'),
    [
      '@article{smith2020, author = {Smith, John}, title = {Eine Studie}, year = {2020}}',
      '@incollection{lee2018, author = {Lee, Ann}, title = {Kapitel}, booktitle = {Handbuch}, editor = {Klein, Peter}, year = {2018}}',
      '@book{old, author = {Roe, Max}, title = {Alt}, year = {circa 1900}}',
      '@book{dup, title = {A}, year = {2001}}',
      '@book{dup, title = {B}, year = {2002}}',
      '@book{broken, title = {Kaputt, year = {2004}',
    ].join('\n'),
  )
  await writeFile(
    join(sandbox.projectDir, SHEET),
    '= Design\n\nWie @smith2020, @lee2018 und @old zeigen, und @fehlt2000.#footnote[Siehe #cite(<weg1999>).]\n',
  )
  const { app, page } = await open()
  try {
    await openDialog(page)
    // The pages come, rather than "Die Vorschau konnte nicht erstellt werden".
    await expect(pages(page).first()).toBeVisible({ timeout: 60_000 })
    await expect(pane(page).getByRole('alert')).toHaveCount(0)
    // The writer's file is left as it was; the compiler read a clean copy of the cited works.
    expect(await readFile(join(sandbox.projectDir, 'library.bib'), 'utf8')).toContain('Kaputt')
    const copy = await readFile(join(sandbox.projectDir, '_build/bibliography.bib'), 'utf8')
    expect(copy).toContain('@inbook{lee2018')
    expect(copy).toContain('year = {1900}')
    expect(copy).not.toContain('dup')
    // The unknown works print as placeholders.
    const sheet = await readFile(
      join(sandbox.projectDir, '_build/content/methoden/design.typ'),
      'utf8',
    )
    expect(sheet).toContain('fehlt2000?')
    expect(sheet).toContain('weg1999?')
  } finally {
    await app.close()
  }
})

test('the pages zoom, and a sidebar shows them small or the headings, which lead to them', async () => {
  // Long enough for several pages, with chapters and sections.
  const paragraph =
    'Ein Absatz, der lang genug ist, um eine Zeile zu füllen und weiter zu laufen. '.repeat(8)
  await writeFile(
    join(sandbox.projectDir, SHEET),
    [
      '= Design',
      '',
      ...Array.from({ length: 4 }, (_, i) => [
        `== Teil ${i + 1}`,
        '',
        ...Array(6).fill(paragraph + '\n'),
      ]).flat(),
    ].join('\n'),
  )
  const { app, page } = await open()
  try {
    await openDialog(page)
    await expect(pages(page).first()).toBeVisible({ timeout: 30_000 })
    const count = await pages(page).count()
    expect(count).toBeGreaterThan(3)
    // Each page has its size before it is loaded: the last one is as tall as the first.
    const height = (n: number) =>
      pages(page)
        .nth(n)
        .evaluate((img: HTMLImageElement) => img.offsetHeight)
    expect(await height(count - 1)).toBe(await height(0))
    const width = () =>
      pages(page)
        .first()
        .evaluate((img: HTMLImageElement) => img.offsetWidth)
    const zoom = pane(page).getByLabel('Zoom', { exact: true })
    await expect(zoom).toHaveValue('width')
    if (process.env['EZETTA_SHOTS'])
      await page.screenshot({ path: `${process.env['EZETTA_SHOTS']}/1-width.png` })

    // The real size: A4 is 794 pixels wide; a step up makes it larger, Cmd 0 brings the page's width back.
    await zoom.selectOption('1')
    await expect.poll(width).toBe(794)
    await pane(page).getByRole('button', { name: 'Vergrößern' }).click()
    await expect.poll(width).toBe(992)
    await expect(zoom).toHaveValue('1.25')
    // A page wider than the desk scrolls across.
    const desk = pane(page).locator('.desk')
    expect(await desk.evaluate((d) => d.scrollWidth > d.clientWidth)).toBe(true)
    if (process.env['EZETTA_SHOTS'])
      await page.screenshot({ path: `${process.env['EZETTA_SHOTS']}/2-zoomed.png` })
    await page.keyboard.press(`${MOD}+-`)
    await expect.poll(width).toBe(794)
    await page.keyboard.press(`${MOD}+0`)
    await expect(zoom).toHaveValue('width')
    await zoom.selectOption('page')
    const whole = await desk.evaluate((d) => {
      const img = d.querySelector('img.page') as HTMLImageElement
      return img.offsetHeight <= d.clientHeight
    })
    expect(whole).toBe(true)
    await zoom.selectOption('width')

    // The sidebar with the pages small: a click on one brings it into view and marks it.
    const sidebar = pane(page).getByRole('complementary', { name: 'Seitenleiste' })
    await expect(sidebar).toHaveCount(0)
    await pane(page).getByRole('button', { name: 'Seitenleiste' }).click()
    await expect(sidebar).toBeVisible()
    const thumbs = sidebar.getByRole('button', { name: /^Seite \d+$/ })
    await expect(thumbs).toHaveCount(count)
    await expect(thumbs.first()).toHaveAttribute('aria-current', 'page')
    await thumbs.nth(2).click()
    await expect(thumbs.nth(2)).toHaveAttribute('aria-current', 'page')
    await expect(pane(page)).toContainText(`Seite 3 von ${count}`)
    if (process.env['EZETTA_SHOTS'])
      await page.screenshot({ path: `${process.env['EZETTA_SHOTS']}/3-thumbs.png` })

    // The headings, numbered as the template prints them; a click goes to the page it is on.
    await sidebar.getByRole('radio', { name: 'Gliederung' }).click()
    const last = sidebar.getByRole('button', { name: /Teil 4/ })
    await expect(last).toBeVisible()
    await last.click()
    await expect(last).toHaveAttribute('aria-current', 'location')
    const onPage = Number(await last.locator('.page-number').textContent())
    await expect(pane(page)).toContainText(`Seite ${onPage} von ${count}`)
    if (process.env['EZETTA_SHOTS'])
      await page.screenshot({ path: `${process.env['EZETTA_SHOTS']}/4-outline.png` })

    // The sidebar is remembered when the dialog opens again.
    await page.keyboard.press('Escape')
    await openDialog(page)
    await expect(sidebar).toBeVisible()
  } finally {
    await app.close()
  }
})

test(
  'a zoomed page scrolls across: a swipe, Shift with the wheel, dragged by hand, the arrow keys',
  POINTER,
  async () => {
    const { app, page } = await open()
    try {
      await openDialog(page)
      await expect(pages(page).first()).toBeVisible({ timeout: 30_000 })
      await pane(page).getByLabel('Zoom', { exact: true }).selectOption('2')
      const desk = pane(page).locator('.desk')
      await expect.poll(() => desk.evaluate((d) => d.scrollWidth > d.clientWidth + 100)).toBe(true)
      const left = () => desk.evaluate((d) => d.scrollLeft)
      // The page is wider than the desk, so it can be taken by hand.
      await expect(desk.locator('.sheets')).toHaveCSS('cursor', 'grab')
      const box = (await desk.boundingBox())!
      const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await page.mouse.move(middle.x, middle.y)

      // A sideways swipe on the trackpad.
      let before = await left()
      await page.mouse.wheel(120, 0)
      await expect.poll(left).toBeGreaterThan(before)
      // Shift with a wheel that turns only up and down.
      before = await left()
      await page.keyboard.down('Shift')
      await page.mouse.wheel(0, 120)
      await page.keyboard.up('Shift')
      await expect.poll(left).toBeGreaterThan(before)
      // Dragged to the right by hand, the page moves right: the view goes left.
      before = await left()
      await page.mouse.down()
      await page.mouse.move(middle.x + 80, middle.y, { steps: 4 })
      await page.mouse.up()
      expect(await left()).toBe(before - 80)
      // The press gave the desk the focus, so the arrow keys scroll it.
      before = await left()
      await page.keyboard.press('ArrowRight')
      await expect.poll(left).toBeGreaterThan(before)
    } finally {
      await app.close()
    }
  },
)
