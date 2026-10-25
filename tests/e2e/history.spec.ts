import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, launchAt, MOD, openSheet } from './helpers'
import type { Sandbox } from './helpers'

// Several dialogs and restores in one test: more time than the default when the machine is busy.
test.describe.configure({ timeout: 60_000 })

const SHEET = 'content/methoden/design.typ'
const START = '= Design\n\nDas ist der erste Stand des Textes.\n'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: START })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8').catch(() => '')
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Versionen' })
const versions = (page: Page) => dialog(page).locator('.version')

async function open() {
  return launchAt(sandbox, 'methoden/design.typ')
}

/** Waits for the version the app takes when a project opens: the history starts from it. */
async function firstVersion(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await window.api.history.list({ limit: 5 })
        return result.ok ? result.value.versions.length : 0
      }),
    )
    .toBeGreaterThan(0)
}

async function openDialog(page: Page) {
  await page.getByRole('button', { name: 'Projektmenü' }).click()
  await page.getByRole('menuitem', { name: 'Versionen und Sicherung …' }).click()
  await expect(dialog(page)).toBeVisible()
}

test('versions are on by default: a first version is taken soon after the project opens, in a hidden folder', async () => {
  const { app, page } = await open()
  try {
    // The version store is hidden inside the project, and the project's own files are not touched.
    await expect
      .poll(() => existsSync(join(sandbox.projectDir, '.ezetta', 'history.git')))
      .toBe(true)
    await openDialog(page)
    await expect(dialog(page).getByLabel('Automatisch Versionen speichern')).toBeChecked()
    await expect(versions(page)).toHaveCount(1)
    await expect(versions(page).first()).toContainText('Automatisch gespeichert')
    // Nothing has changed since: every sheet is the same as now.
    await expect(dialog(page).getByText('genauso wie jetzt')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a named version, a change, and a restore that can itself be undone', async () => {
  const { app, page } = await open()
  try {
    await firstVersion(page)
    // Name the project as it is now.
    await openDialog(page)
    await dialog(page).getByRole('button', { name: 'Version speichern …' }).click()
    await dialog(page)
      .getByLabel(/Name der Version/)
      .fill('Erster Entwurf')
    await dialog(page).getByRole('button', { name: 'Speichern' }).click()
    await expect(versions(page).first()).toContainText('Erster Entwurf')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)

    // Write more: the editor saves, and the dialog flushes before it opens.
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Ein ganz neuer Satz.')
    await openDialog(page)
    await dialog(page).getByRole('button', { name: 'Version speichern …' }).click()
    await dialog(page)
      .getByLabel(/Name der Version/)
      .fill('Zweiter Entwurf')
    await dialog(page).getByRole('button', { name: 'Speichern' }).click()
    await expect(versions(page).first()).toContainText('Zweiter Entwurf')
    expect(await read()).toContain('Ein ganz neuer Satz.')

    // More text that is in no version yet.
    await page.keyboard.press('Escape')
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(' Und noch ein Satz.')
    await openDialog(page)

    // The first named version: the sheet as it was, compared with now.
    await versions(page).filter({ hasText: 'Erster Entwurf' }).click()
    await dialog(page).locator('.file').first().click()
    await expect(dialog(page).locator('.text .lost')).toContainText('Ein ganz neuer Satz.')
    await expect(dialog(page).getByText(/entfernt 8 Wörter/)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Diese Fassung wiederherstellen' }).click()
    await expect.poll(read).toBe(START)
    // The state before the restore is kept as a version (a "Vor einer Wiederherstellung" one, or an
    // automatic one that was taken just before), so the restore can be undone.
    await page.keyboard.press('Escape')
    await expect(page.locator('.cm-content')).not.toContainText('Ein ganz neuer Satz.')

    await openDialog(page)
    await versions(page).first().click()
    await dialog(page).locator('.file').first().click()
    await expect(dialog(page).locator('.text .back')).toContainText('Und noch ein Satz.')
    await dialog(page).getByRole('button', { name: 'Diese Fassung wiederherstellen' }).click()
    await expect.poll(read).toContain('Und noch ein Satz.')
  } finally {
    await app.close()
  }
})

test('a deleted sheet can be brought back', async () => {
  const { app, page } = await open()
  try {
    await firstVersion(page)
    await rm(join(sandbox.projectDir, SHEET))
    await openDialog(page)
    await dialog(page).getByRole('button', { name: 'Version speichern …' }).click()
    await dialog(page)
      .getByLabel(/Name der Version/)
      .fill('Ohne Design')
    await dialog(page).getByRole('button', { name: 'Speichern' }).click()
    await expect(versions(page).first()).toContainText('Ohne Design')
    // The version before the deletion has the sheet.
    await versions(page).filter({ hasText: 'Automatisch gespeichert' }).click()
    await expect(dialog(page).locator('.badge.deleted')).toHaveCount(1)
    await dialog(page).getByRole('button', { name: 'Abschnitt wiederherstellen' }).click()
    await expect.poll(read).toBe(START)
  } finally {
    await app.close()
  }
})

test('a sheet of the material is in the versions too, marked as material, and can be brought back', async () => {
  const MATERIAL_SHEET = 'material/Recherche/notiz.typ'
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: START,
    [MATERIAL_SHEET]: '= Notiz\n\nEine Notiz im Material.\n',
    'project.toml': '[project]\nversion = 1\ntitle = "Dissertation"\nlanguage = "de"\n',
  })
  const { app, page } = await open()
  try {
    await firstVersion(page)
    await rm(join(sandbox.projectDir, MATERIAL_SHEET))
    await openDialog(page)
    await dialog(page).getByRole('button', { name: 'Version speichern …' }).click()
    await dialog(page)
      .getByLabel(/Name der Version/)
      .fill('Ohne Notiz')
    await dialog(page).getByRole('button', { name: 'Speichern' }).click()
    await expect(versions(page).first()).toContainText('Ohne Notiz')
    await versions(page).filter({ hasText: 'Automatisch gespeichert' }).click()
    // The sheet is listed by its first line, with the word for where it is.
    const file = dialog(page).locator('.file').filter({ hasText: 'Notiz' })
    await expect(file).toContainText('Material')
    await file.click()
    await dialog(page).getByRole('button', { name: 'Abschnitt wiederherstellen' }).click()
    await expect
      .poll(() => readFile(join(sandbox.projectDir, MATERIAL_SHEET), 'utf8').catch(() => ''))
      .toContain('Eine Notiz im Material.')
  } finally {
    await app.close()
  }
})

