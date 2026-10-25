import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, MOD, openSheet } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox()
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const panel = (page: Page) => page.getByRole('tabpanel', { name: /Statistik/ })

async function open() {
  const { app, page } = await launch(sandbox)
  await openSheet(page, 'methoden/design.typ')
  await page.getByRole('button', { name: 'Seitenleiste', exact: true }).click()
  await page.getByRole('tab', { name: 'Statistik' }).click()
  return { app, page }
}

test('the Statistik tab counts the open sheet, the group, and the project', async () => {
  const { app, page } = await open()
  try {
    const sheet = panel(page).getByRole('region', { name: 'Dieser Abschnitt' })
    await expect(sheet).toContainText('13 Wörter')
    // The sheet has a goal of 1.200 words.
    await expect(sheet.getByRole('progressbar')).toBeVisible()
    await expect(sheet).toContainText('von 1.200')
    await expect(panel(page).getByRole('region', { name: 'Gruppe' })).toContainText('24 Wörter')
    const whole = panel(page).getByRole('region', { name: 'Projekt' })
    // The note sheet is not in the export and is not counted.
    await expect(whole).toContainText('36 Wörter')
    await expect(whole).toContainText('von 80.000')
    await expect(whole).toContainText('Überarbeitet')
    await expect(whole).toContainText('Nicht im Export')
  } finally {
    await app.close()
  }
})

test('the sheet count follows what is typed', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(' Eins zwei drei vier.')
    await expect(panel(page).getByRole('region', { name: 'Dieser Abschnitt' })).toContainText(
      '17 Wörter',
    )
  } finally {
    await app.close()
  }
})
