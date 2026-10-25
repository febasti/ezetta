import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launchAt, TYPST } from './helpers'
import type { Sandbox } from './helpers'

// The preview inside the editor is made by the real Typst compiler (`brew install typst`).
test.skip(!TYPST, 'Typst is not installed')
test.describe.configure({ timeout: 90_000 })

const SHEET = 'content/methoden/design.typ'
let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [SHEET]: '= Design\n\nDas Design der Studie ist qualitativ.\n',
    'library.bib':
      '@article{smith2020, author = {Smith, John}, title = {Eine Studie}, year = {2020}}\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

async function open(env: Record<string, string> = {}) {
  return launchAt(sandbox, 'methoden/design.typ', { env })
}

const editor = (page: Page) => page.getByRole('dialog', { name: 'Export und Vorlagen' })
/** The cards of the template list, and one of them by its name. */
const cards = (page: Page) =>
  editor(page).getByRole('group', { name: 'Vorlagen' }).getByRole('button')
const card = (page: Page, name: string) => editor(page).getByRole('button', { name, exact: true })
/** Shows the export's own panel: its options, the citation style, what is open. */
const showExport = (page: Page) =>
  editor(page)
    .getByRole('button', { name: /^Export( \d+)?$/ })
    .click()
/** Chooses an element in the list, opening the groups first when it is not to be seen. */
async function choose(page: Page, name: string) {
  const nav = editor(page).getByRole('navigation', { name: 'Elemente' })
  const entry = nav.getByRole('button', { name, exact: true })
  // One group is open at a time: open them one after the other until the entry is there.
  const groups = nav.locator('[aria-expanded]')
  const count = await groups.count()
  for (let i = 0; i < count && !(await entry.isVisible()); i += 1)
    if ((await groups.nth(i).getAttribute('aria-expanded')) === 'false') await groups.nth(i).click()
  await entry.click()
}
const prompt = (page: Page) => page.getByRole('dialog', { name: 'Kopie anlegen' })
const style = (id: string) => join(sandbox.userData, 'templates', id, 'style.toml')

async function openEditor(page: Page) {
  await page.getByRole('button', { name: 'Projektmenü' }).click()
  await page.getByRole('menuitem', { name: 'Als PDF exportieren …' }).click()
  await expect(editor(page)).toBeVisible()
  // The dialog opens on the export's own panel; the properties of the text come first here.
  await choose(page, 'Fließtext')
}

test('a bundled template is read-only; a copy of it can be changed, and the preview follows', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await expect(cards(page)).toHaveText([
      'Technischer Bericht',
      'Essay',
      'Manuskript',
      'Monographie',
      'Randnotizen',
      'Zeitschrift',
    ])
    await expect(card(page, 'Monographie')).toHaveAttribute('aria-current', 'true')
    await expect(
      editor(page).getByText('Mitgelieferte Vorlagen lassen sich nicht ändern'),
    ).toBeVisible()
    await choose(page, 'Überschrift 1 (Kapitel)')
    const size = editor(page).getByLabel('Größe', { exact: true })
    await expect(size).toHaveValue('2em')
    await expect(size).toBeDisabled()
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeDisabled()

    // The pages of the preview come from the compiler.
    const pages = editor(page).locator('img.page')
    await expect(pages.first()).toBeVisible({ timeout: 30_000 })
    const stamp = () =>
      pages
        .first()
        .getAttribute('src')
        .then((src) => /v=(\d+)/.exec(src ?? '')?.[1])
    const before = await stamp()

    // A copy has a name of its own and can be changed.
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await expect(prompt(page)).toBeVisible()
    await prompt(page).getByLabel('Name der Vorlage').fill('Meine Arbeit')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(card(page, 'Meine Arbeit')).toHaveAttribute('aria-current', 'true')
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()
    await expect(size).toBeEnabled()
    await expect(size).toHaveValue('2em')
    // What the copy does not set itself is shown as inherited.
    await expect(editor(page).locator('.row.inherited').first()).toBeVisible()

    await size.fill('3em')
    await size.press('Tab')
    // Nothing says a value was changed, and there is no button to take it back: a copy is made for that.
    await expect(editor(page).getByText('geändert')).toHaveCount(0)
    await expect(editor(page).getByRole('button', { name: /zurücksetzen/ })).toHaveCount(0)
    await expect
      .poll(() => readFile(style('meine-arbeit'), 'utf8').catch(() => ''))
      .toContain('size = "3em"')
    // Only what was changed is stored; the base's values are read from the base.
    expect(await readFile(style('meine-arbeit'), 'utf8')).not.toContain('Libertinus')
    // The preview makes the pages again with the new size.
    await expect.poll(stamp, { timeout: 30_000 }).not.toBe(before)

    // A value that is not a length is refused and nothing is written.
    await size.fill('groß')
    await size.press('Tab')
    await expect(editor(page).getByRole('alert')).toContainText('kein gültiger Wert')
    expect(await readFile(style('meine-arbeit'), 'utf8')).toContain('size = "3em"')

    // An emptied field takes the value the element would have without it.
    await size.fill('')
    await size.press('Tab')
    await expect(size).toHaveValue('2em')
    await expect.poll(() => readFile(style('meine-arbeit'), 'utf8')).not.toContain('3em')
  } finally {
    await app.close()
  }
})

test('the copy is offered in the export dialog, and its settings survive a restart', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Kurz')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await choose(page, 'Fließtext')
    const size = editor(page).getByLabel('Größe', { exact: true })
    await size.fill('9pt')
    await size.press('Tab')
    await expect.poll(() => readFile(style('kurz'), 'utf8').catch(() => '')).toContain('9pt')
    await editor(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(editor(page)).toHaveCount(0)
    // The copy is the template of the export now: the dialog opens on it again.
    await openEditor(page)
    await expect(card(page, 'Kurz')).toHaveAttribute('aria-current', 'true')
  } finally {
    await app.close()
  }

  const again = await open()
  try {
    await again.page.getByRole('button', { name: 'Projektmenü' }).click()
    await again.page.getByRole('menuitem', { name: 'Als PDF exportieren …' }).click()
    await expect(cards(again.page)).toHaveCount(7)
    // The choice of the template was remembered with the project.
    await expect(card(again.page, 'Kurz')).toHaveAttribute('aria-current', 'true')
    await choose(again.page, 'Fließtext')
    await expect(editor(again.page).getByLabel('Größe', { exact: true })).toHaveValue('9pt')
  } finally {
    await again.app.close()
  }
})

