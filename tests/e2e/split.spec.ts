import { chmod, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launchAt, MOD } from './helpers'
import type { Sandbox } from './helpers'

const DESIGN = 'content/methoden/design.typ'
const AUSWERTUNG = 'content/methoden/auswertung.typ'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [DESIGN]: '= Design\n\nDas Design der Studie.\n',
    [AUSWERTUNG]: '= Auswertung\n\nDie Auswertung folgt später.\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = (path: string) => () => readFile(join(sandbox.projectDir, path), 'utf8')

/** The pane read beside the editor. */
const side = (page: Page) => page.getByRole('region', { name: /nur zum Lesen/ })
/** The editor (the pane written in). */
const writing = (page: Page) => page.locator('.column:not(.read) .cm-content')

async function open() {
  const opened = await launchAt(sandbox, 'methoden/design.typ')
  // Option-click on a sheet reads it beside the one being written.
  await opened.page
    .locator('[role=option][data-path="methoden/auswertung.typ"]')
    .click({ modifiers: ['Alt'] })
  await expect(side(opened.page)).toContainText('Die Auswertung folgt später.')
  return opened
}

/** Clicks into the read-only pane, at the end of its text. */
async function activateSide(page: Page, text: string) {
  await side(page).locator('.cm-content').getByText(text).click()
}

