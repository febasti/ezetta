import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, launchAt, MOD, TYPST } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const SAMPLE =
  'Die Größe $x^2$ wächst mit der Zeit.\n\n$ E = m c^2 $ <eq-energie>\n\nDanach folgt noch ein Absatz.\n'

// The formulas are drawn by the Typst compiler, so these tests need one installed.
test.skip(!TYPST, 'needs the typst command')

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function openWith(content: string) {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({ [SHEET]: content })
  return open()
}

async function open() {
  return launchAt(sandbox, 'methoden/design.typ', { env: { EZETTA_TYPST: TYPST! } })
}

const widgets = (page: Page) => page.locator('.cm-content .cm-math-widget')
const drawings = (page: Page) => page.locator('.cm-content .cm-math-widget svg')
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Formel bearbeiten' })
const sourceField = (page: Page) => dialog(page).getByLabel('Formel in Typst-Schreibweise')

test('draws formulas with the Typst compiler: inline in the line, a block on its own', async () => {
  const { app, page } = await open()
  try {
    await expect(drawings(page)).toHaveCount(2)
    const text = await page.locator('.cm-content').innerText()
    expect(text).not.toContain('$')
    expect(text).not.toContain('eq-energie')

    const inline = widgets(page).nth(0)
    const block = widgets(page).nth(1)
    await expect(block).toHaveClass(/block/)
    await expect(inline).not.toHaveClass(/block/)
    // The inline formula sits in the line of text: its box is inside the line's box, and the
    // text before it is level with it.
    const line = page.locator('.cm-content .cm-line', { hasText: 'Die Größe' })
    const [lineBox, formulaBox] = await Promise.all([line.boundingBox(), inline.boundingBox()])
    expect(formulaBox!.y).toBeGreaterThanOrEqual(lineBox!.y - 4)
    expect(formulaBox!.y + formulaBox!.height).toBeLessThanOrEqual(lineBox!.y + lineBox!.height + 4)
    // The block is centred in the writing column and taller than the inline formula.
    const blockBox = (await block.locator('svg').boundingBox())!
    const column = (await page.locator('.cm-content').boundingBox())!
    expect(Math.abs(blockBox.x + blockBox.width / 2 - (column.x + column.width / 2))).toBeLessThan(
      40,
    )
    // It follows the text colour, so it works in both themes.
    expect(await block.locator('svg use').first().getAttribute('fill')).toBe('currentColor')
  } finally {
    await app.close()
  }
})

test('inserts an inline formula from the toolbar: a small field, no preview, the text shows the drawing', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Und ')
    await page.locator('.toolbar').getByRole('button', { name: 'Formel', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Formel im Text' }).click()

    await expect(dialog(page)).toBeVisible()
    await expect(sourceField(page)).toBeFocused()
    await expect(sourceField(page)).toHaveValue('x')
    // The formula in the text is the preview: there is none in the popover, and no remove button.
    await expect(dialog(page).locator('svg')).toHaveCount(0)
    await expect(dialog(page).getByRole('button')).toHaveCount(0)
    await expect(drawings(page)).toHaveCount(3)

    // The starter is selected: typing replaces it. Spaces typed at the end stay in the field.
    await page.keyboard.type('a^2 + ')
    await expect(sourceField(page)).toHaveValue('a^2 + ')
    await page.keyboard.type('b^2')
    await expect(sourceField(page)).toHaveValue('a^2 + b^2')
    await expect.poll(read).toContain('Und $a^2 + b^2$')

    // The drawing in the text follows what is typed.
    const formula = widgets(page).last()
    const before = await formula.innerHTML()
    await page.keyboard.type(' + c^2')
    await expect.poll(() => formula.innerHTML()).not.toBe(before)
    await expect(drawings(page)).toHaveCount(3)

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(page.locator('.cm-content')).toContainText('Und')
  } finally {
    await app.close()
  }
})

test('a formula that does not compile keeps its last drawing and says why', async () => {
  const { app, page } = await open()
  try {
    await widgets(page).nth(0).locator('svg').click()
    await expect(dialog(page)).toBeVisible()
    await sourceField(page).fill('foo(x)')
    await expect(widgets(page).nth(0)).toHaveClass(/invalid/)
    await expect(widgets(page).nth(0)).toHaveAttribute('title', /unknown variable/)
    await expect(widgets(page).nth(0).locator('svg')).toHaveCount(1) // the last good drawing
    await expect.poll(read).toContain('$foo(x)$')

    await sourceField(page).fill('y^2')
    await expect(widgets(page).nth(0)).not.toHaveClass(/invalid/)
  } finally {
    await app.close()
  }
})