// A font file that is on the machine but is not one of the compiler's own.
const FONT = '/System/Library/Fonts/Supplemental/Georgia.ttf'

test('a font file is added to a copy, offered for the elements, and used in the pages', async () => {
  test.skip(!existsSync(FONT), 'needs a font file to add')
  const { app, page } = await open({ EZETTA_TEST_FONTS: FONT })
  try {
    await openEditor(page)
    // A bundled template shows what it has and cannot take fonts.
    await editor(page).getByRole('button', { name: 'Eigene Schriften' }).click()
    await expect(
      editor(page).getByText('Mitgelieferte Vorlagen lassen sich nicht ändern'),
    ).toBeVisible()
    await expect(editor(page).getByRole('button', { name: 'Schrift hinzufügen …' })).toHaveCount(0)

    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Mit Schrift')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(editor(page).getByText('Noch keine eigenen Schriften')).toBeVisible()
    await editor(page).getByRole('button', { name: 'Schrift hinzufügen …' }).click()
    await expect(editor(page).locator('.files')).toContainText('Georgia.ttf')
    await expect(editor(page).locator('.families')).toContainText('Georgia')
    await expect
      .poll(() =>
        existsSync(join(sandbox.userData, 'templates', 'mit-schrift', 'fonts', 'Georgia.ttf')),
      )
      .toBe(true)

    // The family is offered for a property, and the pages are made with it (a family the
    // compiler does not know would still compile, so the check is that the preview works).
    await choose(page, 'Fließtext')
    const font = editor(page).getByLabel('Schriftart')
    await font.fill('Georgia')
    await font.press('Tab')
    await expect.poll(() => readFile(style('mit-schrift'), 'utf8')).toContain('font = "Georgia"')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)

    // Removing the file takes it from the list and from the folder.
    await editor(page).getByRole('button', { name: 'Eigene Schriften' }).click()
    await editor(page).getByRole('button', { name: 'Georgia.ttf entfernen' }).click()
    await expect(editor(page).getByText('Noch keine eigenen Schriften')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a template is saved as a file and loaded again, as a template of its own', async () => {
  const file = join(sandbox.base, 'Weitergabe.ezetta-template')
  const first = await open({ EZETTA_TEST_TEMPLATE_EXPORT: file })
  try {
    await openEditor(first.page)
    // A bundled template needs no file: it is in every copy of the app.
    await expect(
      editor(first.page).getByRole('button', { name: 'Als Datei speichern …' }),
    ).toBeDisabled()
    await editor(first.page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(first.page).getByLabel('Name der Vorlage').fill('Zum Teilen')
    await prompt(first.page).getByRole('button', { name: 'OK' }).click()
    await choose(first.page, 'Fließtext')
    const size = editor(first.page).getByLabel('Größe', { exact: true })
    await size.fill('9.5pt')
    await size.press('Tab')
    await expect
      .poll(() => readFile(style('zum-teilen'), 'utf8').catch(() => ''))
      .toContain('9.5pt')
    await editor(first.page).getByRole('button', { name: 'Als Datei speichern …' }).click()
    await expect(first.page.getByText('Vorlage gespeichert')).toBeVisible()
    expect((await readFile(file)).subarray(0, 2).toString()).toBe('PK')
  } finally {
    await first.app.close()
  }

  // Another machine: its own data folder, the same file.
  await rm(join(sandbox.userData, 'templates'), { recursive: true, force: true })
  const second = await open({ EZETTA_TEST_TEMPLATE_IMPORT: file })
  try {
    await openEditor(second.page)
    await expect(cards(second.page)).toHaveCount(6)
    await editor(second.page).getByRole('button', { name: 'Aus Datei laden …' }).click()
    await expect(second.page.getByText('Vorlage „Zum Teilen“ hinzugefügt')).toBeVisible()
    await expect(card(second.page, 'Zum Teilen')).toHaveAttribute('aria-current', 'true')
    await choose(second.page, 'Fließtext')
    await expect(editor(second.page).getByLabel('Größe', { exact: true })).toHaveValue('9.5pt')
  } finally {
    await second.app.close()
  }
})

test('a heading is aligned with radio buttons and can have a line above and below it', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Mit Linien')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()
    await choose(page, 'Überschrift 2')

    // The alignment is a group of radio buttons; left is what the headings have.
    const group = editor(page).getByRole('radiogroup', { name: 'Ausrichtung' })
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(group.getByRole('radio', { name: 'Links' })).toBeChecked()
    await group.getByRole('radio', { name: 'Zentriert' }).click()
    await expect(group.getByRole('radio', { name: 'Zentriert' })).toBeChecked()
    await expect
      .poll(() => readFile(style('mit-linien'), 'utf8').catch(() => ''))
      .toContain('align = "center"')

    // A line has its own fields, which are there once the line is switched on.
    await expect(editor(page).getByLabel('Länge')).toHaveCount(0)
    await editor(page).getByLabel('Linie unter der Überschrift').check()
    const thickness = editor(page).getByLabel('Stärke')
    await expect(thickness).toHaveValue('0.5pt')
    await expect(editor(page).getByLabel('Länge')).toHaveValue('100%')
    await expect(editor(page).getByLabel('Abstand zum Text')).toHaveValue('0.4em')
    await thickness.fill('2pt')
    await thickness.press('Tab')
    await editor(page).getByLabel('Länge').fill('3cm')
    await editor(page).getByLabel('Länge').press('Tab')
    await expect
      .poll(() => readFile(style('mit-linien'), 'utf8'))
      .toContain('line_below_width = "3cm"')
    const toml = await readFile(style('mit-linien'), 'utf8')
    expect(toml).toContain('line_below = true')
    expect(toml).toContain('line_below_thickness = "2pt"')
    // The other line stays off, and the preview still works.
    await expect(editor(page).getByLabel('Linie über der Überschrift')).not.toBeChecked()
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the letter case of headings is chosen with radio buttons, and the properties are in groups', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Versalien')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()
    await choose(page, 'Überschrift 2')

    // The properties of a heading are in groups with a title each.
    for (const title of ['Schrift', 'Anordnung', 'Nummerierung und Umbruch']) {
      await expect(editor(page).getByRole('heading', { name: title, level: 4 })).toBeVisible()
    }
    // An element with one kind of property has no group title.
    await choose(page, 'Farben')
    await expect(editor(page).getByRole('heading', { level: 4 })).toHaveCount(0)
    await choose(page, 'Überschrift 2')

    const group = editor(page).getByRole('radiogroup', { name: 'Schreibweise' })
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(group.getByRole('radio', { name: 'Normal' })).toBeChecked()
    await group.getByRole('radio', { name: 'Kapitälchen' }).click()
    await expect(group.getByRole('radio', { name: 'Kapitälchen' })).toBeChecked()
    await expect
      .poll(() => readFile(style('versalien'), 'utf8').catch(() => ''))
      .toContain('text_case = "smallcaps"')
    await group.getByRole('radio', { name: 'Versalien' }).click()
    await expect.poll(() => readFile(style('versalien'), 'utf8')).toContain('text_case = "upper"')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('headings are numbered in the format and to the depth of the template, and the chips say so', async () => {
  await writeFile(
    join(sandbox.projectDir, SHEET),
    '= Design <sec-design>\n\n== Stichprobe <sec-stichprobe>\n\nSiehe @sec-design und @sec-stichprobe.\n',
  )
  const { app, page } = await open({
    EZETTA_TEST_EXPORT: join(sandbox.base, 'Arbeit.pdf'),
  })
  try {
    // The sandbox's first sheet has a chapter of its own, so this one is the second.
    const chips = page.locator('.cm-content .cm-xref')
    await expect(chips).toHaveText(['Abschnitt 2', 'Abschnitt 2.1'])

    await openEditor(page)
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Römisch')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()

    // Chapters in roman numerals, and numbers down to level 1 only.
    await choose(page, 'Überschrift 1 (Kapitel)')
    await editor(page).getByLabel('Zahlenformat').selectOption({ label: 'I, II, III' })
    await expect
      .poll(() => readFile(style('romisch'), 'utf8').catch(() => ''))
      .toContain('number_format = "roman"')
    await choose(page, 'Alle Überschriften')
    await expect(editor(page).getByLabel('Nummerieren bis')).toHaveValue('3')
    await editor(page)
      .getByLabel('Nummerieren bis')
      .selectOption({ label: 'Nur Ebene 1 (Kapitel)' })
    await expect.poll(() => readFile(style('romisch'), 'utf8')).toContain('number_depth = "1"')

    // The template shown is the export's: the export saves the profile with it; then the chips follow.
    const dialog = editor(page)
    await dialog.getByRole('button', { name: 'Exportieren …' }).click()
    await expect(dialog).toContainText('PDF gespeichert', { timeout: 60_000 })
    await dialog.getByRole('button', { name: 'Schließen' }).click()
    await expect(chips).toHaveText(['Abschnitt II', '„Stichprobe“'])
  } finally {
    await app.close()
  }
})

test('every text element has a font, and headings a letter spacing', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Schriften')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()

    // Elements that had no font before: each shows the one it takes from the body text.
    for (const name of ['Blockzitat', 'Abbildung', 'Tabelle', 'Fußnote', 'Inhaltsverzeichnis']) {
      await choose(page, name)
      // The captions are below the figure or the table: each has a font field of its own.
      await expect(editor(page).getByLabel('Schriftart').last()).toHaveValue('Libertinus Serif')
    }
    await choose(page, 'Blockzitat')
    await editor(page).getByLabel('Schriftart').fill('DejaVu Sans Mono')
    await editor(page).getByLabel('Schriftart').press('Tab')
    await expect
      .poll(() => readFile(style('schriften'), 'utf8').catch(() => ''))
      .toContain('font = "DejaVu Sans Mono"')

    await choose(page, 'Alle Überschriften')
    const spacing = editor(page).getByLabel('Zeichenabstand')
    await expect(spacing).toHaveValue('')
    await spacing.fill('0.08em')
    await spacing.press('Tab')
    await expect
      .poll(() => readFile(style('schriften'), 'utf8'))
      .toContain('letter_spacing = "0.08em"')
    // The levels take it from all headings.
    await choose(page, 'Überschrift 2')
    await expect(editor(page).getByLabel('Zeichenabstand')).toHaveValue('0.08em')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the text can be set in columns, with a gap, and figures can span them', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Zweispaltig')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()

    await choose(page, 'Ränder und Spalten')
    for (const title of ['Ränder', 'Spalten']) {
      await expect(editor(page).getByRole('heading', { name: title, level: 4 })).toBeVisible()
    }
    const group = editor(page).getByRole('radiogroup', { name: 'Spalten' })
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(group.getByRole('radio', { name: 'Eine' })).toBeChecked()
    await group.getByRole('radio', { name: 'Zwei' }).click()
    await expect(group.getByRole('radio', { name: 'Zwei' })).toBeChecked()
    await expect
      .poll(() => readFile(style('zweispaltig'), 'utf8').catch(() => ''))
      .toContain('columns = "2"')
    const gap = editor(page).getByLabel('Spaltenabstand')
    await expect(gap).toHaveValue('1cm')
    await gap.fill('0.6cm')
    await gap.press('Tab')
    await expect
      .poll(() => readFile(style('zweispaltig'), 'utf8'))
      .toContain('column_gap = "0.6cm"')

    await choose(page, 'Abbildung')
    await editor(page).getByLabel('Über alle Spalten').check()
    await expect.poll(() => readFile(style('zweispaltig'), 'utf8')).toContain('span_columns = true')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

/** Makes a copy of a template with this name and waits until it is the one shown. */
async function makeCopy(page: Page, name: string) {
  await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
  await prompt(page).getByLabel('Name der Vorlage').fill(name)
  await prompt(page).getByRole('button', { name: 'OK' }).click()
  await expect(editor(page).getByRole('button', { name: 'Umbenennen …' })).toBeEnabled()
}

test('headers, footers and the page number are set with three places each', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Kopfzeilen')
    const toml = () => readFile(style('kopfzeilen'), 'utf8').catch(() => '')

    // The footer has the page number in the middle, the header the chapter and the section.
    await choose(page, 'Fußzeile')
    await expect(editor(page).getByLabel('Mitte', { exact: true })).toHaveValue('page')
    await choose(page, 'Kopfzeile')
    await expect(editor(page).getByLabel('Links', { exact: true })).toHaveValue('chapter')
    await expect(editor(page).getByLabel('Mitte', { exact: true })).toHaveValue('none')
    await expect(editor(page).getByLabel('Rechts', { exact: true })).toHaveValue('section')
    await editor(page)
      .getByLabel('Links', { exact: true })
      .selectOption({ label: 'Titel der Arbeit' })
    await editor(page).getByLabel('Rechts', { exact: true }).selectOption({ label: 'Kapitel' })
    await expect.poll(toml).toContain('slot_right = "chapter"')
    expect(await toml()).toContain('slot_left = "title"')

    // The divider has its own fields, there while it is switched on.
    await expect(editor(page).getByLabel('Stärke')).toHaveValue('0.4pt')
    await editor(page).getByLabel('Trennlinie').uncheck()
    await expect(editor(page).getByLabel('Abstand zum Text', { exact: true })).toHaveCount(0)
    await editor(page).getByLabel('Trennlinie').check()
    await editor(page).getByLabel('Auf geraden Seiten spiegeln').uncheck()
    await expect.poll(toml).toContain('mirror = false')

    await choose(page, 'Seitenzahl')
    await editor(page).getByLabel('Darstellung').selectOption({ label: 'Mit Wort (Seite 3)' })
    await editor(page).getByLabel('Zahlenformat im Vorspann').selectOption({ label: 'I, II, III' })
    await expect.poll(toml).toContain('page_style = "prefix"')
    expect(await toml()).toContain('front_format = "roman"')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('tables have rules, a header and stripes; a block quote can have a bar and a background', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Tabellen')
    const toml = () => readFile(style('tabellen'), 'utf8').catch(() => '')

    await choose(page, 'Tabelle')
    await expect(editor(page).getByLabel('Linien', { exact: true })).toHaveValue('booktabs')
    await editor(page).getByLabel('Linien', { exact: true }).selectOption({ label: 'Gitter' })
    await editor(page).getByLabel('Kopfzeile fett').check()
    const stripe = editor(page).locator('#prop-table-stripe_fill')
    await stripe.fill('#f0f0f0')
    await stripe.press('Tab')
    await editor(page)
      .getByRole('radiogroup', { name: 'Ausrichtung der Zellen' })
      .getByRole('radio', { name: 'Zentriert' })
      .click()
    await expect.poll(toml).toContain('cell_align = "center"')
    expect(await toml()).toContain('stripe_fill = "#f0f0f0"')
    expect(await toml()).toContain('border_style = "grid"')
    expect(await toml()).toContain('header_bold = true')

    await choose(page, 'Blockzitat')
    await editor(page).getByLabel('Balken links').check()
    const gap = editor(page).getByLabel('Abstand zum Text', { exact: true })
    await expect(gap).toHaveValue('0.8em')
    const padding = editor(page).getByLabel('Innenabstand')
    await padding.fill('0.5em')
    await padding.press('Tab')
    await expect.poll(toml).toContain('padding = "0.5em"')
    expect(await toml()).toContain('bar = true')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the numbers of headings have a prefix, a mark and a separator, and the contents a depth', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Nummern')
    const toml = () => readFile(style('nummern'), 'utf8').catch(() => '')

    await choose(page, 'Alle Überschriften')
    await editor(page).getByLabel('Trenner der Ebenen').selectOption({ label: 'Bindestrich (1-2)' })
    await editor(page).getByLabel('Zeichen nach der Nummer').selectOption({ label: 'Punkt (1.)' })
    await editor(page).getByLabel('Umbruch langer Titel').selectOption({ label: 'Hängend' })
    await expect.poll(toml).toContain('number_style = "hanging"')
    expect(await toml()).toContain('number_separator = "dash"')
    expect(await toml()).toContain('number_suffix = "point"')

    // The text before a number keeps its space.
    await choose(page, 'Überschrift 1 (Kapitel)')
    const prefix = editor(page).getByLabel('Text vor der Nummer')
    await prefix.fill('Kapitel ')
    await prefix.press('Tab')
    await expect.poll(toml).toContain('number_prefix = "Kapitel "')
    await prefix.fill('#panic()')
    await prefix.press('Tab')
    await expect(editor(page).getByRole('alert')).toContainText('kein gültiger Wert')
    expect(await toml()).toContain('number_prefix = "Kapitel "')

    await choose(page, 'Inhaltsverzeichnis')
    await editor(page).getByLabel('Ebenen anzeigen').selectOption({ label: 'Bis Ebene 2' })
    await editor(page).getByLabel('Füllzeichen vor der Seitenzahl').selectOption({ label: 'Keine' })
    const title = editor(page).getByLabel('Titel', { exact: true })
    await title.fill('Inhalt')
    await title.press('Tab')
    await expect.poll(toml).toContain('title_text = "Inhalt"')
    expect(await toml()).toContain('show_depth = "2"')
    expect(await toml()).toContain('leader = "none"')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
  } finally {
    await app.close()
  }
})

