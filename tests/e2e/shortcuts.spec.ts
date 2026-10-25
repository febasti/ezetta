import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { AUTOSAVE_SETTLE_MS, createSandbox, fileText, launchAt, MOD, quietFor } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const MAC = process.platform === 'darwin'
/** How the app writes a shortcut: ⌥⌘J on a Mac, Ctrl+Alt+J elsewhere. */
const keys = (key: string, options: { alt?: boolean; shift?: boolean } = {}): string =>
  MAC
    ? `${options.alt ? '⌥' : ''}${options.shift ? '⇧' : ''}⌘${key}`
    : `Ctrl+${options.alt ? 'Alt+' : ''}${options.shift ? 'Shift+' : ''}${key}`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [SHEET]: 'Ein Satz.#footnote[Eine Fußnote.]\n\nZweiter Absatz.\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Einstellungen' })
const row = (page: Page, name: string): Locator =>
  dialog(page)
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) })
/** The button with a command's shortcut: the last one of its row (a reset button comes before it). */
const shortcutOf = (page: Page, name: string): Locator => row(page, name).getByRole('button').last()
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('keybindings'))

async function openShortcuts(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+,`)
  await dialog(page).getByRole('tab', { name: 'Tastenkürzel' }).click()
}

/** Clicks a command's shortcut and presses the keys that become its new one. */
async function record(page: Page, name: string, combination: string): Promise<void> {
  await shortcutOf(page, name).click()
  await expect(shortcutOf(page, name)).toHaveText('Tasten drücken …')
  await page.keyboard.press(combination)
}

test('lists the commands by kind with the shortcuts they come with, and a search narrows them', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    await openShortcuts(page)
    await expect(dialog(page).getByRole('region', { name: 'Einfügen' })).toBeVisible()
    await expect(shortcutOf(page, 'Wichtig (fett)')).toHaveText(keys('B'))
    await expect(shortcutOf(page, 'Fußnote einfügen')).toHaveText(keys('F', { alt: true }))
    await expect(shortcutOf(page, 'Einstellungen …')).toHaveText(keys(','))
    // Commands without a shortcut can be given one.
    await expect(shortcutOf(page, 'Tabelle einfügen')).toHaveText('Kein Kürzel')

    // Actions nobody needs a key for are not actions at all any more.
    for (const name of [
      'Fußnoten: Randnotizen',
      'Abschnitt jetzt prüfen',
      'Vorlagen bearbeiten …',
      'Sprache: English',
      'Design: Dunkel',
      'Befehlspalette öffnen',
      'Zu Abschnitt springen …',
    ])
      await expect(row(page, name)).toHaveCount(0)

    await dialog(page).getByRole('searchbox', { name: 'Befehle suchen' }).fill('fußnote')
    await expect(row(page, 'Fußnote einfügen')).toBeVisible()
    await expect(row(page, 'Wichtig (fett)')).toHaveCount(0)
    await dialog(page).getByRole('searchbox', { name: 'Befehle suchen' }).fill('zzzz')
    await expect(dialog(page)).toContainText('Keine Befehle gefunden.')
  } finally {
    await app.close()
  }
})

test('a new shortcut for a text command works at once, the old one does not, and it is kept', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    await openShortcuts(page)
    await record(page, 'Wichtig (fett)', `${MOD}+Alt+j`)
    await expect(shortcutOf(page, 'Wichtig (fett)')).toHaveText(keys('J', { alt: true }))
    expect(JSON.parse((await stored(page))!)).toEqual({ 'editor-strong': { key: 'j', alt: true } })
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)

    // The editor is open while the shortcut changes; the new key works in it right away.
    await page.locator('.cm-content').getByText('Zweiter Absatz.').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press(`${MOD}+b`) // no longer bold: if it were, the next key would undo it
    await page.keyboard.press(`${MOD}+Alt+j`)
    await expect
      .poll(fileText(join(sandbox.projectDir, SHEET)))
      .toContain('\n\n*Zweiter Absatz.*\n')

    // The tooltip of the toolbar names the new key.
    await expect(page.locator('.toolbar').getByRole('button', { name: 'Wichtig' })).toHaveAttribute(
      'title',
      new RegExp(`\\(${keys('J', { alt: true })}\\)`),
    )

    // The reset button brings the default back, and with it the stored choice goes.
    await openShortcuts(page)
    await row(page, 'Wichtig (fett)')
      .getByRole('button', { name: /zurücksetzen/ })
      .click()
    await expect(shortcutOf(page, 'Wichtig (fett)')).toHaveText(keys('B'))
    expect(await stored(page)).toBeNull()
  } finally {
    await app.close()
  }
})

test('a combination another command has is taken over only when asked', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    await openShortcuts(page)
    // Option F belongs to the footnote.
    await record(page, 'Suchen', `${MOD}+Alt+f`)
    await expect(dialog(page)).toContainText(
      `${keys('F', { alt: true })} gehört schon zu „Fußnote einfügen“`,
    )
    await expect(shortcutOf(page, 'Suchen')).toHaveText(keys('F'))

    // Cancel: nothing changed.
    await dialog(page).getByRole('button', { name: 'Abbrechen' }).click()
    await expect(shortcutOf(page, 'Fußnote einfügen')).toHaveText(keys('F', { alt: true }))
    expect(await stored(page)).toBeNull()

    // Reassign: the footnote loses it, the search has it.
    await record(page, 'Suchen', `${MOD}+Alt+f`)
    await dialog(page).getByRole('button', { name: 'Neu zuweisen' }).click()
    await expect(shortcutOf(page, 'Suchen')).toHaveText(keys('F', { alt: true }))
    await expect(shortcutOf(page, 'Fußnote einfügen')).toHaveText('Kein Kürzel')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)

    // The key now finds, in the text, and does not insert a note.
    await page.locator('.cm-content').getByText('Zweiter Absatz.').click()
    await page.keyboard.press(`${MOD}+Alt+f`)
    await expect(page.getByRole('search')).toBeVisible()
    await quietFor(page, AUTOSAVE_SETTLE_MS)
    const text = await fileText(join(sandbox.projectDir, SHEET))()
    expect(text.match(/#footnote\[/g)).toHaveLength(1)

    // Reset all: both are as they came.
    await openShortcuts(page)
    await dialog(page).getByRole('button', { name: 'Alle zurücksetzen' }).click()
    await expect(shortcutOf(page, 'Suchen')).toHaveText(keys('F'))
    await expect(shortcutOf(page, 'Fußnote einfügen')).toHaveText(keys('F', { alt: true }))
    expect(await stored(page)).toBeNull()
  } finally {
    await app.close()
  }
})

test('the system’s own keys are refused, Backspace takes a shortcut off, and Esc leaves it', async () => {
  const { app, page } = await launchAt(sandbox)
  try {
    await openShortcuts(page)
    await record(page, 'Tabelle einfügen', `${MOD}+c`)
    await expect(dialog(page)).toContainText('vom System oder vom Editor belegt')
    // Still waiting for another combination.
    await expect(shortcutOf(page, 'Tabelle einfügen')).toHaveText('Tasten drücken …')
    await page.keyboard.press('Escape')
    await expect(shortcutOf(page, 'Tabelle einfügen')).toHaveText('Kein Kürzel')
    await expect(dialog(page)).toBeVisible()

    // Without ⌘ it is no shortcut.
    await shortcutOf(page, 'Tabelle einfügen').click()
    await page.keyboard.press('t')
    await expect(dialog(page)).toContainText('muss')
    await page.keyboard.press('Escape')

    // Backspace takes the shortcut off.
    await shortcutOf(page, 'Wichtig (fett)').click()
    await page.keyboard.press('Backspace')
    await expect(shortcutOf(page, 'Wichtig (fett)')).toHaveText('Kein Kürzel')
    expect(JSON.parse((await stored(page))!)).toEqual({ 'editor-strong': null })
  } finally {
    await app.close()
  }
})
