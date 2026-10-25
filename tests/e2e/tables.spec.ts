import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { createSandbox, launch, launchAt, MOD, openSheet } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const TABLE = `#figure(
  table(
    columns: 3,
    align: (left, right, right),
    table.header[Gruppe][n][Anteil],
    [A], [12], [40 %],
    [B], [18], [60 %],
  ),
  caption: [Stichprobe nach Gruppe],
) <tbl-stichprobe>`
const SAMPLE = `Vor der Tabelle.\n\n${TABLE}\n\nNach der Tabelle.\n`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function open(content?: string) {
  if (content !== undefined) {
    await rm(sandbox.base, { recursive: true, force: true })
    sandbox = await createSandbox({ [SHEET]: content })
  }
  return launchAt(sandbox, 'methoden/design.typ')
}

const block = (page: Page) => page.locator('.cm-content .cm-table-block')
/** The cell of the row and column, counted from 0, header row included. */
const cell = (page: Page, row: number, column: number): Locator =>
  block(page).locator(`[data-row="${row}"][data-column="${column}"]`)
const field = (page: Page, row: number, column: number): Locator =>
  cell(page, row, column).locator('textarea')
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Tabelle bearbeiten' })

test('draws the table with its number and caption, and the source stays out of sight', async () => {
  const { app, page } = await open()
  try {
    await expect(block(page)).toHaveCount(1)
    await expect(block(page).locator('th')).toHaveText(['Gruppe', 'n', 'Anteil'])
    await expect(block(page).locator('tbody td')).toHaveText(['A', '12', '40 %', 'B', '18', '60 %'])
    await expect(block(page).locator('.cm-table-number')).toHaveText('Tabelle 1:')
    await expect(block(page).locator('.cm-table-caption-input')).toHaveValue(
      'Stichprobe nach Gruppe',
    )
    const text = await page.locator('.cm-content').innerText()
    expect(text).not.toContain('#figure')
    expect(text).not.toContain('table.header')
    // Alignment of the columns.
    await expect(cell(page, 1, 1)).toHaveClass(/align-right/)
    await expect(cell(page, 1, 0)).toHaveClass(/align-left/)
  } finally {
    await app.close()
  }
})

test('a cell is edited in place: only its text changes in the sheet, and the focus stays while typing', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 1, 1).click()
    await expect(field(page, 1, 1)).toBeFocused()
    await expect(field(page, 1, 1)).toHaveValue('12')
    await page.keyboard.press(`${MOD}+a`)
    // One key after the other: each one goes into the sheet, the table is redrawn under the
    // field, and the field must keep the focus and the caret.
    await page.keyboard.type('1957', { delay: 40 })
    await expect(field(page, 1, 1)).toBeFocused()
    await expect(field(page, 1, 1)).toHaveValue('1957')
    await expect.poll(read).toBe(SAMPLE.replace('[12]', '[1957]'))
    // Typing in the middle keeps the caret where it is.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('_', { delay: 40 })
    await expect(field(page, 1, 1)).toHaveValue('19_57')
    await expect.poll(read).toContain('[19_57]')
    await page.keyboard.type('x', { delay: 40 })
    await expect(field(page, 1, 1)).toHaveValue('19_x57')
  } finally {
    await app.close()
  }
})