test('the options of the export dialog can get another default, or not be offered', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Optionen')
    const custom = () =>
      readFile(join(sandbox.userData, 'templates', 'optionen', 'custom.toml'), 'utf8').catch(
        () => '',
      )

    await editor(page)
      .getByRole('navigation', { name: 'Elemente' })
      .getByRole('button', { name: 'Optionen', exact: true })
      .click()
    const title = editor(page).getByLabel('Titelseite', { exact: true })
    await expect(title).toBeChecked()
    await title.uncheck()
    const subtitle = editor(page).locator('.option', { hasText: 'Untertitel' })
    await subtitle.getByLabel('Im Exportdialog anbieten').uncheck()
    const author = editor(page).getByLabel('Autorin oder Autor', { exact: true })
    await author.fill('A. Autor')
    await author.press('Tab')
    await expect.poll(custom).toContain('default = "A. Autor"')
    expect(await custom()).toContain('default = false')
    expect(await custom()).toContain('hidden = true')

    // The export dialog shows the defaults, and not the option that is left out.
    await showExport(page)
    const dialog = editor(page)
    await expect(dialog.getByLabel('Titelseite')).not.toBeChecked()
    await expect(dialog.getByLabel('Autorin oder Autor')).toHaveValue('A. Autor')
    await expect(dialog.getByLabel('Untertitel')).toHaveCount(0)

    // The bundled template is not changed.
    await card(page, 'Monographie').click()
    await expect(dialog.getByLabel('Untertitel')).toHaveCount(1)
    await expect(dialog.getByLabel('Titelseite')).toBeChecked()
  } finally {
    await app.close()
  }
})

