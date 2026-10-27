import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, MOD, TO_END } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox()
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const group = (page: Page, path: string) => page.locator(`[role=treeitem][data-path="${path}"]`)
const row = (page: Page, path: string) => page.locator(`[role=option][data-path="${path}"]`)
const read = (path: string) => readFile(join(sandbox.projectDir, path), 'utf8')

async function openSheet(page: Page, groupPath: string, sheetPath: string): Promise<void> {
  await group(page, groupPath).click()
  await row(page, sheetPath).click()
  await expect(page.locator('.cm-content')).toBeVisible()
}

test('opens the last project with groups, sheets, status, counts, and export marks', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await expect(group(page, 'methoden')).toBeVisible()
    await expect(group(page, 'methoden/daten')).toBeVisible()
    // A folder that was marked "not in the export" is in the material, under its own heading.
    const material = page.getByRole('group', { name: 'Material' })
    await expect(material.locator('[role=treeitem][data-path=":material/notizen"]')).toBeVisible()
    await expect(group(page, 'notizen')).toHaveCount(0)
    await group(page, 'methoden').click()
    await expect(row(page, 'methoden/design.typ')).toContainText('Design')
    await expect(row(page, 'methoden/design.typ').locator('.dot')).toHaveClass(/revised/)
    await expect(row(page, 'methoden/design.typ')).toContainText('Das Design der Studie')
    await expect(page.getByText('Projekt: 36 von 80.000')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a group is edited in one popover: its symbol, the colour, and its name', async () => {
  const { app, page } = await launch(sandbox)
  const popover = page.getByRole('dialog', { name: 'Gruppe bearbeiten' })
  const symbol = (path: string) => group(page, path).locator('.folder svg')
  const openEditor = async (path: string) => {
    await group(page, path).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Bearbeiten …' }).click()
    await expect(popover).toBeVisible()
  }
  try {
    await openEditor('methoden')
    // It sits in the middle of the window, and the name is ready to type in.
    const box = (await popover.boundingBox())!
    const view =
      page.viewportSize() ??
      (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(2)
    expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(2)
    await expect(popover.getByLabel('Name')).toBeFocused()
    // Symbol and colour apply at once.
    await popover.getByRole('button', { name: 'Experiment' }).click()
    await expect(symbol('methoden')).toHaveClass(/tabler-icon-flask/)
    await popover.getByRole('radio', { name: 'Blau' }).click()
    await expect(popover.getByRole('radio', { name: 'Blau' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(group(page, 'methoden').locator('.folder-icon')).toHaveAttribute(
      'style',
      /--color-tag-blue/,
    )
    await expect.poll(() => read('project.toml')).toMatch(/icon = "flask"\s+color = "blue"/)

    // Numbers and letters are there, and the search finds them; the name typed so far stays.
    await popover.getByLabel('Name').fill('Methodik')
    await popover.getByRole('searchbox').fill('Zahl 3')
    await expect(popover.getByRole('button', { name: 'Zahl 3', exact: true })).toBeVisible()
    await expect(popover.getByRole('button', { name: 'Experiment' })).toHaveCount(0)
    await popover.getByRole('button', { name: 'Zahl 3', exact: true }).click()
    await expect(symbol('methoden')).toHaveClass(/tabler-icon-square-number-3/)
    await popover.getByRole('searchbox').fill('Buchstabe B')
    await expect(popover.getByRole('button', { name: 'Buchstabe B' })).toBeVisible()

    // The name applies with Enter: the folder is renamed, and keeps its symbol and colour.
    await expect(popover.getByLabel('Name')).toHaveValue('Methodik')
    await popover.getByLabel('Name').press('Enter')
    await expect(popover).toBeHidden()
    await expect(symbol('Methodik')).toHaveClass(/tabler-icon-square-number-3/)
    await expect
      .poll(() => read('project.toml'))
      .toMatch(/\[items\.Methodik\]\s+icon = "square-number-3"\s+color = "blue"/)

    // Escape keeps the old name; the plain folder and grey go back to nothing stored.
    await openEditor('Methodik')
    await popover.getByLabel('Name').fill('Anders')
    await popover.getByRole('button', { name: 'Ordner', exact: true }).click()
    await popover.getByRole('radio', { name: 'Grau' }).click()
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(group(page, 'Methodik')).toBeVisible()
    await expect(symbol('Methodik')).toHaveClass(/tabler-icon-folder\b/)
    await expect.poll(() => read('project.toml')).not.toContain('[items.Methodik]')

    // The × closes it like a click outside: the name typed applies.
    await openEditor('Methodik')
    await popover.getByLabel('Name').fill('Methode')
    await popover.getByRole('button', { name: 'Schließen' }).click()
    await expect(popover).toBeHidden()
    await expect(group(page, 'Methode')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('typing is saved to disk, and text typed just before quitting is flushed', async () => {
  const { app, page } = await launch(sandbox)
  await openSheet(page, 'methoden', 'methoden/auswertung.typ')
  await page.locator('.cm-content').click()
  await page.keyboard.press(TO_END)
  await page.keyboard.type(' Größe, Äpfel, Übung, Maß.')
  await expect
    .poll(() => read('content/methoden/auswertung.typ'))
    .toBe('Die Auswertung folgt später.\n Größe, Äpfel, Übung, Maß.')

  // Quit inside the autosave delay: the flush on close must still write it.
  await page.keyboard.type(' Letzter Satz.')
  await app.close()
  expect(await read('content/methoden/auswertung.typ')).toContain('Letzter Satz.')
})

test('creates a sheet with a generated file name, shown by its first lines, and records order', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'einleitung').click()
    await page.getByRole('button', { name: 'Neuer Abschnitt' }).click()
    // An empty sheet opens, ready to type in, with nothing to name.
    const created = page.locator('[role=option][data-path^="einleitung/s-"]')
    await expect(created).toHaveCount(1)
    await expect(created).toContainText('Leerer Abschnitt')
    await expect(page.getByRole('textbox', { name: 'Umbenennen' })).toHaveCount(0)
    const path = (await created.getAttribute('data-path'))!
    expect(path).toMatch(/^einleitung\/s-[a-z0-9]{6}\.typ$/)
    expect(await read(`content/${path}`)).toBe('')
    expect(await read('project.toml')).toContain(`"${path.split('/')[1]}"`)
    await expect(page.locator('.cm-content')).toBeFocused()

    // The first lines are the sheet's name in the list: a heading is bold, the text follows.
    await page.keyboard.type('= Forschungsfrage\n\nWas erklärt den Unterschied?')
    await expect(created.locator('.sheet-heading')).toHaveText('Forschungsfrage')
    await expect(created.locator('.sheet-text')).toHaveText('Was erklärt den Unterschied?')
    await expect.poll(() => read(`content/${path}`)).toContain('= Forschungsfrage')
    // There is no way to rename it, and the file keeps its name.
    await created.press('F2')
    await expect(page.getByRole('textbox', { name: 'Umbenennen' })).toHaveCount(0)
    await expect(created).toHaveAttribute('data-path', path)
  } finally {
    await app.close()
  }
})

test('keeps typing in a sheet going to its file when its group is renamed', async () => {
  const { app, page } = await launch(sandbox)
  await openSheet(page, 'methoden', 'methoden/design.typ')
  await group(page, 'methoden').press('F2')
  const input = page.getByRole('textbox', { name: 'Umbenennen' })
  await input.fill('verfahren')
  await input.press('Enter')
  await expect(row(page, 'verfahren/design.typ')).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.press(TO_END)
  await page.keyboard.type('Nachtrag.')
  await expect.poll(() => read('content/verfahren/design.typ')).toContain('Nachtrag.')
  await app.close()
})

test('moves a sheet into another group by drag and drop, and reorders sheets', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'methoden').click()
    await row(page, 'methoden/auswertung.typ').dragTo(group(page, 'einleitung'))
    await expect(row(page, 'methoden/auswertung.typ')).toHaveCount(0)
    expect(await read('content/einleitung/auswertung.typ')).toContain('Auswertung')
    await expect(group(page, 'einleitung')).toContainText('2')

    // Reorder inside a folder: drop "design" below "interviews"'s section start, i.e. move it to
    // the end of its own folder by dropping it on the lower half of the last row of "daten".
    const interviews = row(page, 'methoden/daten/interviews.typ')
    const box = (await interviews.boundingBox())!
    await row(page, 'methoden/design.typ').dragTo(interviews, {
      targetPosition: { x: box.width / 2, y: 2 },
    })
    // Dropping on a row of another folder moves the sheet into that folder, before that row.
    await expect
      .poll(async () =>
        (await read('project.toml'))
          .match(/^"?methoden\/daten"? = \[([^\]]*)\]/m)?.[1]
          ?.replaceAll(/\s+/g, ' ')
          .trim(),
      )
      .toBe('"design.typ", "interviews.typ", "dokumente.typ"')
    expect(await read('content/methoden/daten/design.typ')).toContain('Design')
  } finally {
    await app.close()
  }
})

test('a parent group lists its own sheets and those of all subgroups, with headings', async () => {
  const { app, page } = await launch(sandbox)
  try {
    const paths = () =>
      page
        .locator('[role=option]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-path')))
    await group(page, 'methoden').click()
    await expect
      .poll(paths)
      .toEqual([
        'methoden/design.typ',
        'methoden/daten/interviews.typ',
        'methoden/daten/dokumente.typ',
        'methoden/auswertung.typ',
      ])
    // Headings tell the folders apart: none for the first own sheet, one for the subgroup, one when
    // the group's own sheets continue after it.
    await expect(page.locator('.heading')).toHaveText(['daten', 'methoden'])

    await group(page, '').click()
    // The material is not part of it.
    await expect(page.locator('[role=option]')).toHaveCount(5)
    // Headings are paths relative to the selected group.
    await expect(page.locator('.heading')).toHaveText([
      /^\s*einleitung$/,
      /^\s*methoden$/,
      /^\s*methoden › daten$/,
      /^\s*methoden$/,
    ])

    // A heading jumps into that group.
    await page.locator('.heading', { hasText: 'methoden › daten' }).click()
    await expect
      .poll(paths)
      .toEqual(['methoden/daten/interviews.typ', 'methoden/daten/dokumente.typ'])
    await expect(page.locator('.heading')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

const flowText = (page: Page) => page.locator('[data-testid=flow] .cm-content')

test('selecting a group shows its sheets as one continuous read-only document', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'methoden').click()
    const flow = flowText(page)
    await expect(flow).toContainText('Das Design der Studie')
    // A separator for each sheet with its word count; the text shows its own headings.
    await expect(page.locator('.cm-sheet-heading')).toHaveCount(4)
    await expect(page.locator('.cm-sheet-heading-meta').first()).toContainText('Wörter')
    // One document, in sheet order, one after the other.
    const text = await flow.innerText()
    const order = ['Das Design', 'Zwölf Interviews', 'Dokumente wurden', 'Die Auswertung']
    expect(order.map((t) => text.indexOf(t))).toEqual(
      [...order.map((t) => text.indexOf(t))].sort((a, b) => a - b),
    )
    expect(order.every((t) => text.includes(t))).toBe(true)
    await expect(page.getByText('4 Abschnitte · 24 Wörter')).toBeVisible()

    // Read-only: typing changes nothing, on screen or on disk.
    await expect(flow).toHaveAttribute('contenteditable', 'false')
    await flow.press('x').catch(() => undefined)
    await page.keyboard.type('Nope')
    expect(await read('content/methoden/design.typ')).not.toContain('Nope')
    await expect(flow).not.toContainText('Nope')
  } finally {
    await app.close()
  }
})