test('the keyboard moves between cells: Tab, Shift+Tab, Enter, and the arrow keys at the edges', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 0, 0).click()
    await page.keyboard.press('Tab')
    await expect(field(page, 0, 1)).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab') // end of the row: the first cell of the next row
    await expect(field(page, 1, 0)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(field(page, 0, 2)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(field(page, 1, 2)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(field(page, 0, 2)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    // A cell entered with the keyboard has its text selected. The first arrow key ends the
    // selection, and at the start of the text the next one moves to the cell before.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(field(page, 1, 1)).toBeFocused()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowLeft')
    await expect(field(page, 1, 0)).toBeFocused()
    // Tab out of the last cell leaves the table, with the caret behind it.
    await cell(page, 2, 2).click()
    await page.keyboard.press('Tab')
    await expect(block(page).locator('textarea:visible')).toHaveCount(0)
    await page.keyboard.type('Neu')
    // The caret is on the line below the table.
    await expect.poll(read).toContain(') <tbl-stichprobe>\nNeu\n')
  } finally {
    await app.close()
  }
})

test('undo goes through the sheet: it takes typing back, and the field shows the result', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 1, 0).click()
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.type('Neu', { delay: 40 })
    await expect.poll(read).toContain('[Neu]')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toBe(SAMPLE)
    await expect(field(page, 1, 0)).toHaveValue('A')
    await page.keyboard.press(`${MOD}+Shift+z`)
    await expect.poll(read).toContain('[Neu]')
    await expect(field(page, 1, 0)).toHaveValue('Neu')
  } finally {
    await app.close()
  }
})

test('brackets that do not match are not written, and the cell says so', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 1, 0).click()
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.type('a [ b')
    await expect(field(page, 1, 0)).toHaveAttribute('aria-invalid', 'true')
    expect(await read()).toBe(SAMPLE)
    await page.keyboard.type(']')
    await expect(field(page, 1, 0)).not.toHaveAttribute('aria-invalid', 'true')
    await expect.poll(read).toContain('[a [ b]]')
  } finally {
    await app.close()
  }
})

test('the toolbar is centered above the table, which is centered in the text', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 1, 1).click()
    await expect(toolbar(page)).toBeVisible()
    const middle = async (box: () => Promise<{ x: number; width: number } | null>) => {
      const b = (await box())!
      return b.x + b.width / 2
    }
    const text = () => page.locator('.cm-content').boundingBox()
    const bar = () => toolbar(page).boundingBox()
    const table = () => block(page).locator('table').first().boundingBox()
    await expect
      .poll(async () => Math.abs((await middle(bar)) - (await middle(text))))
      .toBeLessThan(2)
    expect(Math.abs((await middle(table)) - (await middle(text)))).toBeLessThan(2)
    // It stays above the table.
    expect((await bar())!.y + (await bar())!.height).toBeLessThanOrEqual((await table())!.y)
  } finally {
    await app.close()
  }
})

test('the toolbar changes the structure while a cell is being edited, and the editing goes on', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 1, 1).click()
    await expect(toolbar(page)).toBeVisible()
    await toolbar(page).getByRole('button', { name: 'Zeile unterhalb' }).click()
    await expect(block(page).locator('tbody tr')).toHaveCount(3)
    await expect(field(page, 2, 1)).toBeFocused() // the new row
    await page.keyboard.type('neu')
    await expect.poll(read).toContain('[], [neu], [],')

    await toolbar(page).getByRole('button', { name: 'Spalte rechts' }).click()
    await expect(block(page).locator('th')).toHaveCount(4)
    await expect.poll(read).toContain('columns: 4,')
    await expect.poll(read).toContain('align: (left, right, auto, right)')

    // The alignments are radio buttons: the column's own is checked (the new column has none yet),
    // a click chooses one, and a click on the chosen one changes nothing.
    const radio = (name: string) => toolbar(page).getByRole('radio', { name })
    await expect(toolbar(page).getByRole('radiogroup', { name: 'Ausrichtung' })).toBeVisible()
    await expect(radio('Rechtsbündig')).toHaveAttribute('aria-checked', 'false')
    await expect(radio('Zentriert')).toHaveAttribute('aria-checked', 'false')
    await radio('Zentriert').click()
    await expect.poll(read).toContain('align: (left, right, center, right)')
    await expect(radio('Zentriert')).toHaveAttribute('aria-checked', 'true')
    await expect(radio('Rechtsbündig')).toHaveAttribute('aria-checked', 'false')
    await radio('Zentriert').click()
    await expect(radio('Zentriert')).toHaveAttribute('aria-checked', 'true')
    expect(await read()).toContain('align: (left, right, center, right)')

    // What deletes something is red.
    const red = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim(),
    )
    for (const name of ['Zeile löschen', 'Spalte löschen', 'Tabelle entfernen'])
      await expect(toolbar(page).getByRole('button', { name })).toHaveClass(/danger/)
    const color = await toolbar(page)
      .getByRole('button', { name: 'Spalte löschen' })
      .evaluate((b) => getComputedStyle(b).color)
    const probe = await page.evaluate((c) => {
      const e = document.createElement('i')
      e.style.color = c
      document.body.append(e)
      const v = getComputedStyle(e).color
      e.remove()
      return v
    }, red)
    expect(color).toBe(probe)
    await toolbar(page).getByRole('button', { name: 'Spalte löschen' }).click()
    await expect(block(page).locator('th')).toHaveCount(3)

    await toolbar(page).getByRole('button', { name: 'Kopfzeile' }).click()
    await expect.poll(read).not.toContain('table.header')
    await expect(block(page).locator('th')).toHaveCount(0)
    await toolbar(page).getByRole('button', { name: 'Zeile löschen' }).click()

    // Everything is one step back for undo.
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toContain('[], [neu], [],')
  } finally {
    await app.close()
  }
})