test('a chapter can start on the next right-hand page', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Rechts')
    await choose(page, 'Überschrift 1 (Kapitel)')
    const select = editor(page).getByLabel('Umbruch davor')
    await expect(select).toHaveValue('page')
    await select.selectOption({ label: 'Neue rechte Seite (mit Leerseite)' })
    await expect
      .poll(() => readFile(style('rechts'), 'utf8').catch(() => ''))
      .toContain('break_before = "odd"')
    await choose(page, 'Überschrift 2')
    await expect(editor(page).getByLabel('Umbruch davor')).toHaveValue('none')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the bibliography has a title of its own, an indent and a space between entries', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Quellen')
    const toml = () => readFile(style('quellen'), 'utf8').catch(() => '')
    await choose(page, 'Literaturverzeichnis')
    await editor(page).getByLabel('Titel', { exact: true }).fill('Quellen')
    await editor(page).getByLabel('Titel', { exact: true }).press('Tab')
    const indent = editor(page).getByLabel('Einzug ab der zweiten Zeile')
    await indent.fill('2em')
    await indent.press('Tab')
    const gap = editor(page).getByLabel('Abstand zwischen den Einträgen')
    await gap.fill('1em')
    await gap.press('Tab')
    await expect.poll(toml).toContain('entry_spacing = "1em"')
    expect(await toml()).toContain('title_text = "Quellen"')
    expect(await toml()).toContain('hanging_indent = "2em"')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('captions have a position and a mark, and references can use other words that the chips follow', async () => {
  await writeFile(join(sandbox.projectDir, SHEET), '= Design <sec-design>\n\nSiehe @sec-design.\n')
  const { app, page } = await open({ EZETTA_TEST_EXPORT: join(sandbox.base, 'Arbeit.pdf') })
  try {
    const chips = page.locator('.cm-content .cm-xref')
    await expect(chips).toHaveText(['Abschnitt 2'])
    await openEditor(page)
    await makeCopy(page, 'Beschriftung')
    const toml = () => readFile(style('beschriftung'), 'utf8').catch(() => '')

    await choose(page, 'Abbildung')
    await expect(editor(page).getByLabel('Stellung')).toHaveValue('below')
    await editor(page).getByLabel('Stellung').selectOption({ label: 'Über dem Objekt' })
    await editor(page)
      .getByLabel('Zeichen nach der Nummer')
      .selectOption({ label: 'Punkt (Abbildung 1. Text)' })
    await editor(page)
      .getByRole('radiogroup', { name: 'Ausrichtung' })
      .getByRole('radio', { name: 'Links' })
      .click()
    await expect.poll(toml).toContain('align = "left"')
    expect(await toml()).toContain('caption_position = "above"')
    expect(await toml()).toContain('caption_separator = "period"')

    await choose(page, 'Querverweise')
    const word = editor(page).getByLabel('Wort für Abschnitte')
    await word.fill('Kap.')
    await word.press('Tab')
    await expect.poll(toml).toContain('supplement_section = "Kap."')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)

    // The export saves the profile; then the chips use the word.
    const dialog = editor(page)
    await dialog.getByRole('button', { name: 'Exportieren …' }).click()
    await expect(dialog).toContainText('PDF gespeichert', { timeout: 60_000 })
    await dialog.getByRole('button', { name: 'Schließen' }).click()
    await expect(chips).toHaveText(['Kap. 2'])
  } finally {
    await app.close()
  }
})