test('a group in the continuous view leaves out its scratchpads, a chosen one is shown', async () => {
  const toml = join(sandbox.projectDir, 'project.toml')
  await writeFile(
    toml,
    `${await readFile(toml, 'utf8')}\n[items."methoden/auswertung.typ"]\nexport = false\n`,
  )
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'methoden').click()
    await expect(flowText(page)).toContainText('Das Design der Studie')
    await expect(page.locator('.cm-sheet-heading')).toHaveCount(3)
    await expect(flowText(page)).not.toContainText('Die Auswertung')
    // Chosen by hand, the scratchpad is shown.
    await row(page, 'methoden/design.typ').click()
    await row(page, 'methoden/auswertung.typ').click({ modifiers: [MOD] })
    await expect(page.locator('.cm-sheet-heading')).toHaveCount(2)
    await expect(flowText(page)).toContainText('Die Auswertung')
  } finally {
    await app.close()
  }
})

test('clicking into the continuous view opens that sheet with the cursor at the spot', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'methoden').click()
    await expect(flowText(page)).toContainText('Zwölf Interviews')
    const line = flowText(page).locator('.cm-line', { hasText: 'Zwölf Interviews' })
    const box = (await line.boundingBox())!
    await line.click({ position: { x: box.width - 2, y: box.height / 2 } }) // end of the line
    await expect(page.locator('[data-testid=flow]')).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('Zwölf Interviews wurden geführt.')
    await page.keyboard.type('!')
    await expect
      .poll(() => read('content/methoden/daten/interviews.typ'))
      .toBe('Zwölf Interviews wurden geführt.!\n')
  } finally {
    await app.close()
  }
})

