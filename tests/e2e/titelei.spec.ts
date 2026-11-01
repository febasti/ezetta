import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, TYPST } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox()
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const titelei = (page: Page) => page.locator('[role=treeitem]', { hasText: 'Titelei' }).first()
const openExport = async (page: Page) => {
  await page.getByRole('button', { name: 'Projektmenü' }).click()
  await page.getByRole('menuitem', { name: 'Als PDF exportieren …' }).click()
}
const manifest = () => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8')

test('the title page fields are edited on the Titelei page and kept in project.toml', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await titelei(page).click()
    await expect(page.getByRole('heading', { name: 'Angaben', level: 1 })).toBeVisible()
    // The card in the sheets column shows the title and says the authors are missing.
    await expect(page.getByRole('button', { name: /Angaben/ })).toContainText('Dissertation')
    await expect(page.getByRole('button', { name: /Angaben/ })).toContainText('Autoren ergänzen')

    await page.getByLabel('Untertitel', { exact: true }).fill('Studien zur Erzählinstanz')
    await page.getByLabel('Untertitel', { exact: true }).press('Enter')
    await page.getByRole('button', { name: 'Person hinzufügen' }).click()
    await page.getByLabel('Name', { exact: true }).fill('Felix Schorn')
    await page.getByLabel('Einrichtung', { exact: true }).fill('Universität Hamburg')
    await page.getByLabel('Einrichtung', { exact: true }).press('Enter')
    await page.getByLabel('Version', { exact: true }).fill('1.0')
    await page.getByLabel('Version', { exact: true }).press('Enter')

    await expect(page.getByRole('button', { name: /Angaben/ })).toContainText('Felix Schorn')
    await expect.poll(manifest).toContain('subtitle = "Studien zur Erzählinstanz"')
    await expect.poll(manifest).toContain('name = "Felix Schorn"')
    await expect.poll(manifest).toContain('affiliation = "Universität Hamburg"')
    await expect.poll(manifest).toContain('version = "1.0"')

    // A second person, moved to the front.
    await page.getByRole('button', { name: 'Person hinzufügen' }).click()
    await page.getByLabel('Name', { exact: true }).nth(1).fill('Anna Beck')
    await page.getByLabel('Name', { exact: true }).nth(1).press('Enter')
    await page.getByRole('button', { name: 'Nach oben' }).nth(1).click()
    await expect(page.getByRole('button', { name: /Angaben/ })).toContainText(
      'Anna Beck, Felix Schorn',
    )

    // The date: the day of the export, or a fixed one.
    await expect(page.getByText('Am Tag des Exports')).toBeVisible()
    await page.getByRole('switch', { name: 'Festes Datum' }).click()
    await expect.poll(manifest).toMatch(/date = "\d{4}-\d{2}-\d{2}"/)
    await page.getByRole('switch', { name: 'Festes Datum' }).click()
    await expect.poll(manifest).not.toContain('date = ')

    // The project title is the title field.
    await page.getByLabel('Titel', { exact: true }).fill('Der Erzähler im Zweifel')
    await page.getByLabel('Titel', { exact: true }).press('Enter')
    await expect(page.getByRole('button', { name: /Angaben/ })).toContainText(
      'Der Erzähler im Zweifel',
    )
    await expect.poll(manifest).toContain('title = "Der Erzähler im Zweifel"')
  } finally {
    await app.close()
  }
})

test('a text of the Titelei is a sheet in its slot, edited like any other', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await titelei(page).click()
    await expect(page.getByRole('button', { name: 'Widmung hinzufügen' })).toBeVisible()
    await page.getByRole('button', { name: 'Abstract hinzufügen' }).click()
    await expect(page.locator('.cm-content')).toBeVisible()
    await page.locator('.cm-content').click()
    await page.keyboard.type('Die Arbeit untersucht den Erzähler.')
    const file = join(sandbox.projectDir, 'titelei', 'abstract.typ')
    await expect
      .poll(() => readFile(file, 'utf8').catch(() => ''))
      .toBe('Die Arbeit untersucht den Erzähler.')
    // The slot is a card now, with its word count, and the dashed row is gone.
    await expect(page.getByRole('button', { name: 'Abstract hinzufügen' })).toHaveCount(0)
    const card = page.locator('[role=option][data-path=":titelei/abstract.typ"]')
    await expect(card).toContainText('Abstract')
    await expect(card).toContainText('5')
    // It is no sheet of the document: the groups do not list it, and the project count has not moved.
    await page.locator('[role=treeitem][data-path=""]').click()
    await expect(page.locator('[role=option][data-path=":titelei/abstract.typ"]')).toHaveCount(0)
    // It is there again, and can be emptied, which sends the file to the trash.
    await titelei(page).click()
    await card.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'In den Papierkorb legen' }).click()
    await page.getByRole('button', { name: 'In den Papierkorb', exact: true }).click()
    await expect.poll(() => existsSync(file)).toBe(false)
    await expect(page.getByRole('button', { name: 'Abstract hinzufügen' })).toBeVisible()
  } finally {
    await app.close()
  }
})

test.describe('with the compiler', () => {
  test.skip(!TYPST, 'needs the typst command')

  test('the export asks for authors, and the fields and texts reach its pages', async () => {
    const { app, page } = await launch(sandbox)
    try {
      const dialog = page.getByRole('dialog', { name: 'Export und Vorlagen' })
      await openExport(page)
      await expect(dialog).toContainText('Keine Autoren für die Titelseite')
      // The warning leads to the page where the authors are entered.
      await dialog.getByRole('button', { name: /Keine Autoren/ }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Angaben', level: 1 })).toBeVisible()

      await page.getByRole('button', { name: 'Person hinzufügen' }).click()
      await page.getByLabel('Name', { exact: true }).fill('Felix Schorn')
      await page.getByLabel('Name', { exact: true }).press('Enter')
      await page.getByRole('button', { name: 'Widmung hinzufügen' }).click()
      await page.locator('.cm-content').click()
      await page.keyboard.type('Für Anna.')
      const file = join(sandbox.projectDir, 'titelei', 'dedication.typ')
      await expect.poll(() => readFile(file, 'utf8').catch(() => '')).toBe('Für Anna.')

      await openExport(page)
      await expect(dialog).not.toContainText('Keine Autoren für die Titelseite')
      // The preview renders the pages with the title page and the dedication.
      await expect(dialog.getByRole('img').first()).toBeVisible({ timeout: 60_000 })
    } finally {
      await app.close()
    }
  })
})