test('lists, footnotes, equations and code blocks can be set', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Mehr')
    const toml = () => readFile(style('mehr'), 'utf8').catch(() => '')

    await choose(page, 'Aufzählungen')
    await editor(page).getByLabel('Aufzählungszeichen').selectOption({ label: 'Strich (–)' })
    await editor(page).getByLabel('Nummerierte Listen').selectOption({ label: 'a) b) c)' })
    const gap = editor(page).getByLabel('Abstand zwischen den Punkten')
    await gap.fill('0.8em')
    await gap.press('Tab')
    await expect.poll(toml).toContain('item_spacing = "0.8em"')
    expect(await toml()).toContain('marker = "dash"')
    expect(await toml()).toContain('enum_format = "letter_paren"')

    await choose(page, 'Fußnote')
    const indent = editor(page).getByLabel('Einzug der Fußnoten')
    await indent.fill('2em')
    await indent.press('Tab')
    const between = editor(page).getByLabel('Abstand zwischen den Fußnoten')
    await between.fill('0.8em')
    await between.press('Tab')
    await expect.poll(toml).toContain('note_gap = "0.8em"')
    expect(await toml()).toContain('note_indent = "2em"')

    await choose(page, 'Formeln')
    await editor(page).getByLabel('Stellung der Nummer').selectOption({ label: 'Links' })
    await expect.poll(toml).toContain('number_side = "left"')

    await choose(page, 'Code')
    const fill = editor(page).locator('#prop-code-fill')
    await fill.fill('#eeeeee')
    await fill.press('Tab')
    const radius = editor(page).getByLabel('Eckenradius')
    await radius.fill('4pt')
    await radius.press('Tab')
    await expect.poll(toml).toContain('radius = "4pt"')
    expect(await toml()).toContain('fill = "#eeeeee"')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a colour can name a colour of the palette, and follows it when the palette changes', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Farben')
    const toml = () => readFile(style('farben'), 'utf8').catch(() => '')

    await choose(page, 'Farben')
    await expect(editor(page).locator('#prop-palette-accent')).toHaveValue('#7a1f2b')
    // The palette's own colours are colours, not names.
    await expect(editor(page).getByRole('group', { name: 'Farbe aus der Palette' })).toHaveCount(0)
    await editor(page).locator('#prop-palette-accent').fill('#b00020')
    await editor(page).locator('#prop-palette-accent').press('Tab')
    await expect.poll(toml).toContain('accent = "#b00020"')

    await choose(page, 'Überschrift 2')
    const tone = (name: string) =>
      editor(page)
        .getByRole('group', { name: 'Farbe aus der Palette' })
        .getByRole('button', { name })
    await tone('Akzentfarbe').click()
    await expect(tone('Akzentfarbe')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(toml).toContain('color = "accent"')
    await expect(editor(page).locator('#prop-heading_2-color')).toHaveValue('accent')
    await expect(editor(page).locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(editor(page).getByRole('alert')).toHaveCount(0)

    // Back to a colour of its own: the colour it had.
    await tone('Akzentfarbe').click()
    await expect(tone('Akzentfarbe')).toHaveAttribute('aria-pressed', 'false')
    await expect(editor(page).locator('#prop-heading_2-color')).toHaveValue('#b00020')
  } finally {
    await app.close()
  }
})