test('selecting several sheets with Cmd shows just those, one sheet alone opens the editor', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'methoden').click()
    await row(page, 'methoden/design.typ').click()
    await expect(page.locator('[data-testid=flow]')).toHaveCount(0) // a single sheet edits
    await row(page, 'methoden/auswertung.typ').click({ modifiers: [MOD] })
    await expect(page.locator('.cm-sheet-heading')).toHaveCount(2)
    await expect(flowText(page)).not.toContainText('Zwölf Interviews')
    await row(page, 'methoden/design.typ').click({ modifiers: [MOD] }) // deselect one: one left
    await expect(page.locator('[data-testid=flow]')).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('Die Auswertung folgt')
  } finally {
    await app.close()
  }
})

test('text typed just before switching to the continuous view is shown in it', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await openSheet(page, 'methoden', 'methoden/auswertung.typ')
    await page.locator('.cm-content').click()
    await page.keyboard.press(TO_END)
    await page.keyboard.type(' Frisch getippt.')
    await group(page, 'methoden').click() // within the autosave delay
    await expect(flowText(page)).toContainText('Frisch getippt.')
    expect(await read('content/methoden/auswertung.typ')).toContain('Frisch getippt.')
  } finally {
    await app.close()
  }
})

test('the continuous view follows changes made outside the app', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, '').click()
    await expect(flowText(page)).toContainText('Zwölf Interviews')
    await writeFile(
      join(sandbox.projectDir, 'content/methoden/daten/interviews.typ'),
      'Ganz neu von außen.\n',
    )
    await expect(flowText(page)).toContainText('Ganz neu von außen.')
    await expect(flowText(page)).not.toContainText('Zwölf Interviews')
  } finally {
    await app.close()
  }
})