test('a table is created from a size, and its first cell is ready to type in', async () => {
  const { app, page } = await open('Ein Absatz.\n')
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.locator('.toolbar').getByRole('button', { name: 'Tabelle', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Tabellengröße' })
    await expect(picker).toBeVisible()
    await picker.getByRole('gridcell', { name: '3 Zeilen × 2 Spalten' }).click()

    await expect(block(page)).toHaveCount(1)
    await expect(block(page).locator('th')).toHaveCount(2)
    await expect(block(page).locator('tbody tr')).toHaveCount(2)
    await expect(field(page, 0, 0)).toBeFocused()
    await page.keyboard.type('Name')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Wert')
    await page.keyboard.press('Tab')
    await page.keyboard.type('x')
    await expect.poll(read).toContain('table.header[Name][Wert],')
    await expect.poll(read).toContain('[x], [],')
    await expect(block(page).locator('.cm-table-number')).toHaveText('Tabelle 1:')
    // The label is the table's id, made when it was placed: random, not a word of any caption.
    await expect.poll(read).toMatch(/\) <tbl-[a-z0-9]{6}>\s*$/)
  } finally {
    await app.close()
  }
})

test('Enter in the last row adds a row, so a table can be typed in without the mouse', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 2, 0).click()
    await page.keyboard.press('Enter')
    await expect(block(page).locator('tbody tr')).toHaveCount(3)
    await expect(field(page, 3, 0)).toBeFocused()
    await page.keyboard.type('C')
    await page.keyboard.press('Tab')
    await page.keyboard.type('7')
    await expect.poll(read).toContain('[C], [7], [],')
  } finally {
    await app.close()
  }
})

test('cells pasted from a spreadsheet fill the table, which grows to hold them', async () => {
  const { app, page } = await open()
  try {
    await cell(page, 2, 1).click()
    await page.evaluate(() => {
      const target = document.activeElement as HTMLTextAreaElement
      const data = new DataTransfer()
      data.setData('text/plain', '1\t2\t3\n4\t5\t6\n')
      target.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      )
    })
    await expect(block(page).locator('tbody tr')).toHaveCount(3)
    await expect(block(page).locator('th')).toHaveCount(4)
    await expect.poll(read).toContain('[B], [1], [2], [3],')
    await expect.poll(read).toContain('[], [4], [5], [6],')
    await expect(field(page, 2, 1)).toBeFocused()
  } finally {
    await app.close()
  }
})

