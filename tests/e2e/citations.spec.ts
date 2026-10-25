import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  createSandbox,
  launch,
  launchAt,
  MOD,
  pastMenuGuard,
  quietFor,
  AUTOSAVE_SETTLE_MS,
  openSheet,
} from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const BIB = `
@article{smith2020, author = {Smith, John}, title = {Eine Studie}, journal = {Zeitschrift}, year = {2020}}
@book{jones2019, author = {Jones, Mary and M{\\"u}ller, J{\\"o}rg}, title = {Ein Buch}, year = {2019}}
@book{many2018, author = {A, B and C, D and E, F}, title = {Viele}, year = {2018}}
`
const SAMPLE =
  'Wie @smith2020 und @jones2019[S. 14] zeigen, siehe @unknown1 und @fig-a sowie #cite(<many2018>, form: "prose").\n\nSiehe auch @smith2020.\n'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE, 'library.bib': BIB })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function open() {
  return launchAt(sandbox, 'methoden/design.typ')
}

const chips = (page: Page) => page.locator('.cm-content .cm-cite')
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Beleg bearbeiten' })
const tokens = (page: Page) => dialog(page).locator('.cm-cite-token')
const search = (page: Page) => dialog(page).locator('input.cm-cite-search')
/** The form of the citation: a dropdown in front of the field. */
const form = (page: Page) => dialog(page).getByRole('combobox', { name: /Darstellung/ })
const results = (page: Page) => dialog(page).getByRole('listbox').getByRole('option')
const belegButton = (page: Page) =>
  page.locator('.toolbar').getByRole('button', { name: 'Beleg', exact: true })

async function openWith(content: string) {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({ [SHEET]: content, 'library.bib': BIB })
  return open()
}

test('draws citations as chips with author and year, and marks works that are not in the library', async () => {
  const { app, page } = await open()
  try {
    await expect(chips(page)).toHaveText([
      '(Smith 2020)',
      '(Jones und Müller 2019, S. 14)',
      '(unknown1)',
      'A et al. (2018)',
      '(Smith 2020)',
    ])
    await expect(chips(page).nth(2)).toHaveClass(/missing/)
    // (What is wrong with it is in the tooltip: see the test of the tooltip.)
    // A cross-reference is not a citation, and the citation syntax never shows.
    const text = await page.locator('.cm-content').innerText()
    expect(text).not.toContain('@fig-a')
    await expect(page.locator('.cm-content .cm-xref')).toHaveText(['fig-a'])
    expect(text).not.toContain('@smith2020')
    expect(text).not.toContain('#cite')
  } finally {
    await app.close()
  }
})

test('@ offers the works of the library while typing', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Und noch @smi')
    const menu = page.locator('.cm-tooltip-autocomplete')
    await expect(menu).toBeVisible()
    // What is being typed stays text: no chip for a key that is not complete yet.
    await expect(chips(page)).toHaveCount(5)
    await expect(menu.getByRole('option')).toHaveCount(1)
    await expect(menu).toContainText('smith2020')
    await expect(menu).toContainText('Smith 2020')
    // The menu ignores Enter for a moment after it opens, so a fast typist does not choose by accident.
    await pastMenuGuard(page)
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('Und noch @smith2020')
    await expect(chips(page).last()).toHaveText('(Smith 2020)')

    // By author or title words too, and not at all inside a word.
    await page.keyboard.type(' und @viel')
    await expect(menu.getByRole('option')).toHaveCount(1)
    await expect(menu).toContainText('many2018')
    await page.keyboard.press('Escape')
    await page.keyboard.type(' mail name@smi')
    await expect(menu).toBeHidden()
  } finally {
    await app.close()
  }
})

test('a citation is atomic: Backspace selects it, a second press removes it whole', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').getByText('Siehe auch').click()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft') // before the full stop
    await page.keyboard.press('Backspace')
    await expect(chips(page).last()).toHaveClass(/selected/)
    expect(await read()).toContain('Siehe auch @smith2020.')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('Siehe auch .')
    expect(await read()).not.toMatch(/Siehe auch @|smith2020\.$/)
  } finally {
    await app.close()
  }
})