test('versions can be turned off in the dialog, and the choice is kept in the project file', async () => {
  const { app, page } = await open()
  try {
    await openDialog(page)
    await dialog(page).getByLabel('Automatisch Versionen speichern').uncheck()
    await expect(dialog(page).getByRole('button', { name: 'Einschalten' })).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Version speichern …' })).toHaveCount(0)
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .toContain('enabled = false')
    await dialog(page).getByRole('button', { name: 'Einschalten' }).click()
    await expect(dialog(page).getByLabel('Automatisch Versionen speichern')).toBeChecked()
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .not.toContain('enabled = false')
  } finally {
    await app.close()
  }
})

test('the backup: not set up at first (the status bar says so), then a folder is chosen and a zip is made', async () => {
  const backupDir = join(sandbox.base, 'Sicherung')
  await mkdir(backupDir)
  const { app, page } = await launch(sandbox, { env: { EZETTA_TEST_BACKUP: backupDir } })
  try {
    await openSheet(page, 'methoden/design.typ')
    const indicator = page.locator('footer').getByRole('button', { name: /Nicht gesichert/ })
    await expect(indicator).toBeVisible()

    // The indicator opens the backup tab, which explains and offers the one step.
    await indicator.click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('tab', { name: 'Sicherung' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(dialog(page).getByText('Dein Projekt wird noch nicht gesichert.')).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Sicherungsordner wählen …' }).click()

    // The first backup is made at once, and shown.
    await expect(dialog(page).getByText(backupDir)).toBeVisible()
    await expect(dialog(page).locator('.files li')).toHaveCount(1)
    await expect(dialog(page).locator('.files li .title')).toContainText(/^Dissertation \d{4}-/)
    const [name] = await readdir(backupDir)
    expect(name).toMatch(/^Dissertation \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.zip$/)
    await expect(page.locator('footer').getByRole('button', { name: /Gesichert/ })).toBeVisible()
    await expect(indicator).toHaveCount(0)

    // "Jetzt sichern" makes another, even though nothing changed.
    await dialog(page).getByRole('button', { name: 'Jetzt sichern' }).click()
    await expect(page.getByText('Sicherung gemacht.')).toBeVisible()

    // Turning it off keeps the files and brings the nudge back.
    await dialog(page).getByRole('button', { name: 'Ausschalten' }).click()
    await expect(dialog(page).getByText('Dein Projekt wird noch nicht gesichert.')).toBeVisible()
    expect((await readdir(backupDir)).length).toBeGreaterThanOrEqual(1)
    await page.keyboard.press('Escape')
    await expect(
      page.locator('footer').getByRole('button', { name: /Nicht gesichert/ }),
    ).toBeVisible()
  } finally {
    await app.close()
  }
})

test('other files than sheets can be brought back, and so can the whole project at once', async () => {
  const { app, page } = await open()
  try {
    await firstVersion(page)
    await openDialog(page)
    await dialog(page).getByRole('button', { name: 'Version speichern …' }).click()
    await dialog(page)
      .getByLabel(/Name der Version/)
      .fill('Stand A')
    await dialog(page).getByRole('button', { name: 'Speichern' }).click()
    await expect(versions(page).first()).toContainText('Stand A')
    await page.keyboard.press('Escape')

    // Behind the app's back: a changed bibliography, a changed sheet and a new one.
    const bib = join(sandbox.projectDir, 'library.bib')
    await writeFile(bib, '@book{neu2026, author = {Neu, Anna}, title = {Neu}, year = {2026}}\n')
    await writeFile(join(sandbox.projectDir, SHEET), '= Design\n\nGanz anderer Text.\n')
    const fresh = join(sandbox.projectDir, 'content', 'methoden', 'neu.typ')
    await writeFile(fresh, '= Neu\n')

    await openDialog(page)
    await versions(page).filter({ hasText: 'Stand A' }).click()
    // The sheet and the bibliography are listed; the file path stands for a file that is not a sheet.
    await expect(dialog(page).locator('.file')).toHaveCount(2)
    await dialog(page).locator('.file', { hasText: 'library.bib' }).click()
    await expect(dialog(page).locator('.text .lost')).toContainText('@book{neu2026')

    // One file: the bibliography is back, the sheet is not.
    await dialog(page).getByRole('button', { name: 'Diese Fassung wiederherstellen' }).click()
    await expect.poll(() => readFile(bib, 'utf8')).toBe('')
    expect(await read()).toContain('Ganz anderer Text.')
    await expect(dialog(page).locator('.file')).toHaveCount(1)

    // Everything: the sheet is back too, and the new sheet stays (nothing is removed by default).
    await dialog(page)
      .getByRole('button', { name: /Die Datei zurückholen/ })
      .click()
    await expect(
      page.getByRole('alertdialog', { name: 'Alles aus dieser Version zurückholen?' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Zurückholen', exact: true }).click()
    await expect.poll(read).toBe(START)
    expect(await readFile(fresh, 'utf8')).toBe('= Neu\n')
    await expect(dialog(page).getByText('genauso wie jetzt')).toBeHidden()
    await expect(
      dialog(page).getByRole('button', { name: /(Alle \d+ Dateien|Die Datei) zurückholen/ }),
    ).toBeDisabled()
    // The new sheet is listed as new since, with the choice to remove it (not taken here).
    await expect(dialog(page).getByLabel(/Auch 1 Datei entfernen/)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a backup is restored with one click into a new folder, and opened', async () => {
  const backupDir = join(sandbox.base, 'Sicherung')
  const restoreDir = join(sandbox.base, 'Neuer Ort')
  await mkdir(backupDir)
  await mkdir(restoreDir)
  const { app, page } = await launch(sandbox, {
    env: { EZETTA_TEST_BACKUP: backupDir, EZETTA_TEST_RESTORE_TO: restoreDir },
  })
  try {
    await openSheet(page, 'methoden/design.typ')
    await page.getByRole('button', { name: 'Projektmenü' }).click()
    await page.getByRole('menuitem', { name: 'Versionen und Sicherung …' }).click()
    await dialog(page).getByRole('tab', { name: 'Sicherung' }).click()
    await dialog(page).getByRole('button', { name: 'Sicherungsordner wählen …' }).click()
    await expect(dialog(page).locator('.files li')).toHaveCount(1)

    await dialog(page).getByRole('button', { name: 'Als Projekt öffnen …' }).click()
    // The writer is told first what will happen to the project that is open, and can say no.
    const confirm = page.getByRole('alertdialog', { name: 'Sicherung als neues Projekt öffnen?' })
    await expect(confirm).toContainText('bleibt unverändert')
    await confirm.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(dialog(page)).toBeVisible()
    expect(await readdir(restoreDir)).toEqual([])
    await dialog(page).getByRole('button', { name: 'Als Projekt öffnen …' }).click()
    await confirm.getByRole('button', { name: 'Weiter' }).click()
    await expect(dialog(page)).toHaveCount(0)
    // And after: where it is, that the other project is as it was, and that the backup is set up anew.
    const notice = page.getByText(/Wiederhergestellt als neues Projekt in/)
    await expect(notice).toContainText(restoreDir)
    await expect(notice).toContainText('Dein bisheriges Projekt ist unverändert')
    await expect(notice).toContainText('eine eigene Sicherung einrichten')
    // The project is unpacked next to nothing else, under the name it had, with its sheets and its history.
    await expect.poll(() => readdir(restoreDir)).toEqual(['Dissertation'])
    const restored = join(restoreDir, 'Dissertation')
    expect(await readFile(join(restored, SHEET), 'utf8')).toBe(START)
    expect(existsSync(join(restored, '.ezetta'))).toBe(true)
    // It is the open project now, and the original is as it was.
    await openSheet(page, 'methoden/design.typ')
    await expect(page.locator('.cm-content')).toContainText('Das ist der erste Stand des Textes.')
    expect(await read()).toBe(START)
  } finally {
    await app.close()
  }
})

test.describe('the way back on a new computer', () => {
  test.skip(!existsSync('/usr/bin/zip'), 'needs the zip program to make an archive to restore')

  test('the welcome screen restores a backup file that is picked', async () => {
    const restoreDir = join(sandbox.base, 'Neuer Ort')
    await mkdir(restoreDir)
    // A backup as the app makes it: a zip of the project folder, in a folder named like the project.
    const zip = join(sandbox.base, 'Dissertation 2026-10-12 14.30.zip')
    await promisify(execFile)('/usr/bin/zip', ['-qr', zip, 'Dissertation'], { cwd: sandbox.base })
    const { app, page } = await launch(sandbox, {
      project: false,
      env: { EZETTA_TEST_RESTORE_ZIP: zip, EZETTA_TEST_RESTORE_TO: restoreDir },
    })
    try {
      await page.getByRole('button', { name: 'Wiederherstellen' }).click()
      await expect(page.getByText(/Wiederhergestellt in .*Neuer Ort/)).toBeVisible()
      await expect.poll(() => readdir(restoreDir)).toEqual(['Dissertation'])
      await openSheet(page, 'methoden/design.typ')
      await expect(page.locator('.cm-content')).toContainText('Das ist der erste Stand des Textes.')
    } finally {
      await app.close()
    }
  })
})