test('the caption is edited under the table, and an empty one is taken out', async () => {
  const { app, page } = await open()
  try {
    const caption = block(page).locator('.cm-table-caption-input')
    await caption.click()
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.type('Neue Beschriftung', { delay: 20 })
    await expect.poll(read).toContain('caption: [Neue Beschriftung],')
    await caption.fill('')
    await expect.poll(read).not.toContain('caption')
    await expect(block(page).locator('.cm-table-number')).toHaveText('Tabelle 1:')
    await caption.fill('Wieder da')
    await expect.poll(read).toContain('caption: [Wieder da],')
  } finally {
    await app.close()
  }
})

test('a table is atomic: Backspace from the line below selects it, a second press removes it whole', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').getByText('Nach der Tabelle.').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowUp') // the empty line below the table
    await page.keyboard.press('Backspace')
    await expect(block(page)).toHaveClass(/selected/)
    expect(await read()).toContain('tbl-stichprobe')
    await page.keyboard.press('Backspace')
    await expect.poll(read).not.toContain('table')
    expect(await read()).toContain('Nach der Tabelle.')
  } finally {
    await app.close()
  }
})

test('markup and citations in a cell are drawn, and a table the grid cannot hold stays source', async () => {
  const { app, page } = await open(
    '#table(columns: 2, [_kursiv_ und *fett*], [Siehe @smith2020], [$x^2$], [b])\n\n#table(columns: 2, [a], table.cell(colspan: 2)[breit])\n',
  )
  try {
    await expect(block(page)).toHaveCount(1)
    await expect(cell(page, 0, 0).locator('em')).toHaveText('kursiv')
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('fett')
    await expect(cell(page, 0, 1).locator('.cm-cite')).toHaveText('smith2020')
    await expect(cell(page, 1, 0)).toHaveText('$x^2$') // shown as written
    // A bare table has no number and no caption.
    await expect(block(page).locator('.cm-table-number')).toHaveCount(0)
    // The second table has a merged cell: it stays as source.
    await expect(page.locator('.cm-content')).toContainText('table.cell(colspan: 2)')
  } finally {
    await app.close()
  }
})

test('a bare table gets its id when a caption makes it a numbered table', async () => {
  const { app, page } = await open('#table(columns: 2, [a], [b])\n')
  try {
    await expect(block(page).locator('.cm-table-number')).toHaveCount(0)
    expect(await read()).not.toContain('<tbl-')
    await cell(page, 0, 0).click()
    await toolbar(page).getByRole('button', { name: 'Beschriftung hinzufügen' }).click()
    await expect(block(page).locator('.cm-table-number')).toHaveText('Tabelle 1:')
    await expect.poll(read).toMatch(/\) <tbl-[a-z0-9]{6}>\s*$/)
    // The id is not shown in the text, and it is not written again by later changes.
    const id = /<(tbl-[a-z0-9]{6})>/.exec(await read())![1]!
    await page.keyboard.type('x')
    await expect.poll(async () => (await read()).split(`<${id}>`).length).toBe(2)
  } finally {
    await app.close()
  }
})

test('tables are numbered across the sheets, in the continuous view too', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    'content/einleitung/einleitung.typ': `${TABLE.replace('tbl-stichprobe', 'tbl-eins')}\n`,
    [SHEET]: `${TABLE}\n`,
  })
  const { app, page } = await launch(sandbox)
  try {
    await openSheet(page, 'methoden/design.typ')
    await expect(block(page).locator('.cm-table-number')).toHaveText('Tabelle 2:')
    // The continuous view shows them read-only, and a click opens the sheet.
    await page.locator('[role=treeitem][data-path=""]').first().click()
    await expect(block(page).locator('.cm-table-number')).toHaveText(['Tabelle 1:', 'Tabelle 2:'])
    await expect(block(page).first().locator('textarea')).toHaveCount(0)
    await block(page).nth(1).locator('td').first().click()
    await expect(page.locator('.cm-content .cm-table-block textarea:visible')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