test('reads the library again when the file changes, and shows works that appear', async () => {
  const { app, page } = await open()
  try {
    await expect(chips(page).nth(2)).toHaveClass(/missing/)
    await writeFile(
      join(sandbox.projectDir, 'library.bib'),
      `${BIB}\n@book{unknown1, author = {Neu, Nora}, title = {Neu}, year = {2024}}\n`,
    )
    await expect(chips(page).nth(2)).toHaveText('(Neu 2024)')
    await expect(chips(page).nth(2)).not.toHaveClass(/missing/)
  } finally {
    await app.close()
  }
})

test('citations show in the continuous view and in a note, and Quelltext shows the syntax', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: 'Text.#footnote[Siehe @smith2020[S. 2].] Und @jones2019.\n',
    'library.bib': BIB,
  })
  const { app, page } = await launch(sandbox)
  try {
    await page.locator('[role=treeitem][data-path="methoden"]').click()
    await expect(chips(page).filter({ hasText: 'Jones und Müller 2019' })).toHaveCount(1)
    await page.locator('[role=option][data-path="methoden/design.typ"]').click()
    await page.locator('.cm-footnote-marker').first().click()
    // The note is written in its margin card.
    const nested = page.locator('.cm-note-card.editing .cm-note-edit .cm-cite')
    await expect(nested).toHaveText('(Smith 2020, S. 2)')
    await page.keyboard.press('Escape')
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await expect(page.locator('.cm-content')).toContainText('@jones2019')
    await expect(chips(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a citation typed next to a group takes its form once the caret has moved on', async () => {
  const { app, page } = await openWith('Wie #cite(<smith2020>, form: "prose")')
  try {
    await expect(chips(page)).toHaveText(['Smith (2020)'])
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(' @jones2019')
    await page.keyboard.press('Escape') // close the @ menu
    // Still typing here: nothing is rewritten under the caret.
    await expect.poll(read).toContain('form: "prose") @jones2019')

    await page.keyboard.type(' und')
    await expect
      .poll(read)
      .toContain('Wie #cite(<smith2020>, form: "prose") #cite(<jones2019>, form: "prose") und')
    await expect(chips(page)).toHaveText(['Smith (2020); Jones und Müller (2019)'])

    // Undo goes back step by step: first the typed word, then the conversion. The conversion is
    // not made again behind the writer's back.
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).not.toContain('und')
    expect(await read()).toContain('#cite(<jones2019>, form: "prose")')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toContain('form: "prose") @jones2019')
    // Nothing is made again behind the writer's back once the undo is saved.
    await quietFor(page, AUTOSAVE_SETTLE_MS)
    expect(await read()).toContain('form: "prose") @jones2019')
    expect(await read()).not.toContain('<jones2019>')
  } finally {
    await app.close()
  }
})

test('a group is one atomic chip: Backspace selects all of it, a second press removes it', async () => {
  const { app, page } = await openWith('Wie @smith2020 @jones2019 zeigen.\n')
  try {
    await expect(chips(page)).toHaveText(['(Smith 2020; Jones und Müller 2019)']) // drawn before keys
    await page.locator('.cm-content').getByText('zeigen').click()
    await page.keyboard.press('Home')
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight') // after "Wie "
    await page.keyboard.press('ArrowRight') // over the chip
    await page.keyboard.press('Backspace')
    await expect(chips(page).first()).toHaveClass(/selected/)
    expect(await read()).toContain('@smith2020 @jones2019')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('Wie  zeigen.')
    expect(await read()).not.toMatch(/@|cite/)
  } finally {
    await app.close()
  }
})

test('a key that is still being typed does not join the chip of the group before it', async () => {
  const { app, page } = await openWith('Wie @smith2020 @jones2019')
  try {
    await expect(chips(page)).toHaveText(['(Smith 2020; Jones und Müller 2019)'])
    await page.locator('.cm-content').focus()
    await expect(page.locator('.cm-content')).toBeFocused()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(' @man')
    await page.keyboard.press('Escape') // close the @ menu
    // Plain text while typed: the chip is still the two works.
    await expect(chips(page)).toHaveText(['(Smith 2020; Jones und Müller 2019)'])
    await expect(page.locator('.cm-content')).toContainText('@man')
    await page.keyboard.type('y2018')
    // The key is complete and known: it is part of the chip.
    await expect(chips(page)).toHaveText(['(Smith 2020; Jones und Müller 2019; A et al. 2018)'])
  } finally {
    await app.close()
  }
})

