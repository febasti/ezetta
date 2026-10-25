import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  createSandbox,
  launchAt,
  MOD,
  pastMenuGuard,
  quietFor,
  AUTOSAVE_SETTLE_MS,
} from './helpers'
import type { Sandbox } from './helpers'

const DESIGN = 'content/methoden/design.typ'
const AUSWERTUNG = 'content/methoden/auswertung.typ'

const DESIGN_TEXT = `= Design

Das Design der Studie.

== Stichprobe <sec-stichprobe>

Die Stichprobe ist klein.

#figure(
  table(
    columns: 1,
    table.header[Wert],
    [x],
  ),
  caption: [Werte],
) <tbl-werte>

$ E = m c^2 $

Ende des Abschnitts.
`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [DESIGN]: DESIGN_TEXT,
    [AUSWERTUNG]: '= Auswertung\n\nEin Satz.\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = (path: string) => readFile(join(sandbox.projectDir, path), 'utf8')

async function open(sheet = 'design.typ') {
  return launchAt(sandbox, `methoden/${sheet}`)
}

const picker = (page: Page) => page.getByRole('dialog', { name: 'Querverweis' })
const chips = (page: Page) => page.locator('.cm-content .cm-xref')
/** The list of targets (the dropdown has options too). */
const listbox = (page: Page) => picker(page).getByRole('listbox')
const search = (page: Page) => picker(page).locator('input.cm-ref-search')
/** The dropdown in front of the field: all targets, or one kind. */
const kind = (page: Page) => picker(page).getByRole('combobox', { name: 'Art des Ziels' })

/** Puts the caret at the very end of the sheet's last line. */
async function caretAtEnd(page: Page) {
  // The top left corner is the first line: the middle of the sheet may be a table.
  await page.locator('.cm-content').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press(`${MOD}+End`)
}

test('draws references as chips with the number the PDF prints, and marks a missing target', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.keyboard.type('Siehe @sec-stichprobe, @tbl-werte, @eq-fehlt und mehr.')
    // The headings of the project count in order: Einleitung is 1, Design 2, Stichprobe 2.1.
    // A reference that nothing answers to is a chip too once the caret has left it.
    await expect(chips(page)).toHaveText(['Abschnitt 2.1', 'Tabelle 1', 'eq-fehlt'])
    await expect(chips(page).nth(2)).toHaveClass(/missing/)
    await expect(chips(page).nth(0)).not.toHaveClass(/missing/)
  } finally {
    await app.close()
  }
})

test('the label of a heading stays out of sight, and Enter at the end keeps it on the heading', async () => {
  const { app, page } = await open()
  try {
    const heading = page.locator('.cm-content .cm-line', { hasText: 'Stichprobe' }).first()
    await expect(heading).toHaveText('== Stichprobe')
    // Click to the right of the text, then press Enter: the new line starts after the label.
    const box = (await heading.boundingBox())!
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Neuer Absatz')
    await expect
      .poll(() => read(DESIGN))
      .toContain('== Stichprobe <sec-stichprobe>\nNeuer Absatz\n')
    await expect(page.locator('.cm-content')).not.toContainText('<sec-')
  } finally {
    await app.close()
  }
})

test('the Querverweis tool picks a target and writes the reference, giving a heading its label', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    await expect(picker(page)).toBeVisible()
    // Headings, tables and equations of the project are listed, with the number each prints.
    await expect(listbox(page).getByRole('option').first()).toContainText('Abschnitt 1')
    await expect(listbox(page).getByRole('option', { name: /Tabelle 1/ })).toBeVisible()
    await expect(listbox(page).getByRole('option', { name: /Gleichung \(1\)/ })).toBeVisible()
    await search(page).fill('stichprobe')
    await expect(listbox(page).getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(picker(page)).toHaveCount(0)
    await expect(chips(page)).toHaveText(['Abschnitt 2.1'])
    await expect.poll(() => read(DESIGN)).toContain('Ende des Abschnitts.\n@sec-stichprobe')
  } finally {
    await app.close()
  }
})

