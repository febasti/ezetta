import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launchAt, MOD, TYPST } from './helpers'
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
