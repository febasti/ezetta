import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, MOD, TYPST, openSheet } from './helpers'
import type { Sandbox } from './helpers'

// The export runs the real Typst compiler (`brew install typst`).
test.skip(!TYPST, 'Typst is not installed')
test.describe.configure({ timeout: 90_000 })

const SHEET = 'content/methoden/design.typ'
let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [SHEET]: '= Design <sec-design>\n\nEin Text mit ::Markierung:: und /* offen */ Kommentar.\n',
    'content/methoden/auswertung.typ': '= Auswertung\n\nSiehe @sec-design.\n',
    'library.bib':
      '@book{smith2020, author = {Smith, Anna}, title = {Eine Studie}, year = {2020}}\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const target = () => join(sandbox.base, 'Arbeit.pdf')

async function open(extra: Record<string, string> = {}) {
  const { app, page } = await launch(sandbox, {
    env: { EZETTA_TEST_EXPORT: target(), ...extra },
  })
  await openSheet(page, 'methoden/design.typ')
  return { app, page }
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export und Vorlagen' })

async function openDialog(page: Page) {
  await page.getByRole('button', { name: 'Projektmenü' }).click()
  await page.getByRole('menuitem', { name: 'Als PDF exportieren …' }).click()
  await expect(dialog(page)).toBeVisible()
}

test('opens the dialog when citation keys cannot be resolved, and lists them', async () => {
  sandbox = await createSandbox({
    [SHEET]:
      '= Design\n\nWie @fehlt2000 und @fehlt2000 zeigen, auch @smith2020 und @weg1999[S. 4].\n',
    'library.bib':
      '@book{smith2020, author = {Smith, Anna}, title = {Eine Studie}, year = {2020}}\n',
  })
  const { app, page } = await open()
  try {
    await openDialog(page)
    await expect(dialog(page)).toContainText('fehlt2000')
    await expect(dialog(page)).toContainText('weg1999')
  } finally {
    await app.close()
  }
})

test('exports a PDF to the place asked for, from the dialog, and remembers the choices', async () => {
  const { app, page } = await open()
  try {
    await openDialog(page)
    // The options come from the template.
    await dialog(page).getByLabel('Autorin oder Autor').fill('A. Autor')
    await dialog(page).getByLabel('Zitierstil').selectOption('chicago-author-date')
    // What is still open in the sheets is said before the export.
    await expect(dialog(page)).toContainText('Offene Kommentare: 1')
    await dialog(page).getByRole('button', { name: 'Exportieren …' }).click()
    await expect(dialog(page)).toContainText('PDF gespeichert', { timeout: 60_000 })
    await expect(dialog(page)).toContainText(/\d+ Seiten?/)
    const pdf = await readFile(target())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const manifest = await readFile(join(sandbox.projectDir, 'project.toml'), 'utf8')
    expect(manifest).toContain('[[export]]')
    expect(manifest).toContain('author = "A. Autor"')
    expect(manifest).toContain('citation_style = "chicago-author-date"')
    // The sheets themselves are untouched.
    expect(await readFile(join(sandbox.projectDir, SHEET), 'utf8')).toContain('::Markierung::')

    // The dialog opens again with the same choices.
    await dialog(page).getByRole('button', { name: 'Schließen' }).click()
    await openDialog(page)
    await expect(dialog(page).getByLabel('Autorin oder Autor')).toHaveValue('A. Autor')
    await expect(dialog(page).getByLabel('Zitierstil')).toHaveValue('chicago-author-date')
  } finally {
    await app.close()
  }
})

test('says which sheet and line an error is in, and a click goes there', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Ein #unbekannt(1) Fehler.')
    await openDialog(page)
    await dialog(page).getByRole('button', { name: 'Exportieren …' }).click()
    await expect(dialog(page)).toContainText('Der Export ist fehlgeschlagen', { timeout: 60_000 })
    const error = dialog(page).locator('.diagnostics li.error').first()
    await expect(error).toContainText('unknown variable')
    await expect(error).toContainText('Design')
    await expect(error).toContainText('Zeile 4')
    expect(existsSync(target())).toBe(false)
    await error.getByRole('button').click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('#unbekannt(1)')
  } finally {
    await app.close()
  }
})

test('a reference to a heading that is in the export is a link, and one that is not is reported', async () => {
  const { app, page } = await open()
  try {
    await openDialog(page)
    await expect(dialog(page)).not.toContainText('Querverweis auf eine Überschrift')
    await dialog(page).getByRole('button', { name: 'Schließen' }).click()

    // Leave the heading out of the export: the other sheet's reference leads nowhere.
    await page.locator('[role=option][data-path="methoden/design.typ"]').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Als Notizblatt markieren' }).click()
    await openDialog(page)
    await expect(dialog(page)).toContainText(
      'Querverweis auf eine Überschrift, die nicht im Export ist',
    )
  } finally {
    await app.close()
  }
})

test('a citation without a work in the bibliography is listed before the export, in its sheet', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: '= Design\n\nWie @niemand2020 zeigt.\n',
    'library.bib': '',
  })
  const { app, page } = await open()
  try {
    await openDialog(page)
    await expect(dialog(page)).toContainText('Beleg ohne Eintrag in der Bibliographie: niemand2020')
  } finally {
    await app.close()
  }
})