test('the picker is centered horizontally on the editor, wherever the caret is', async () => {
  const { app, page } = await open()
  try {
    const offset = async () => {
      const box = (await picker(page).boundingBox())!
      const area = (await page.locator('.cm-scroller').boundingBox())!
      return Math.abs(box.x + box.width / 2 - (area.x + area.width / 2))
    }
    // At the start of a line, at the end of a long one, and in a narrower window.
    await page.locator('.cm-content').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('Home')
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    await expect(picker(page)).toBeVisible()
    await expect.poll(offset).toBeLessThan(2)
    await page.keyboard.press('Escape')
    await caretAtEnd(page)
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    await expect(picker(page)).toBeVisible()
    await expect.poll(offset).toBeLessThan(2)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1180, height: 700 })
    await caretAtEnd(page)
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    await expect(picker(page)).toBeVisible()
    await expect.poll(offset).toBeLessThan(2)
  } finally {
    await app.close()
  }
})

test('a block formula without a label gets one when it is referred to', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.keyboard.press(`${MOD}+Alt+r`)
    await expect(picker(page)).toBeVisible()
    await search(page).fill('gleichung')
    await page.keyboard.press('Enter')
    await expect(chips(page)).toHaveText(['Gleichung (1)'])
    await expect.poll(() => read(DESIGN)).toContain('$ E = m c^2 $ <eq-')
    const text = await read(DESIGN)
    expect(text).toMatch(/Ende des Abschnitts\.\n@eq-[a-z0-9-]+$/)
    // The formula keeps its place and the label stays inside its widget.
    await expect(page.locator('.cm-content')).not.toContainText('<eq-')
  } finally {
    await app.close()
  }
})

test('a heading in another sheet gets its label in that sheet’s file', async () => {
  const { app, page } = await open('auswertung.typ')
  try {
    await caretAtEnd(page)
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    await search(page).fill('design')
    // The heading "Design" is in design.typ and has no label yet.
    await expect(listbox(page).getByRole('option').first()).toContainText('Abschnitt 2')
    await expect(listbox(page).getByRole('option').first()).toContainText('Design')
    await page.keyboard.press('Enter')
    await expect(chips(page)).toHaveText(['Abschnitt 2'])
    expect(await read(DESIGN)).toContain('= Design <sec-design>\n')
    await expect.poll(() => read(AUSWERTUNG)).toContain('Ein Satz.\n@sec-design')
    // The chip stays resolved after the watcher reports the change.
    await quietFor(page, AUTOSAVE_SETTLE_MS)
    await expect(chips(page)).toHaveText(['Abschnitt 2'])
    await expect(chips(page).first()).not.toHaveClass(/missing/)
  } finally {
    await app.close()
  }
})

test('@ offers the targets next to the works, and Enter writes the label', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.keyboard.type('Vgl. @tab')
    const menu = page.locator('.cm-tooltip-autocomplete')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Tabelle 1')
    await pastMenuGuard(page)
    await page.keyboard.press('Enter')
    await expect(chips(page)).toHaveText(['Tabelle 1'])
    await expect.poll(() => read(DESIGN)).toContain('Vgl. @tbl-werte')
  } finally {
    await app.close()
  }
})