test('the templates are a narrow column with a picture each; choosing one makes it the export’s', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    // One column of pictures, made by the compiler from a sample text, narrower than the elements.
    const list = editor(page).getByRole('group', { name: 'Vorlagen' })
    await expect(list.locator('img')).toHaveCount(6, { timeout: 30_000 })
    const boxes = await cards(page).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()),
    )
    expect(new Set(boxes.map((b) => Math.round(b.x))).size).toBe(1)
    expect(boxes[0]!.width).toBeLessThan(150)
    expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y)
    const src = (name: string) => card(page, name).locator('img').getAttribute('src')
    expect(await src('Monographie')).toMatch(/^data:image\/png;base64,/)
    expect(await src('Essay')).not.toBe(await src('Monographie'))

    // The pages beside it show the template chosen, and closing remembers it for the project.
    const pages = editor(page).locator('img.page')
    await expect(pages.first()).toBeVisible({ timeout: 30_000 })
    const stamp = () => pages.first().getAttribute('src')
    const before = await stamp()
    await card(page, 'Essay').click()
    await expect(card(page, 'Essay')).toHaveAttribute('aria-current', 'true')
    await expect.poll(stamp, { timeout: 30_000 }).not.toBe(before)
    await editor(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(editor(page)).toHaveCount(0)
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .toContain('template = "essay"')

    // A change of the template changes its picture, too.
    await openEditor(page)
    await expect(card(page, 'Essay')).toHaveAttribute('aria-current', 'true')
    await editor(page).getByRole('button', { name: 'Kopie anlegen …' }).click()
    await prompt(page).getByLabel('Name der Vorlage').fill('Groß')
    await prompt(page).getByRole('button', { name: 'OK' }).click()
    await expect(card(page, 'Groß').locator('img')).toBeVisible({ timeout: 30_000 })
    const first = await src('Groß')
    await choose(page, 'Überschrift 1 (Kapitel)')
    const size = editor(page).getByLabel('Größe', { exact: true })
    await size.fill('3em')
    await size.press('Tab')
    await expect.poll(() => src('Groß'), { timeout: 30_000 }).not.toBe(first)
  } finally {
    await app.close()
  }
})