test('renames the project from the project menu, without renaming its folder', async () => {
  const { app, page } = await launch(sandbox)
  try {
    // The top row stands for all the sheets and has no name of its own to change.
    await expect(group(page, '')).toContainText('Alle Abschnitte')
    await group(page, '').press('F2')
    await expect(page.getByRole('textbox', { name: 'Umbenennen' })).toHaveCount(0)
    await expect(page.locator('.project-name')).toHaveText('Dissertation')

    await page.locator('.project').click()
    await page.getByRole('menuitem', { name: /Projekt umbenennen/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('textbox')).toHaveValue('Dissertation')
    await dialog.getByRole('textbox').fill('Meine Doktorarbeit')
    await dialog.getByRole('textbox').press('Enter')
    await expect(page.locator('.project-name')).toHaveText('Meine Doktorarbeit')
    expect(await read('project.toml')).toContain('title = "Meine Doktorarbeit"')
    expect(await read('content/einleitung/einleitung.typ')).toContain('Einleitung') // nothing moved
  } finally {
    await app.close()
  }
})

test('shows an external change to the open sheet, and external renames as missing plus new', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await openSheet(page, 'methoden', 'methoden/auswertung.typ')
    await writeFile(
      join(sandbox.projectDir, 'content/methoden/auswertung.typ'),
      'Von außen geändert.\n',
    )
    await expect(page.locator('.cm-content')).toContainText('Von außen geändert.')

    await rename(
      join(sandbox.projectDir, 'content/methoden/design.typ'),
      join(sandbox.projectDir, 'content/methoden/entwurf.typ'),
    )
    await expect(row(page, 'methoden/design.typ')).toContainText('Fehlt')
    await expect(row(page, 'methoden/entwurf.typ')).toBeVisible()
    // Relink repairs it and keeps status and position.
    await row(page, 'methoden/design.typ').click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Neu verknüpfen mit „entwurf“/ }).click()
    await expect(row(page, 'methoden/design.typ')).toHaveCount(0)
    await expect(row(page, 'methoden/entwurf.typ').locator('.dot')).toHaveClass(/revised/)
  } finally {
    await app.close()
  }
})