test('edits the page reference and the form in the editor, and removes a citation', async () => {
  const { app, page } = await open()
  try {
    await chips(page).first().click()
    await expect(dialog(page)).toBeVisible()
    await expect(tokens(page)).toHaveText(['Smith 2020×'])
    // A click on the work in the field selects it: its row shows the page reference.
    await tokens(page).first().click()
    await expect(dialog(page)).toContainText('Smith 2020 – Eine Studie')

    await page.getByLabel('Seite oder Stelle').fill('S. 5')
    await expect(chips(page).first()).toHaveText('(Smith 2020, S. 5)')
    await expect.poll(read).toContain('Wie @smith2020[S. 5] und')

    await form(page).selectOption({ label: 'Nur Jahr' })
    await expect(chips(page).first()).toHaveText('2020, S. 5')
    await expect.poll(read).toContain('#cite(<smith2020>, supplement: [S. 5], form: "year")')
    await form(page).selectOption({ label: 'Autor Jahr' })
    await expect.poll(read).toContain('Wie @smith2020[S. 5] und')

    // Brackets that do not match are refused, and the text keeps what it had.
    await page.getByLabel('Seite oder Stelle').fill('S. [5')
    await expect(page.getByText('Die Klammern in der Angabe passen nicht zusammen.')).toBeVisible()
    expect(await read()).toContain('@smith2020[S. 5]')

    // Removing the only work removes the citation; the editor stays, ready for another one.
    await dialog(page).getByRole('button', { name: 'Beleg entfernen' }).click()
    await expect(chips(page)).toHaveCount(4)
    await expect(dialog(page)).toBeVisible()
    await expect(tokens(page)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await page.keyboard.press(`${MOD}+z`)
    await expect(chips(page)).toHaveCount(5)
  } finally {
    await app.close()
  }
})

test('the Beleg button opens the editor empty: search, add a work, then more, in one field', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Noch ein Satz')
    await belegButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect(search(page)).toBeFocused()
    // A fixed first row for a place that needs a citation, then the three works.
    await expect(results(page)).toHaveCount(4)
    await search(page).fill('müller 2019')
    await expect(results(page)).toHaveCount(2)
    await expect(results(page).nth(1)).toContainText('Jones und Müller 2019')
    await page.keyboard.press('Enter')
    // The citation is in the text at once, and its work is a chip in the field, selected.
    await expect.poll(read).toContain('Noch ein Satz @jones2019')
    await expect(chips(page).last()).toHaveText('(Jones und Müller 2019)')
    await expect(tokens(page)).toHaveText(['Jones und Müller 2019×'])
    await expect(dialog(page)).toContainText('Jones und Müller 2019 – Ein Buch')
    await page.getByLabel('Seite oder Stelle').fill('S. 3')
    await expect.poll(read).toContain('Noch ein Satz @jones2019[S. 3]')

    // The same field takes the next work; no other button is needed.
    await search(page).fill('viele')
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('Noch ein Satz @jones2019[S. 3] @many2018')
    await expect(chips(page).last()).toHaveText('(Jones und Müller 2019, S. 3; A et al. 2018)')
    await expect(tokens(page)).toHaveCount(2)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
  } finally {
    await app.close()
  }
})