test('the list has one entry for what belongs together: the epigraph with its source, the captions with figure and table, one title page', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    const nav = editor(page).getByRole('navigation', { name: 'Elemente' })
    const entry = (name: string) => nav.getByRole('button', { name, exact: true })
    // One group at a time is open: look into each.
    for (const group of ['Seite', 'Text', 'Überschriften', 'Zitate', 'Verweise', 'Verzeichnisse'])
      await entry(group).click()
    for (const gone of [
      'Quelle des Epigraphs',
      'Bildunterschrift',
      'Tabellenüberschrift',
      'Titel',
      'Untertitel',
      'Autorin oder Autor',
      'Datum',
    ])
      await expect(entry(gone)).toHaveCount(0)
    // No group of its own for the title page: it is an entry among the page's.
    await expect(nav.getByRole('heading', { name: 'Titelseite', exact: true })).toHaveCount(0)
    await expect(entry('Titelseite')).toHaveCount(1)

    const sections = (name: string) =>
      editor(page).locator('.properties h3.sub').getByText(name, { exact: true })
    await choose(page, 'Epigraph')
    await expect(sections('Quelle des Epigraphs')).toBeVisible()
    await choose(page, 'Abbildung')
    await expect(sections('Bildunterschrift')).toBeVisible()
    await expect(editor(page).getByLabel('Stellung')).toHaveCount(1)
    await choose(page, 'Tabelle')
    await expect(sections('Tabellenüberschrift')).toBeVisible()
    await expect(editor(page).getByLabel('Stellung')).toHaveCount(1)
    await choose(page, 'Titelseite')
    for (const part of ['Titel', 'Untertitel', 'Autorin oder Autor', 'Datum'])
      await expect(sections(part)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a value of a part is changed in the entry it is shown in', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Teile')
    const nav = editor(page).getByRole('navigation', { name: 'Elemente' })
    await choose(page, 'Titelseite')
    const subtitle = editor(page).locator('#prop-title_page_subtitle-size')
    await subtitle.fill('1.6em')
    await subtitle.press('Tab')
    await expect
      .poll(() => readFile(style('teile'), 'utf8').catch(() => ''))
      .toContain('[element.title_page_subtitle]')
    expect(await readFile(style('teile'), 'utf8')).toContain('size = "1.6em"')
    // No entry is marked as changed.
    await expect(nav.locator('.dot')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the elements are in groups that open and close: the headings under one entry, the quotes in three kinds', async () => {
  const { app, page } = await open()
  try {
    await page.getByRole('button', { name: 'Projektmenü' }).click()
    await page.getByRole('menuitem', { name: 'Als PDF exportieren …' }).click()
    await expect(editor(page)).toBeVisible()
    const nav = editor(page).getByRole('navigation', { name: 'Elemente' })
    const group = (name: string) => nav.getByRole('button', { name, exact: true })
    const inside = (name: string) => nav.getByRole('group', { name, exact: true })

    // One flat list: the groups fold out on the same level, and a group of one is just its entry.
    await expect(nav.getByRole('button')).toHaveText([
      /^\s*Export/,
      'Seite',
      'Titelseite',
      'Text',
      'Überschriften',
      'Aufzählungen',
      'Zitate',
      'Verweise',
      'Verzeichnisse',
      'Tabelle',
      'Abbildung',
      'Formeln',
      'Code',
      'Optionen',
      'Eigene Schriften',
    ])
    const indent = (name: string) => group(name).evaluate((el) => el.getBoundingClientRect().left)
    // The dialog opens on the export panel: every group is closed, and says so.
    await expect(group('Überschriften')).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('button', { name: 'Überschrift 1 (Kapitel)' })).toHaveCount(0)

    // One entry for the headings: it opens to all of them and the four levels.
    await group('Überschriften').click()
    await expect(group('Überschriften')).toHaveAttribute('aria-expanded', 'true')
    await expect(inside('Überschriften').getByRole('button')).toHaveText([
      'Alle Überschriften',
      'Überschrift 1 (Kapitel)',
      'Überschrift 2',
      'Überschrift 3',
      'Überschrift 4',
    ])
    // The entries stand where the groups stand, within the background's edge: no step to the right.
    const first = inside('Überschriften').getByRole('button').first()
    const step =
      (await first.evaluate((el) => el.getBoundingClientRect().left)) -
      (await indent('Überschriften'))
    expect(step).toBeGreaterThanOrEqual(0)
    expect(step).toBeLessThan(10)
    await inside('Überschriften').getByRole('button', { name: 'Überschrift 2' }).click()
    await expect(editor(page).getByRole('heading', { name: 'Überschrift 2' })).toBeVisible()

    // The quotes: in the text, a block, an epigraph (whose source is a section of it). Only one group
    // is open at a time: this one closes the headings.
    await group('Zitate').click()
    await expect(inside('Zitate').getByRole('button')).toHaveText([
      'Zitat im Text',
      'Blockzitat',
      'Epigraph',
    ])
    await expect(group('Überschriften')).toHaveAttribute('aria-expanded', 'false')
    await expect(inside('Überschriften')).toHaveCount(0)
    await expect(nav.locator('[aria-expanded=true]')).toHaveCount(1)
    // The entries of the open group stand on a background of their own; they have no symbol, the groups do.
    expect(await inside('Zitate').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    )
    await expect(inside('Zitate').locator('svg')).toHaveCount(0)
    for (const name of ['Export', 'Seite', 'Titelseite', 'Text', 'Überschriften', 'Aufzählungen'])
      await expect(
        nav
          .getByRole('button', { name: new RegExp(`^${name}`) })
          .first()
          .locator('svg')
          .first(),
      ).toBeVisible()
    // An open group closes with a click on it, and none is open then.
    await group('Zitate').click()
    await expect(nav.locator('[aria-expanded=true]')).toHaveCount(0)
    // What was in the lists of the old groups is in these: references, lists, text.
    await group('Verweise').click()
    await expect(inside('Verweise').getByRole('button')).toHaveText([
      'Querverweise',
      'Belege',
      'Fußnote',
      'Links',
    ])
    // Every kind of list of contents is in one group; the code and the colours are not in the text's.
    await group('Verzeichnisse').click()
    await expect(inside('Verzeichnisse').getByRole('button')).toHaveText([
      'Inhaltsverzeichnis',
      'Abbildungsverzeichnis',
      'Tabellenverzeichnis',
      'Literaturverzeichnis',
    ])
    await group('Seite').click()
    await expect(inside('Seite').getByRole('button')).toHaveText([
      'Ränder und Spalten',
      'Kopfzeile',
      'Fußzeile',
      'Seitenzahl',
      'Farben',
    ])
    await group('Text').click()
    await expect(inside('Text').getByRole('button')).toHaveText(['Fließtext', 'Markierung'])
    await expect(inside('Verweise')).toHaveCount(0)
    // The chosen element is still the one shown, though its group is closed.
    await expect(editor(page).getByRole('heading', { name: 'Überschrift 2' })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a quote in the text can have a style of its own, and the pages follow', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Im Text')
    await choose(page, 'Zitat im Text')
    const toml = () => readFile(style('im-text'), 'utf8').catch(() => '')
    // What it leaves unset is the text around it.
    await expect(editor(page).locator('#prop-quote_inline-color')).toHaveValue('')
    const italic = editor(page).locator('#prop-quote_inline-italic')
    await italic.check()
    await expect.poll(toml).toContain('[element.quote_inline]')
    expect(await toml()).toContain('italic = true')
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the size of the text is set in the body text, and the paper size in the page section', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Masse')
    const toml = () => readFile(style('masse'), 'utf8').catch(() => '')

    // The export panel has no size of the text or of the paper any more: they are the template's.
    await showExport(page)
    await expect(editor(page).getByLabel('Schriftgröße')).toHaveCount(0)
    await expect(editor(page).getByLabel('Papierformat')).toHaveCount(0)

    // The size of the text changes the pages (and the template's picture).
    await choose(page, 'Fließtext')
    const pages = editor(page).locator('img.page')
    await expect(pages.first()).toBeVisible({ timeout: 30_000 })
    const stamp = () => pages.first().getAttribute('src')
    const before = await stamp()
    const size = editor(page).getByLabel('Größe', { exact: true })
    await size.fill('14pt')
    await size.press('Tab')
    await expect.poll(toml).toContain('size = "14pt"')
    await expect.poll(stamp, { timeout: 30_000 }).not.toBe(before)

    // The paper size is in the page section, with the margins.
    await choose(page, 'Ränder und Spalten')
    const paper = editor(page).getByLabel('Papierformat')
    await expect(paper).toHaveValue('a4')
    await expect(paper.locator('option')).toHaveText([
      'A3',
      'A4',
      'A5',
      'B5',
      'US Letter',
      'US Legal',
    ])
    // Facing pages or single pages is chosen beside it.
    const layout = editor(page).getByLabel('Seitenanordnung')
    await expect(layout).toHaveValue('facing')
    await expect(layout.locator('option')).toHaveText(['Doppelseiten (Buchsatz)', 'Einzelseiten'])
    await layout.selectOption({ label: 'Einzelseiten' })
    await expect.poll(toml).toContain('facing = "single"')
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
    const afterSize = await stamp()
    await paper.selectOption({ label: 'A5' })
    await expect.poll(toml).toContain('paper = "a5"')
    await expect.poll(stamp, { timeout: 30_000 }).not.toBe(afterSize)
    await expect(editor(page).getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('links and cross-references have a colour, a weight, italics and a background; a colour is one compact row', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Verweise')
    const toml = () => readFile(style('verweise'), 'utf8').catch(() => '')
    const panel = editor(page)

    await choose(page, 'Links')
    for (const label of ['Farbe', 'Schnitt', 'Kursiv', 'Hintergrund', 'Unterstrichen'])
      await expect(panel.getByLabel(label, { exact: true }).first()).toBeVisible()
    await panel.locator('#prop-link-italic').check()
    await panel.locator('#prop-link-weight').selectOption({ label: 'Fett' })
    const fill = panel.locator('#prop-link-fill')
    await fill.fill('#e8f0fe')
    await fill.press('Tab')
    await expect.poll(toml).toContain('fill = "#e8f0fe"')
    expect(await toml()).toContain('italic = true')
    expect(await toml()).toContain('weight = "bold"')

    // A colour is one row: the colour field, the text, and the two colours of the palette as dots.
    const row = panel.locator('.row', { has: page.locator('#prop-link-color') })
    const boxes = await row.locator('input, button').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect()
        return Math.round(box.top + box.height / 2)
      }),
    )
    expect(new Set(boxes).size).toBe(1)
    expect(boxes.length).toBe(4)
    const dot = (name: string) =>
      row.getByRole('group', { name: 'Farbe aus der Palette' }).getByRole('button', { name })
    await dot('Zweitfarbe').click()
    await expect(panel.locator('#prop-link-color')).toHaveValue('accent_secondary')
    await expect(dot('Zweitfarbe')).toHaveAttribute('aria-pressed', 'true')
    await dot('Akzentfarbe').click()
    await expect(panel.locator('#prop-link-color')).toHaveValue('accent')
    await expect(dot('Zweitfarbe')).toHaveAttribute('aria-pressed', 'false')

    // Cross-references: the same, with a colour of the text.
    await choose(page, 'Querverweise')
    for (const label of ['Farbe', 'Schnitt', 'Kursiv', 'Hintergrund', 'Unterstrichen'])
      await expect(panel.getByLabel(label, { exact: true }).first()).toBeVisible()
    const color = panel.locator('#prop-references-color')
    await color.fill('#b00020')
    await color.press('Tab')
    await panel.locator('#prop-references-fill').fill('#fff2a8')
    await panel.locator('#prop-references-fill').press('Tab')
    await panel.locator('#prop-references-italic').check()
    await expect.poll(toml).toContain('[element.references]')
    expect(await toml()).toContain('color = "#b00020"')
    expect(await toml()).toContain('fill = "#fff2a8"')
    // The pages are made with them.
    await expect(panel.locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('citations have a style, and so has each list of contents: of figures, of tables', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Belege')
    const toml = () => readFile(style('belege'), 'utf8').catch(() => '')
    const panel = editor(page)

    await choose(page, 'Belege')
    for (const label of ['Farbe', 'Schnitt', 'Kursiv', 'Hintergrund', 'Unterstrichen'])
      await expect(panel.getByLabel(label, { exact: true }).first()).toBeVisible()
    await panel.locator('#prop-citations-italic').check()
    const fill = panel.locator('#prop-citations-fill')
    await fill.fill('#e8f0fe')
    await fill.press('Tab')
    await expect.poll(toml).toContain('fill = "#e8f0fe"')
    expect(await toml()).toContain('[element.citations]')
    expect(await toml()).toContain('italic = true')

    // A list of figures has the text of the contents and a title of its own.
    await choose(page, 'Abbildungsverzeichnis')
    const title = panel.locator('#prop-list_of_figures-list_title')
    await expect(title).toHaveValue('')
    await title.fill('Bilder')
    await title.press('Tab')
    await expect.poll(toml).toContain('list_title = "Bilder"')
    await choose(page, 'Tabellenverzeichnis')
    await expect(panel.locator('#prop-list_of_tables-list_title')).toHaveValue('')
    // The contents have theirs; a list does not take it over.
    await choose(page, 'Inhaltsverzeichnis')
    await expect(panel.locator('#prop-contents-title_text')).toHaveValue('')
    await expect(panel.locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByRole('alert')).toHaveCount(0)

    // The code is an entry of its own.
    await choose(page, 'Code')
    await expect(panel.getByLabel('Eckenradius')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('footnotes can be printed as margin notes, in the Tufte style', async () => {
  const { app, page } = await open()
  try {
    await openEditor(page)
    await makeCopy(page, 'Rand')
    const toml = () => readFile(style('rand'), 'utf8').catch(() => '')
    const panel = editor(page)

    await choose(page, 'Fußnote')
    const placement = panel.getByLabel('Platzierung')
    await expect(placement).toHaveValue('bottom')
    await expect(placement.locator('option')).toHaveText([
      'Unten auf der Seite',
      'Am Rand (Tufte-Stil)',
    ])
    await placement.selectOption({ label: 'Am Rand (Tufte-Stil)' })
    await expect.poll(toml).toContain('placement = "margin"')
    const width = panel.getByLabel('Breite der Randspalte')
    await expect(width).toHaveValue('4.5cm')
    await width.fill('5cm')
    await width.press('Tab')
    await expect.poll(toml).toContain('margin_width = "5cm"')

    // The pages are made with the notes in the margin (no error, and a changed picture of the template).
    await expect(panel.locator('img.page').first()).toBeVisible({ timeout: 30_000 })
    await expect(panel.getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