test('a sheet opens beside the one being written, read-only, and closes again', async () => {
  const { app, page } = await open()
  try {
    await expect(side(page)).toContainText('Auswertung')
    await expect(side(page).locator('.cm-content')).toHaveAttribute('contenteditable', 'false')
    await expect(writing(page)).toContainText('Das Design der Studie.')
    // What is typed goes into the editor's sheet.
    await writing(page).getByText('Das Design der Studie.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Mehr.')
    await expect.poll(read(DESIGN)).toContain('Das Design der Studie. Mehr.')
    expect(await read(AUSWERTUNG)()).not.toContain('Mehr.')
    // The close button, and the command (Cmd+\) opens and closes it.
    await side(page).getByRole('button', { name: 'Nebenansicht schließen' }).click()
    await expect(side(page)).toHaveCount(0)
    await page.keyboard.press(`${MOD}+Backslash`)
    await expect(side(page)).toContainText('Design') // the editor's own sheet, a second time
    await page.keyboard.press(`${MOD}+Backslash`)
    await expect(side(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a click into the read-only pane moves the editor there, after the last keystrokes are saved', async () => {
  const { app, page } = await open()
  try {
    await writing(page).getByText('Das Design der Studie.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Schnell getippt.')
    // At once, before any autosave pause: the switch saves first.
    await activateSide(page, 'Die Auswertung folgt später.')
    await expect(writing(page)).toContainText('Die Auswertung folgt später.')
    expect(await read(DESIGN)()).toContain('Das Design der Studie. Schnell getippt.')
    // The panes traded places: the editor stands where the read-only pane was.
    await expect(page.locator('.panes')).toHaveClass(/reversed/)
    await expect(side(page)).toContainText('Schnell getippt.')
    // The caret is where the click was: typing lands in that sheet.
    await page.keyboard.press('End')
    await page.keyboard.type(' Neu.')
    await expect.poll(read(AUSWERTUNG)).toContain('Die Auswertung folgt später. Neu.')
  } finally {
    await app.close()
  }
})

test('coming back, a sheet keeps its undo history', async () => {
  const { app, page } = await open()
  try {
    await writing(page).getByText('Das Design der Studie.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Rückgängig machen.')
    await expect.poll(read(DESIGN)).toContain('Rückgängig machen.')
    await activateSide(page, 'Die Auswertung folgt später.')
    await expect(writing(page)).toContainText('Die Auswertung folgt später.')
    await activateSide(page, 'Rückgängig machen.')
    await expect(writing(page)).toContainText('Rückgängig machen.')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read(DESIGN)).toBe('= Design\n\nDas Design der Studie.\n')
  } finally {
    await app.close()
  }
})

test('a sheet changed on disk while it was read comes back as the file holds it, without the old history', async () => {
  const { app, page } = await open()
  try {
    await writing(page).getByText('Das Design der Studie.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Alter Stand.')
    await expect.poll(read(DESIGN)).toContain('Alter Stand.')
    await activateSide(page, 'Die Auswertung folgt später.')
    await expect(side(page)).toContainText('Alter Stand.')
    // Another program writes the sheet that is shown read-only now: the pane follows the file.
    await writeFile(join(sandbox.projectDir, DESIGN), '= Design\n\nVon außen geändert.\n')
    await expect(side(page)).toContainText('Von außen geändert.')
    // Back in the editor it is the file's text, and the kept history (made for the old text) is gone:
    // an undo cannot bring the old text back over the new one.
    await activateSide(page, 'Von außen geändert.')
    await expect(writing(page)).toContainText('Von außen geändert.')
    await page.keyboard.press(`${MOD}+z`)
    await page.keyboard.type('x')
    await expect.poll(read(DESIGN)).toContain('Von außen geändert.')
    expect(await read(DESIGN)()).not.toContain('Alter Stand.')
  } finally {
    await app.close()
  }
})

test('the same sheet in both panes: the read-only one follows the typing', async () => {
  const { app, page } = await launchAt(sandbox, 'methoden/design.typ')
  try {
    await page.keyboard.press(`${MOD}+Backslash`)
    await expect(side(page)).toContainText('Das Design der Studie.')
    await writing(page).getByText('Das Design der Studie.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Gleich daneben.')
    await expect(side(page)).toContainText('Gleich daneben.')
    // Switching between two views of one sheet keeps its text and its history.
    await activateSide(page, 'Gleich daneben.')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read(DESIGN)).toBe('= Design\n\nDas Design der Studie.\n')
  } finally {
    await app.close()
  }
})

test("the sheet menu reads a sheet beside, and when the editor's sheet is deleted the other takes its place", async () => {
  const { app, page } = await launchAt(sandbox, 'methoden/design.typ')
  try {
    await page
      .locator('[role=option][data-path="methoden/auswertung.typ"]')
      .click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Daneben öffnen' }).click()
    await expect(side(page)).toContainText('Die Auswertung folgt später.')
    await page.locator('[role=option][data-path="methoden/design.typ"]').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'In den Papierkorb legen' }).click()
    await page.getByRole('button', { name: 'In den Papierkorb', exact: true }).click()
    await expect(side(page)).toHaveCount(0)
    await expect(writing(page)).toContainText('Die Auswertung folgt später.')
  } finally {
    await app.close()
  }
})

test('when the text cannot be saved, the editor stays where it is', async () => {
  // A folder that cannot be written: a test of permissions, which Windows does not have this way.
  test.skip(process.platform === 'win32', 'folder permissions')
  const { app, page } = await open()
  const folder = join(sandbox.projectDir, 'content', 'methoden')
  try {
    await chmod(folder, 0o555)
    await writing(page).getByText('Das Design der Studie.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Nicht zu sichern.')
    await activateSide(page, 'Die Auswertung folgt später.')
    await expect(page.getByText('Der Text konnte nicht gesichert werden.')).toBeVisible()
    // Nothing moved: the unsaved text is still in the editor, and the other sheet is still read.
    await expect(writing(page)).toContainText('Nicht zu sichern.')
    await expect(side(page)).toContainText('Die Auswertung folgt später.')
    await expect(page.locator('.panes')).not.toHaveClass(/reversed/)
    // Once it can be written again, the text arrives.
    await chmod(folder, 0o755)
    await activateSide(page, 'Die Auswertung folgt später.')
    await expect.poll(read(DESIGN)).toContain('Nicht zu sichern.')
  } finally {
    await chmod(folder, 0o755)
    await app.close()
  }
})