test("a form chosen before the first work is the new citation's, and the work row is one line", async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Wie')
    await belegButton(page).click()
    // The form is a dropdown in front of the field; there is no file to choose here.
    await expect(form(page)).toHaveValue('normal')
    await expect(dialog(page).getByRole('button', { name: /Datei/ })).toHaveCount(0)
    await form(page).selectOption({ label: 'Prosa' })
    await expect(search(page)).toBeFocused()
    await search(page).fill('müller')
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('Wie #cite(<jones2019>, form: "prose")')
    await expect(form(page)).toHaveValue('prose')

    // Page reference, flag, and remove sit in one row; the note appears once the work is flagged.
    const row = dialog(page).locator('.cm-cite-member-row')
    await expect(row.getByLabel('Seite oder Stelle')).toBeVisible()
    await expect(row.getByRole('button', { name: 'Zu prüfen' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(row.getByRole('button', { name: 'Beleg entfernen' })).toBeVisible()
    await expect(page.getByLabel('Notiz zur Prüfung')).toBeHidden()
    await row.getByRole('button', { name: 'Zu prüfen' }).click()
    await expect(row.getByRole('button', { name: 'Zu prüfen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByLabel('Notiz zur Prüfung')).toBeFocused()
    await expect(chips(page).last().locator('svg.cm-cite-flag')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the citation editor is centered horizontally on the editor, wherever the citation is', async () => {
  const { app, page } = await open()
  try {
    const offset = async () => {
      const box = (await dialog(page).boundingBox())!
      const area = (await page.locator('.cm-scroller').boundingBox())!
      return Math.abs(box.x + box.width / 2 - (area.x + area.width / 2))
    }
    // From a chip at the start of the text, and from a new citation at the end of it.
    await chips(page).first().click()
    await expect(dialog(page)).toBeVisible()
    await expect.poll(offset).toBeLessThan(2)
    await page.keyboard.press('Escape')
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await belegButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await expect.poll(offset).toBeLessThan(2)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1180, height: 700 })
    await chips(page).first().click()
    await expect(dialog(page)).toBeVisible()
    await expect.poll(offset).toBeLessThan(2)
  } finally {
    await app.close()
  }
})

test('closing the editor without choosing a work inserts nothing', async () => {
  const { app, page } = await open()
  try {
    const before = await read()
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await belegButton(page).click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await quietFor(page, AUTOSAVE_SETTLE_MS)
    expect(await read()).toBe(before)
  } finally {
    await app.close()
  }
})

test('a work is changed later without taking the citation out: select it, search, choose', async () => {
  const { app, page } = await openWith('Wie @smith2020[S. 4]/*#check: prüfen*/ zeigt.\n')
  try {
    await chips(page).first().click()
    await tokens(page).first().click()
    // The field says the next choice replaces this work.
    await expect(search(page)).toHaveAttribute('placeholder', /ersetzen/)
    await search(page).fill('jones')
    await page.keyboard.press('Enter')
    // Page reference and check mark stay with the citation.
    await expect.poll(read).toContain('Wie @jones2019[S. 4]/*#check: prüfen*/ zeigt.')
    await expect(chips(page).first()).toHaveText('(Jones und Müller 2019, S. 4)')
    await expect(tokens(page)).toHaveText(['Jones und Müller 2019, S. 4×'])
  } finally {
    await app.close()
  }
})

test('a citation can be left out of the text, and marked to check later', async () => {
  const { app, page } = await open()
  try {
    await chips(page).first().click()
    await form(page).selectOption({ label: 'Prosa' })
    await expect(chips(page).first()).toHaveText('Smith (2020)')
    await form(page).selectOption({ label: 'Nicht gedruckt' })
    await expect.poll(read).toContain('Wie #cite(<smith2020>, form: none) und')
    await expect(chips(page).first()).toHaveClass(/unprinted/)
    await form(page).selectOption({ label: 'Autor Jahr' })
    await expect.poll(read).toContain('Wie @smith2020 und')

    // The check mark is a comment right behind the citation, with a note if there is one.
    await tokens(page).first().click()
    await dialog(page).getByRole('button', { name: 'Zu prüfen' }).click()
    await expect.poll(read).toContain('Wie @smith2020/*#check*/ und')
    await expect(chips(page).first()).toHaveClass(/check/)
    await expect(chips(page).first().locator('.cm-cite-flag')).toBeVisible()
    await page.getByLabel('Notiz zur Prüfung').fill('Jahr prüfen')
    await expect.poll(read).toContain('Wie @smith2020/*#check: Jahr prüfen*/ und')
    // The comment is part of the chip: no comment pill beside it.
    await expect(page.locator('.cm-content .cm-comment-pill')).toHaveCount(0)
    await expect(chips(page)).toHaveCount(5)

    await dialog(page).getByRole('button', { name: 'Zu prüfen' }).click()
    await expect.poll(read).toContain('Wie @smith2020 und')
    expect(await read()).not.toContain('check')
  } finally {
    await app.close()
  }
})

test('a place that needs a citation is one fixed row, with nothing to type', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Die Zahl stimmt')
    await belegButton(page).click()
    // The first row, always there, also when words are typed and no work matches.
    await expect(results(page).first()).toContainText('Beleg fehlt')
    await search(page).fill('keinwerk')
    await expect(results(page)).toHaveCount(1)
    await search(page).fill('')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('Die Zahl stimmt/*#cite-needed*/')
    await expect(dialog(page)).toBeHidden()
    const needed = page.locator('.cm-content .cm-cite-needed')
    await expect(needed).toHaveText('Beleg fehlt')
    // Not a citation: no chip of the five, and nothing the export would show.
    await expect(chips(page)).toHaveCount(5)
  } finally {
    await app.close()
  }
})

test('a place that needs a citation takes works in its place, and can be removed', async () => {
  const { app, page } = await openWith('Das stimmt/*#cite-needed*/. Und das/*#cite-needed*/.\n')
  try {
    const needed = page.locator('.cm-content .cm-cite-needed')
    await expect(needed).toHaveCount(2)
    await needed.first().click()
    await expect(dialog(page)).toBeVisible()
    await expect(tokens(page)).toHaveText(['Beleg fehlt×'])
    // The fixed row is not offered here: this place gets a work.
    await expect(results(page)).toHaveCount(3)
    await search(page).fill('smith')
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('Das stimmt @smith2020. Und das/*#cite-needed*/.')
    await expect(needed).toHaveCount(1)
    // The editor goes on with the citation that took its place.
    await expect(tokens(page)).toHaveText(['Smith 2020×'])
    await page.keyboard.press('Escape')

    await needed.click()
    await tokens(page)
      .getByRole('button', { name: /Entfernen/ })
      .click()
    await expect.poll(read).toBe('Das stimmt @smith2020. Und das.\n')
    await expect(dialog(page)).toBeHidden()
  } finally {
    await app.close()
  }
})

test('several works are cited one after the other in the same field', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Mehrere Studien')
    await belegButton(page).click()
    await search(page).fill('smith')
    await page.keyboard.press('Enter')
    await search(page).fill('viele')
    await page.keyboard.press('Enter')
    await search(page).fill('jones')
    await page.keyboard.press('Enter')
    // Next to each other, with a space: Typst prints them as one group, and the editor shows one chip.
    await expect.poll(read).toContain('Mehrere Studien @smith2020 @many2018 @jones2019')
    await expect(chips(page)).toHaveCount(6)
    await expect(chips(page).nth(5)).toHaveText(
      '(Smith 2020; A et al. 2018; Jones und Müller 2019)',
    )
    await expect(tokens(page)).toHaveCount(3)
    // The works already in the citation are not offered again.
    await search(page).fill('')
    await expect(results(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('Backspace in the empty search selects the last work, a second press removes it', async () => {
  const { app, page } = await openWith('Wie @smith2020 @jones2019 zeigt.\n')
  try {
    await chips(page).first().click()
    await expect(tokens(page)).toHaveCount(2)
    await page.keyboard.press('Backspace')
    await expect(tokens(page).nth(1)).toHaveClass(/selected/)
    expect(await read()).toContain('@smith2020 @jones2019')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('Wie @smith2020 zeigt.')
    await expect(tokens(page)).toHaveCount(1)
    // The arrow keys move between the works.
    await page.keyboard.press('ArrowLeft')
    await expect(tokens(page).first()).toHaveClass(/selected/)
    await page.keyboard.press('ArrowRight')
    await expect(tokens(page).first()).not.toHaveClass(/selected/)
  } finally {
    await app.close()
  }
})

test('the form belongs to the whole group: one choice in the editor sets it for all', async () => {
  const { app, page } = await openWith('Wie @smith2020 @jones2019[S. 4] zeigen.\n')
  try {
    await expect(chips(page)).toHaveText(['(Smith 2020; Jones und Müller 2019, S. 4)'])
    await chips(page).first().click()
    await expect(form(page)).toHaveAttribute('title', /gilt für alle 2 Werke der Gruppe/)
    await form(page).selectOption({ label: 'Nur Jahr' })
    await expect(chips(page)).toHaveText(['2020; 2019, S. 4'])
    await expect
      .poll(read)
      .toContain(
        'Wie #cite(<smith2020>, form: "year") #cite(<jones2019>, supplement: [S. 4], form: "year") zeigen.',
      )

    // Silencing a group silences all of it, instead of leaving an empty place in the PDF.
    await form(page).selectOption({ label: 'Nicht gedruckt' })
    await expect(page.locator('.cm-content .cm-cite.unprinted')).toHaveCount(1)

    await form(page).selectOption({ label: 'Autor Jahr' })
    await expect.poll(read).toContain('Wie @smith2020 @jones2019[S. 4] zeigen.')
  } finally {
    await app.close()
  }
})

test('only the group that was edited is made equal, other mixed groups stay as they are', async () => {
  const { app, page } = await openWith(
    '@smith2020 #cite(<jones2019>, form: "prose")\n\nEin Absatz.\n',
  )
  try {
    // Typing elsewhere leaves the old, mixed group alone.
    await page.locator('.cm-content').getByText('Ein Absatz.').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Mehr')
    await expect.poll(read).toContain('Ein Absatz. Mehr')
    expect(await read()).toContain('@smith2020 #cite(<jones2019>, form: "prose")')

    // Editing a citation of the group makes the group equal.
    await chips(page).first().click()
    await tokens(page).first().click()
    await page.getByLabel('Seite oder Stelle').fill('S. 2')
    await expect
      .poll(read)
      .toContain(
        '#cite(<smith2020>, supplement: [S. 2], form: "prose") #cite(<jones2019>, form: "prose")',
      )
  } finally {
    await app.close()
  }
})

test('works added to a citation take its form', async () => {
  const { app, page } = await openWith('Wie #cite(<smith2020>, form: "prose").\n')
  try {
    await chips(page).first().click()
    await search(page).fill('jones')
    await page.keyboard.press('Enter')
    await search(page).fill('viele')
    await page.keyboard.press('Enter')
    await expect
      .poll(read)
      .toContain(
        'Wie #cite(<smith2020>, form: "prose") #cite(<jones2019>, form: "prose") #cite(<many2018>, form: "prose").',
      )
    await expect(chips(page)).toHaveText(['Smith (2020); Jones und Müller (2019); A et al. (2018)'])
  } finally {
    await app.close()
  }
})

test('a group of citations is one chip, edited together, with the works in one field', async () => {
  const { app, page } = await openWith(
    'Wie @smith2020 @jones2019[S. 4] @many2018 zeigen. Und @smith2020.\n',
  )
  try {
    // One chip for the three that print together, and one for the single citation.
    await expect(chips(page)).toHaveText([
      '(Smith 2020; Jones und Müller 2019, S. 4; A et al. 2018)',
      '(Smith 2020)',
    ])
    await chips(page).first().click()
    await expect(tokens(page)).toHaveText([
      'Smith 2020×',
      'Jones und Müller 2019, S. 4×',
      'A et al. 2018×',
    ])
    await tokens(page).nth(1).click()
    await expect(page.getByLabel('Seite oder Stelle')).toHaveValue('S. 4')

    // Each work keeps its own page reference and check mark.
    await tokens(page).nth(2).click()
    await page.getByLabel('Seite oder Stelle').fill('S. 9')
    await tokens(page).nth(0).click()
    await dialog(page).getByRole('button', { name: 'Zu prüfen' }).click()
    await expect
      .poll(read)
      .toContain('Wie @smith2020/*#check*/ @jones2019[S. 4] @many2018[S. 9] zeigen.')
    await expect(chips(page).first()).toHaveClass(/check/)

    // A work is taken out of the group with its ×; the white space goes with it.
    await tokens(page)
      .nth(1)
      .getByRole('button', { name: /Entfernen/ })
      .click()
    await expect.poll(read).toContain('Wie @smith2020/*#check*/ @many2018[S. 9] zeigen.')
    await expect(tokens(page)).toHaveCount(2)
    await tokens(page)
      .nth(1)
      .getByRole('button', { name: /Entfernen/ })
      .click()
    await expect.poll(read).toContain('Wie @smith2020/*#check*/ zeigen.')
    // The last one is a citation of its own: removing it removes the chip; the editor stays, empty.
    await tokens(page)
      .first()
      .getByRole('button', { name: /Entfernen/ })
      .click()
    await expect.poll(read).toContain('Wie  zeigen.')
    await expect(tokens(page)).toHaveCount(0)
    await expect(dialog(page)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a bibliography file outside the project is chosen and watched where it is', async () => {
  const external = join(sandbox.base, 'zotero-export.bib')
  await writeFile(external, '@book{unknown1, author = {Neu, Nora}, title = {Neu}, year = {2024}}\n')
  const { app, page } = await launch(sandbox, { env: { EZETTA_TEST_BIB: external } })
  try {
    await openSheet(page, 'methoden/design.typ')
    await expect(chips(page).nth(2)).toHaveClass(/missing/)

    // The file is chosen in the project menu; the citation editor does not show it.
    await belegButton(page).click()
    await expect(dialog(page)).not.toContainText('library.bib')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Projektmenü' }).click()
    await page.getByRole('menuitem', { name: 'Bibliographie-Datei wählen …' }).click()
    await expect(chips(page).nth(2)).toHaveText('(Neu 2024)')
    // The other works are no longer there: this file replaced the project's own.
    await expect(chips(page).first()).toHaveClass(/missing/)

    // The project names the file where it is; nothing was copied into the project.
    const toml = await readFile(join(sandbox.projectDir, 'project.toml'), 'utf8')
    expect(toml).toContain(`bibliography = ${JSON.stringify(external)}`)
    expect(await readFile(join(sandbox.projectDir, 'library.bib'), 'utf8')).toBe(BIB)

    // Another program writes the file: the editor follows.
    await writeFile(
      external,
      '@book{unknown1, author = {Neu, Nora}, title = {Neu}, year = {2025}}\n@book{smith2020, author = {Smith, John}, year = {1999}}\n',
    )
    await expect(chips(page).nth(2)).toHaveText('(Neu 2025)')
    await expect(chips(page).first()).toHaveText('(Smith 1999)')
  } finally {
    await app.close()
  }
})

test('a citation is on a pale ground, one to check is yellow, one not in the library has a dashed red outline, and a place that needs one is red', async () => {
  const { app, page } = await openWith(
    'Normal @smith2020, geprüft @jones2019/*#check*/\n\nFehlt @unknown1 und hier/*#cite-needed*/.\n',
  )
  try {
    const style = (selector: string, n: number) =>
      page
        .locator(selector)
        .nth(n)
        .evaluate((el) => {
          const css = getComputedStyle(el)
          return { ground: css.backgroundColor, line: css.outlineStyle }
        })
    const token = (name: string) =>
      page.evaluate((v) => {
        const probe = document.createElement('span')
        probe.style.backgroundColor = `var(${v})`
        document.body.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      }, name)
    await expect(chips(page)).toHaveCount(3)
    // A normal one is on a pale ground, quieter than the selection's, which it gets on hover.
    const pale = (await style('.cm-content .cm-cite', 0)).ground
    expect(pale).not.toBe('rgba(0, 0, 0, 0)')
    expect(pale).not.toBe(await token('--color-selection'))
    await chips(page).first().hover()
    await expect
      .poll(async () => (await style('.cm-content .cm-cite', 0)).ground)
      .toBe(await token('--color-selection'))
    expect((await style('.cm-content .cm-cite', 1)).ground).toBe(await token('--color-mark'))
    const missing = await style('.cm-content .cm-cite', 2)
    expect(missing.line).toBe('dashed')
    expect(missing.ground).toBe('rgba(0, 0, 0, 0)')
    const needed = await style('.cm-content .cm-cite-needed', 0)
    expect(needed.ground).toBe(await token('--color-danger-ground'))
    // No question mark in front of the text.
    await expect(page.locator('.cm-content .cm-cite-needed')).toHaveText('Beleg fehlt')
    expect(
      await page
        .locator('.cm-content .cm-cite-needed')
        .evaluate((el) => getComputedStyle(el, '::before').content),
    ).toMatch(/^(none|normal)$/)
  } finally {
    await app.close()
  }
})

const tip = (page: Page) => page.locator('.cm-chip-tooltip')

test('hovering a chip shows the whole work: title, authors, year, and where it appeared', async () => {
  const { app, page } = await open()
  try {
    // Nothing shows until the pointer rests on the chip.
    await expect(tip(page)).toHaveCount(0)
    await chips(page).first().hover()
    await expect(tip(page)).toBeVisible()
    await expect(tip(page)).toContainText('Eine Studie')
    await expect(tip(page)).toContainText('Smith, John')
    await expect(tip(page)).toContainText('2020')
    await expect(tip(page)).toContainText('Zeitschrift')
    // A group tells every work, with its full author list.
    await page.mouse.move(0, 0)
    await expect(tip(page)).toHaveCount(0)
    await chips(page).nth(1).hover()
    await expect(tip(page)).toContainText('Ein Buch')
    await expect(tip(page)).toContainText('Jones, Mary; Müller, Jörg')
    // It follows the pointer away, and a click (which opens the editor) ends it.
    await chips(page).first().hover()
    await expect(tip(page)).toBeVisible()
    await chips(page).first().click()
    await expect(tip(page)).toHaveCount(0)
    await expect(dialog(page)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the tooltip of a chip says what is wrong with it: a missing work, a mark to check, a citation that prints nothing', async () => {
  const { app, page } = await openWith(
    'Fehlt @unknown1, geprüft @smith2020/*#check: Jahr prüfen*/ und #cite(<jones2019>, form: none).\n',
  )
  try {
    await chips(page).nth(0).hover()
    await expect(tip(page)).toContainText('„unknown1“ steht nicht in der Bibliographie')
    await page.mouse.move(0, 0)
    await chips(page).nth(1).hover()
    await expect(tip(page)).toContainText('Eine Studie')
    await expect(tip(page)).toContainText('Zu prüfen: Jahr prüfen')
    await page.mouse.move(0, 0)
    await chips(page).nth(2).hover()
    await expect(tip(page)).toContainText('Ein Buch')
    await expect(tip(page)).toContainText('nur in der Bibliographie')
  } finally {
    await app.close()
  }
})

test('every citation, and a place without one, is set at the size of the text around it, the pills all as tall', async () => {
  const { app, page } = await openWith(
    'Normal @smith2020[S. 4], im Satz #cite(<jones2019>, form: "prose"), das Jahr ' +
      '#cite(<smith2020>, form: "year"), nicht gedruckt #cite(<smith2020>, form: none), fehlt @unknown1, ohne/*#cite-needed*/.\n' +
      '#quote(block: true, attribution: [vgl. @smith2020[S. 3]])[Ein Zitat.]\n',
  )
  try {
    await expect(chips(page)).toHaveCount(6)
    const sizes = await page
      .locator('.cm-content')
      .evaluate((content) =>
        Array.from(
          content.querySelectorAll('.cm-cite, .cm-cite-needed, .cm-quote-source-text'),
        ).map(
          (el) =>
            getComputedStyle(el).fontSize === getComputedStyle(el.closest('.cm-line')!).fontSize,
        ),
      )
    expect(sizes).toEqual(Array(8).fill(true))
    // The pills are all as tall, the dashed ones (not in the library, not printed) and the place
    // without a citation too.
    const heights = await page
      .locator('.cm-content')
      .evaluate((content) =>
        Array.from(content.querySelectorAll('.cm-cite:not(.prose), .cm-cite-needed')).map((el) =>
          Math.round(el.getBoundingClientRect().height),
        ),
      )
    expect(new Set(heights).size).toBe(1)
    // Only the citation in the sentence is underlined text; the others are pills.
    await expect(page.locator('.cm-content .cm-cite.prose')).toHaveText(['Jones und Müller (2019)'])
  } finally {
    await app.close()
  }
})