test('clicking a chip opens the picker: pick another target, go to the target, or remove it', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.keyboard.type('@tbl-werte ')
    await expect(chips(page)).toHaveText(['Tabelle 1'])
    await chips(page).first().click()
    await expect(picker(page)).toBeVisible()
    // The current target is marked, and a different one replaces it.
    await expect(picker(page).locator('li.current')).toContainText('Tabelle 1')
    await search(page).fill('stichprobe')
    await page.keyboard.press('Enter')
    await expect(chips(page)).toHaveText(['Abschnitt 2.1'])
    await expect.poll(() => read(DESIGN)).toContain('@sec-stichprobe')
    expect(await read(DESIGN)).not.toContain('@tbl-werte')

    // Go to the target: the caret moves to the heading.
    await chips(page).first().click()
    await picker(page).getByRole('button', { name: 'Zum Ziel' }).click()
    await expect(picker(page)).toHaveCount(0)
    await page.keyboard.type('ZZ')
    await expect.poll(() => read(DESIGN)).toContain('ZZ== Stichprobe')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')

    // Remove.
    await chips(page).first().click()
    await picker(page).getByRole('button', { name: 'Verweis entfernen' }).click()
    await expect(chips(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('Backspace next to a chip selects it first, and a second press deletes it', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.keyboard.type('@tbl-werte')
    await page.keyboard.type(' ')
    await page.keyboard.press('Backspace') // the space
    await page.keyboard.press('Backspace') // selects the chip
    await expect(chips(page).first()).toHaveClass(/selected/)
    await page.keyboard.press('Backspace')
    await expect(chips(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a dropdown in front of the field limits the list to one kind, and every row has the icon of its kind', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    await expect(picker(page)).toBeVisible()
    const rows = listbox(page).getByRole('option')
    await expect(kind(page)).toHaveValue('all')
    await expect(kind(page).locator('option')).toHaveText([
      'Alle',
      'Überschriften',
      'Bilder',
      'Tabellen',
      'Gleichungen',
    ])
    // All: headings, the table, the equation, each with an icon.
    await expect(rows.first()).toBeVisible()
    const total = await rows.count()
    await expect(picker(page).locator('li svg.kind-icon')).toHaveCount(total)

    await kind(page).selectOption('tbl')
    await expect(rows).toHaveText([/Tabelle 1/])
    await kind(page).selectOption('sec')
    await expect(rows).toHaveCount(total - 2) // all but the table and the equation
    for (const text of await rows.allInnerTexts()) expect(text).toContain('Abschnitt')
    await kind(page).selectOption('eq')
    await expect(rows).toHaveText([/Gleichung \(1\)/])
    await kind(page).selectOption('fig')
    await expect(picker(page).getByText('Nichts gefunden')).toBeVisible()

    // The filter works together with the search, and the field keeps the focus for typing.
    await kind(page).selectOption('sec')
    await expect(search(page)).toBeFocused()
    await search(page).fill('stichprobe')
    await expect(rows).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(chips(page)).toHaveText(['Abschnitt 2.1'])
  } finally {
    await app.close()
  }
})

test('the picker is as wide as the citation editor, and its dropdown is fused with the field', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.getByRole('button', { name: 'Querverweis', exact: true }).click()
    const box = (await picker(page).boundingBox())!
    expect(box.width).toBe(600)
    // The dropdown and the field are one control: the same height, no gap between them.
    const select = (await kind(page).boundingBox())!
    const field = (await search(page).boundingBox())!
    expect(select.height).toBeGreaterThanOrEqual(field.height - 1)
    expect(Math.abs(select.y - field.y)).toBeLessThan(2)
    expect(field.x - (select.x + select.width)).toBeLessThan(2)
  } finally {
    await app.close()
  }
})

test('hovering a reference shows the heading it points at, or the caption of a figure or table', async () => {
  const { app, page } = await open()
  try {
    await caretAtEnd(page)
    await page.keyboard.type(' Siehe @sec-stichprobe und @tbl-werte und @fig-fehlt später.')
    const tip = page.locator('.cm-chip-tooltip')
    await expect(chips(page)).toHaveCount(3)
    await chips(page).nth(0).hover()
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('Abschnitt 2.1')
    await expect(tip).toContainText('Stichprobe')
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
    await chips(page).nth(1).hover()
    await expect(tip).toContainText('Tabelle 1')
    await expect(tip).toContainText('Werte')
    await page.mouse.move(0, 0)
    await chips(page).nth(2).hover()
    await expect(tip).toContainText('„fig-fehlt“ gibt es nicht')
  } finally {
    await app.close()
  }
})

test('a chip drawn again while the pointer rests on it still shows its tooltip, and it goes when the pointer leaves', async () => {
  const { app, page } = await open()
  try {
    // A reference to another sheet's heading, saved.
    await caretAtEnd(page)
    await page.keyboard.type(' Siehe @sec-einleitung dort.')
    await expect.poll(() => read(DESIGN)).toContain('Siehe @sec-einleitung dort.')
    const chip = chips(page).filter({ hasText: 'Abschnitt 1' }).last()
    const tip = page.locator('.cm-chip-tooltip')
    // A changed heading: when its autosave (about a second later) brings the project's targets back,
    // the editor draws the chips again, as new elements. Resting on the chip from just before that,
    // the tooltip must still come, for the chip that is there now.
    await page.locator('.cm-content').click({ position: { x: 4, y: 4 } })
    await page.keyboard.press('End')
    const box = (await chip.boundingBox())!
    const before = await chip.elementHandle()
    await page.keyboard.type(' neu')
    const typed = Date.now()
    // The chip is drawn again about 1,020 ms after the last key (measured): the pointer arrives at
    // 850 ms, so the new element appears during the 350 ms rest, where no mouseenter reaches it.
    await quietFor(page, Math.max(0, 850 - (Date.now() - typed)))
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(tip).toContainText('Einleitung')
    expect(await before!.evaluate((el) => el.isConnected)).toBe(false)
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
  } finally {
    await app.close()
  }
})