test('warns instead of overwriting when the open sheet has unsaved edits and changes on disk', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await openSheet(page, 'methoden', 'methoden/auswertung.typ')
    await page.locator('.cm-content').click()
    await page.keyboard.type('Meins ')
    await writeFile(join(sandbox.projectDir, 'content/methoden/auswertung.typ'), 'Fremd.\n')
    await expect(page.getByRole('alert')).toContainText('außerhalb der App geändert')
    await page.getByRole('button', { name: 'Neu laden' }).click()
    await expect(page.locator('.cm-content')).toContainText('Fremd.')
    await expect(page.locator('.cm-content')).not.toContainText('Meins')
  } finally {
    await app.close()
  }
})

test('survives a broken project.toml without overwriting it', async () => {
  await writeFile(join(sandbox.projectDir, 'project.toml'), '[project\n')
  const { app, page } = await launch(sandbox)
  try {
    await expect(page.getByRole('button', { name: 'Erstellen', exact: true })).toBeVisible()
    expect(await read('project.toml')).toBe('[project\n')
  } finally {
    await app.close()
  }
})

test('the welcome screen shows at every start, and the last project reopens only when the writer asks for it', async () => {
  await mkdir(sandbox.userData, { recursive: true })
  const { app, page } = await launch(sandbox, { project: false })
  // The folder dialog is native; drive the same code path through the host with an explicit path.
  const result = await page.evaluate(
    (path) => window.api.project.openRecent({ path }),
    sandbox.projectDir,
  )
  expect(result).toMatchObject({ ok: true })
  expect(await page.evaluate(() => window.api.app.launchBehavior({}))).toMatchObject({
    ok: true,
    value: { reopenLast: false },
  })
  await app.close()

  // The default: the welcome screen, with the project among the recent ones.
  const second = await launch(sandbox, { project: false })
  try {
    await expect(second.page.getByRole('navigation', { name: 'Zuletzt geöffnet' })).toBeVisible()
    await expect(group(second.page, 'methoden')).toHaveCount(0)
    // The writer switches it on in the settings (General tab).
    await second.page.keyboard.press(`${MOD}+,`)
    await second.page.getByRole('radio', { name: 'Letztes Projekt öffnen' }).click()
    await expect
      .poll(() => readFile(join(sandbox.userData, 'settings.json'), 'utf8'))
      .toContain('"reopenLast": true')
  } finally {
    await second.app.close()
  }

  const third = await launch(sandbox, { project: false })
  try {
    await expect(group(third.page, 'methoden')).toBeVisible() // reopened from recent projects
  } finally {
    await third.app.close()
  }
})

test('a sheet that is left out of the export is a scratchpad in its place, without a status', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, 'methoden').click()
    const sheet = row(page, 'methoden/auswertung.typ')
    await expect(sheet.locator('.dot')).toHaveCount(1)
    await sheet.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Als Notizblatt markieren' }).click()
    // Still in the list of its folder, marked as a scratchpad, with no status and no status in the menu.
    await expect(sheet).toHaveClass(/scratch/)
    await expect(sheet).toContainText('Notizblatt')
    await expect(sheet.locator('.dot')).toHaveCount(0)
    await sheet.click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: /Status/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'In den Export aufnehmen' })).toBeVisible()
    await page.keyboard.press('Escape')
    // The badge in the text says so, too, instead of a status.
    await sheet.click()
    const badge = page.getByRole('group', { name: 'Status und Wörter' })
    await expect(badge).toContainText('Notizblatt')
    await expect(badge.getByText('Entwurf')).toHaveCount(0)
    // And back into the export.
    await sheet.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'In den Export aufnehmen' }).click()
    await expect(sheet.locator('.dot')).toHaveCount(1)
  } finally {
    await app.close()
  }
})

