import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { AUTOSAVE_SETTLE_MS, createSandbox, launchAt, MOD, quietFor } from './helpers'
import type { Sandbox } from './helpers'

// The menu bar is macOS's; the other platforms have none.
test.skip(process.platform !== 'darwin', 'the menu bar is macOS only')

const SHEET = 'content/methoden/design.typ'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: '= Methoden\n\nEin Wort hier.\n' })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

interface Item {
  id: string
  label: string
  enabled: boolean
  checked: boolean
  accelerator: string | null
}

/** The menu bar as Electron has it: the top labels, and an item by its command's id. */
const tops = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) ?? [])
const item = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, id): Item | null => {
    const found = Menu.getApplicationMenu()?.getMenuItemById(id)
    if (!found) return null
    return {
      id,
      label: found.label,
      enabled: found.enabled,
      checked: found.checked,
      accelerator: found.accelerator ?? null,
    }
  }, id)
/** Chooses an item, as a click in the menu bar does. */
const choose = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.click(), id)

test('the menu bar has the menus of a Mac app, in the app’s language, with the shortcuts', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    await expect
      .poll(() => tops(app))
      .toEqual([
        'Ezetta',
        'Ablage',
        'Bearbeiten',
        'Format',
        'Einfügen',
        'Darstellung',
        'Fenster',
        'Hilfe',
      ])
    expect(await item(app, 'editor-strong')).toMatchObject({
      enabled: true,
      accelerator: 'CmdOrCtrl+B',
    })
    expect(await item(app, 'newSheet')).toMatchObject({ accelerator: 'CmdOrCtrl+N' })
    expect(await item(app, 'toggleGroups')).toMatchObject({ label: 'Gruppen', checked: true })

    // The language of the app is the menu's too (the settings, opened from the menu).
    await choose(app, 'settings')
    const settings = page.getByRole('dialog', { name: 'Einstellungen' })
    await settings.getByLabel('Sprache').selectOption('en')
    await expect.poll(() => tops(app)).toContain('File')
    expect(await item(app, 'toggleGroups')).toMatchObject({ label: 'Groups' })
  } finally {
    await app.close()
  }
})

test('an item does what its command does, and its check mark follows', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    const groups = page.getByRole('region', { name: 'Gruppen' })
    await expect(groups).toBeVisible()
    await expect.poll(async () => (await item(app, 'toggleGroups'))?.checked).toBe(true)
    await choose(app, 'toggleGroups')
    await expect(groups).toBeHidden()
    await expect.poll(async () => (await item(app, 'toggleGroups'))?.checked).toBe(false)

    // A text command works on the selection in the sheet.
    await page.locator('.cm-content').getByText('Ein Wort hier.').click()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Shift+Alt+ArrowLeft')
    await choose(app, 'editor-strong')
    await expect.poll(read).toContain('Ein Wort *hier*.')

    // Undo in the menu is the editor's own.
    await choose(app, 'menu-undo')
    await expect.poll(read).toContain('Ein Wort hier.')
  } finally {
    await app.close()
  }
})

test('text commands are not enabled without a sheet, and leave a dialog’s field alone', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    // With the find bar's field focused, Bold from the menu does nothing to the sheet.
    await page.locator('.cm-content').getByText('Ein Wort hier.').click()
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.press(`${MOD}+f`)
    await expect(page.getByPlaceholder('Suchen')).toBeFocused()
    await choose(app, 'editor-strong')
    await quietFor(page, AUTOSAVE_SETTLE_MS)
    expect(await read()).toBe('= Methoden\n\nEin Wort hier.\n')

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Projektmenü' }).click()
    await page.getByRole('menuitem', { name: 'Projekt schließen' }).click()
    await expect.poll(async () => (await item(app, 'editor-strong'))?.enabled).toBe(false)
    await expect.poll(async () => (await item(app, 'closeProject'))?.enabled).toBe(false)
  } finally {
    await app.close()
  }
})