test('a formula stays what it was made as: no switch between inline and block', async () => {
  const { app, page } = await open()
  try {
    await widgets(page).nth(0).locator('svg').click()
    await expect(dialog(page).getByRole('button')).toHaveCount(0)
    // Whatever is typed, spaces at the edges included, an inline formula stays inline.
    await sourceField(page).fill(' a + b ')
    await expect.poll(read).toContain('Die Größe $a + b$ wächst')
    await page.keyboard.press('Escape')

    const block = widgets(page).nth(1)
    await block.locator('svg').click()
    await expect(block.getByRole('button')).toHaveCount(0)
    await block.getByLabel('Formel in Typst-Schreibweise').fill('y = 2')
    await expect.poll(read).toContain('$ y = 2 $ <eq-energie>')
  } finally {
    await app.close()
  }
})

test('a block formula opens its field inside the drawing, which follows the typing', async () => {
  const { app, page } = await open()
  try {
    const block = widgets(page).nth(1)
    const field = block.getByLabel('Formel in Typst-Schreibweise')
    await expect(block.locator('.cm-math-edit')).toHaveCount(0)
    await block.locator('svg').click()
    // The field is in the widget, under the drawing: no popover.
    await expect(dialog(page)).toHaveCount(0)
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('E = m c^2')
    const drawing = (await block.locator('.cm-math-drawing').boundingBox())!
    const edit = (await block.locator('.cm-math-edit').boundingBox())!
    expect(edit.y).toBeGreaterThanOrEqual(drawing.y + drawing.height - 1)

    const before = await block.locator('.cm-math-drawing').innerHTML()
    await field.fill('E = m c^3')
    await expect.poll(read).toContain('$ E = m c^3 $ <eq-energie>')
    await expect.poll(() => block.locator('.cm-math-drawing').innerHTML()).not.toBe(before)
    await expect(field).toBeFocused()

    // Escape closes the field and gives the text its focus back.
    await page.keyboard.press('Escape')
    await expect(block.locator('.cm-math-edit')).toHaveCount(0)
    await expect(drawings(page)).toHaveCount(2)

    // A click elsewhere closes it too, and a second block formula can be opened after.
    await block.locator('svg').click()
    await expect(field).toBeVisible()
    await page.locator('.cm-content').getByText('Danach folgt').click()
    await expect(block.locator('.cm-math-edit')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('emptying a block formula does not turn it into an inline one', async () => {
  const { app, page } = await open()
  try {
    const block = widgets(page).nth(1)
    const field = block.getByLabel('Formel in Typst-Schreibweise')
    await block.locator('svg').click()
    await field.fill('')
    // The last source stays in the sheet (an empty block would read as inline), and the field stays open.
    await expect(field).toBeVisible()
    expect(await read()).toContain('$ E = m c^2 $ <eq-energie>')
    await field.fill('F = m a')
    await expect.poll(read).toContain('$ F = m a $ <eq-energie>')
    await expect(widgets(page).nth(1)).toHaveClass(/block/)
  } finally {
    await app.close()
  }
})

test('a block formula that shares its line with text is edited in the popover', async () => {
  const { app, page } = await openWith('Vorher $ y = 2 x $ nachher.\n')
  try {
    await widgets(page).nth(0).locator('svg').click()
    await expect(dialog(page)).toBeVisible()
    await expect(sourceField(page)).toHaveValue('y = 2 x')
  } finally {
    await app.close()
  }
})

test('a formula is removed like any widget, with no button for it', async () => {
  const { app, page } = await open()
  try {
    await widgets(page).nth(1).locator('svg').click()
    await expect(
      widgets(page)
        .nth(1)
        .getByRole('button', { name: /entfernen/ }),
    ).toHaveCount(0)
    await page.keyboard.press('Escape')
    // From the empty line below it, Backspace chooses the block formula, a second press removes it.
    await page.locator('.cm-content').getByText('Danach folgt').click()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Backspace')
    await expect(widgets(page).nth(1)).toHaveClass(/selected/)
    await page.keyboard.press('Backspace')
    await expect.poll(read).not.toContain('eq-energie')
    await expect(drawings(page)).toHaveCount(1)
    await page.keyboard.press(`${MOD}+z`)
    await expect(drawings(page)).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('a new block formula gets its id when it is placed: random, with nothing of the formula in it', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.locator('.toolbar').getByRole('button', { name: 'Formel', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Abgesetzte Formel' }).click()
    await expect(drawings(page)).toHaveCount(3)
    await expect.poll(read).toMatch(/\$ x \$ <eq-[a-z0-9]{6}>/)
    // The sheet's other formula keeps the label it had.
    const labels = (await read()).match(/<eq-[a-z0-9-]+>/g)!
    expect(labels).toHaveLength(2)
    expect(labels).toContain('<eq-energie>')
  } finally {
    await app.close()
  }
})

test('an inline formula gets no id: it is not numbered, so nothing can refer to it', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Und ')
    await page.locator('.toolbar').getByRole('button', { name: 'Formel', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Formel im Text' }).click()
    await expect(drawings(page)).toHaveCount(3)
    await expect.poll(read).toContain('Und $x$')
    expect(await read()).not.toMatch(/<eq-[a-z0-9]{6}>/)
  } finally {
    await app.close()
  }
})

test('a formula is atomic: Backspace selects it, a second press removes it whole', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('wächst mit der Zeit').click()
    await page.keyboard.press('Home')
    for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight') // after "Die Größe "
    await page.keyboard.press('ArrowRight') // over the formula
    await expect(content).not.toContainText('$x^2$') // never revealed by touch
    await page.keyboard.press('Backspace')
    await expect(widgets(page).nth(0)).toHaveClass(/selected/)
    expect(await read()).toContain('$x^2$')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('Die Größe  wächst')
    expect(await read()).not.toMatch(/\$x|x\^2\$/)
  } finally {
    await app.close()
  }
})

test('the continuous view draws the formulas too', async () => {
  const { app, page } = await launch(sandbox, { env: { EZETTA_TYPST: TYPST! } })
  try {
    await page.locator('[role=treeitem][data-path="methoden"]').click()
    await expect(drawings(page)).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('Quelltext shows the source of formulas instead of drawings', async () => {
  const { app, page } = await open()
  try {
    await expect(drawings(page)).toHaveCount(2)
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await expect(page.locator('.cm-content')).toContainText('$ E = m c^2 $ <eq-energie>')
    await expect(drawings(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a formula that does not compile says what is wrong and where, and the message goes with the fix', async () => {
  const { app, page } = await open()
  try {
    // A block formula: its field is in the widget.
    await page.locator('.cm-math-widget.block .cm-math-drawing').click()
    const field = page.locator('.cm-math-source-field')
    const problem = page.locator('.cm-math-problem')
    await field.fill('x + frac(1')
    await expect(problem.getByText('Klammer nicht geschlossen')).toBeVisible()
    await expect(
      problem.getByText('Zu „(“ fehlt das Gegenstück „)“', { exact: false }),
    ).toBeVisible()
    // The place: the opening bracket is marked in a copy of the line.
    await expect(problem.locator('.cm-math-excerpt mark')).toHaveText('(')
    await expect(problem).toContainText('Zeile 1, Zeichen 9')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    // Writing it right takes the message away.
    await field.fill('x + frac(1, 2)')
    await expect(problem).toBeHidden()
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    // A LaTeX command is explained.
    await field.fill('2 \\alpha')
    await expect(problem.getByText('Unbekannter Befehl')).toBeVisible()
    await expect(problem).toContainText('alpha statt \\alpha')
    // Something missing after an operator marks the end of the line.
    await field.fill('x^')
    await expect(problem.getByText('Hier fehlt etwas')).toBeVisible()
    await expect(problem.locator('.cm-math-excerpt mark.cm-math-excerpt-end')).toHaveCount(1)
    await page.keyboard.press('Escape')
    // A formula in the text has the same in its popover.
    await page.locator('.cm-math-widget:not(.block)').first().click()
    const inline = page.locator('.cm-math-editor .cm-math-source-field')
    await inline.fill('foo(x)')
    await expect(page.locator('.cm-math-editor .cm-math-problem')).toContainText(
      'Unbekannter Name „foo“',
    )
  } finally {
    await app.close()
  }
})