test('the sheets of an excluded folder are listed with it and not under the whole project', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await group(page, '').click()
    await expect(row(page, ':material/notizen/ideen.typ')).toHaveCount(0)
    await group(page, ':material/notizen').click()
    await expect(row(page, ':material/notizen/ideen.typ')).toBeVisible()
    // Taking a folder out of the export moves it into the material; bringing it back moves it in.
    await group(page, 'methoden').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'In das Material verschieben' }).click()
    await expect(
      page.getByRole('group', { name: 'Material' }).locator('[data-path=":material/methoden"]'),
    ).toBeVisible()
    await group(page, ':material/methoden').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'In den Export aufnehmen' }).click()
    await expect(
      page.getByRole('group', { name: 'Material' }).locator('[data-path=":material/methoden"]'),
    ).toHaveCount(0)
  } finally {
    await app.close()
  }
})

const PLAIN_MANIFEST = `[project]
version = 1
title = "Dissertation"
language = "de"

[order]
"" = ["einleitung", "methoden"]
`

test('the material is made on demand, and its folders stand side by side', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({ 'project.toml': PLAIN_MANIFEST })
  const { app, page } = await launch(sandbox)
  try {
    const material = page.getByRole('group', { name: 'Material' })
    // Without material there is no section and no button for it.
    await expect(material).toHaveCount(0)
    await expect(page.locator('.drop-zone')).toHaveCount(0)
    // The first folder comes from the menu of the whole project.
    await group(page, '').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Neuer Ordner im Material' }).click()
    const name = page.getByRole('textbox', { name: 'Umbenennen' })
    await name.fill('Recherche')
    await name.press('Enter')
    await expect(material.locator('[role=treeitem]')).toHaveCount(1)
    // More at the same level: from the menu of the heading.
    await material.locator('.material-heading').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Neuer Ordner im Material' }).click()
    await name.fill('Interviews')
    await name.press('Enter')
    const rows = material.locator('[role=treeitem]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toHaveAttribute('aria-level', '1')
    await expect(rows.nth(1)).toHaveAttribute('aria-level', '1')
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-path')))).toEqual([
      ':material/Recherche',
      ':material/Interviews',
    ])
    // The "+" of the groups still makes an ordinary group.
    await page.getByRole('button', { name: 'Neue Gruppe', exact: true }).click()
    await name.fill('Kapitel')
    await name.press('Enter')
    await expect(group(page, 'Kapitel')).toBeVisible()
    await expect(rows).toHaveCount(2)
    // The folders are on disk beside content/.
    await expect
      .poll(() => readdir(join(sandbox.projectDir, 'material')))
      .toEqual(['Interviews', 'Recherche'])
    // A folder of the document is dropped on the heading and is in the material, with its sheets.
    await group(page, 'methoden').dragTo(material.locator('.material-heading'))
    await expect(material.locator('[data-path=":material/methoden"]')).toBeVisible()
    await expect(group(page, 'methoden')).toHaveCount(0)
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'material/methoden/design.typ'), 'utf8'))
      .toContain('Design')
    // And back by dragging it onto the whole project.
    await group(page, ':material/methoden').dragTo(group(page, ''))
    await expect(group(page, 'methoden')).toBeVisible()
    await expect(material.locator('[data-path=":material/methoden"]')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('while a folder is dragged, a place appears to put it in the material, which begins with it', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({ 'project.toml': PLAIN_MANIFEST })
  const { app, page } = await launch(sandbox)
  try {
    await expect(page.locator('.drop-zone')).toHaveCount(0)
    // The place is not there to be aimed at before the drag begins: pick the folder up by hand.
    const from = (await group(page, 'methoden').boundingBox())!
    await page.mouse.move(from.x + 40, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + 60, from.y + from.height / 2 + 12, { steps: 4 })
    const zone = page.locator('.drop-zone')
    await expect(zone).toBeVisible()
    const to = (await zone.boundingBox())!
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
    const material = page.getByRole('group', { name: 'Material' })
    await expect(material.locator('[data-path=":material/methoden"]')).toBeVisible()
    await expect(group(page, 'methoden')).toHaveCount(0)
    // Once there is material the place is gone: the heading takes over.
    await expect(page.locator('.drop-zone')).toHaveCount(0)
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'material/methoden/design.typ'), 'utf8'))
      .toContain('Design')
  } finally {
    await app.close()
  }
})
