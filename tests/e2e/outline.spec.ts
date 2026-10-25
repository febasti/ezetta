import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, MOD } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    'content/methoden/design.typ':
      '= Methoden\n\nText.\n\n== Design\n\nMehr.\n\n==== Zu tief\n\nNoch mehr.\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

/** The switch at the top of the sidebar (beside + of the groups column). */
const toggle = (page: Page) =>
  page
    .getByRole('region', { name: 'Gruppen' })
    .getByRole('button', { name: 'Gliederung', exact: true })
const pane = (page: Page) => page.getByRole('region', { name: 'Gliederung' })

test('the Gliederung lists the headings of the project, numbered, and a click opens the sheet there', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await toggle(page).click()
    // It takes the place of the two columns.
    await expect(page.getByRole('tree', { name: /Gruppen/ })).toHaveCount(0)
    await expect(pane(page)).toBeVisible()

    // The headings in export order, numbered as the export's template does, each with its level.
    const rows = pane(page).locator('.outline [role=button]')
    await expect(rows.filter({ hasText: 'Methoden' }).first()).toContainText('2')
    await expect(rows.filter({ hasText: 'Design' }).first()).toContainText('2.1')
    // A heading that skips a level is flagged, and the header counts it.
    const deep = rows.filter({ hasText: 'Zu tief' })
    await expect(deep.locator('[aria-label^="Ebene übersprungen"]')).toHaveCount(1)
    await expect(pane(page)).toContainText('1 übersprungene Ebene')

    // A click opens the sheet with the cursor on the heading's line.
    await rows.filter({ hasText: 'Design' }).first().click()
    await expect(page.locator('.cm-content')).toContainText('Design')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const node = window.getSelection()?.anchorNode
          const element = node instanceof Element ? node : node?.parentElement
          return element?.closest('.cm-line')?.textContent ?? ''
        }),
      )
      .toContain('Design')

    // The groups button brings the columns back.
    await page.locator('.toolbar').getByRole('button', { name: 'Gruppen', exact: true }).click()
    await expect(pane(page)).toHaveCount(0)
    await expect(toggle(page)).toBeVisible()
    // Cmd+3 switches it too, and its close button goes back.
    await page.keyboard.press(`${MOD}+3`)
    await expect(pane(page)).toBeVisible()
    await pane(page).getByRole('button', { name: 'Gliederung ein-/ausblenden' }).click()
    await expect(pane(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})
