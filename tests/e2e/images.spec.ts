import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, makePng, launchAt, MOD } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const FIGURE = (name: string, caption: string, label: string) =>
  `#figure(\n  image("assets/${name}", width: 50%),\n  caption: [${caption}],\n) <${label}>\n`
const SAMPLE = `Vor dem Bild.\n\n${FIGURE('a.png', 'Die Stichprobe', 'fig-a')}\nZwischen den Bildern.\n\n${FIGURE('gone.png', 'Fehlt', 'fig-gone')}`

let sandbox: Sandbox
test.beforeEach(async () => {
  // The sheet before "design" in project order has a figure, so the first one here is number 2.
  sandbox = await createSandbox({
    [SHEET]: SAMPLE,
    'content/einleitung/einleitung.typ': `= Einleitung\n\n${FIGURE('a.png', 'Erstes', 'fig-first')}`,
  })
  await mkdir(join(sandbox.projectDir, 'assets'), { recursive: true })
  await writeFile(join(sandbox.projectDir, 'assets/a.png'), makePng())
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = (path = SHEET) => readFile(join(sandbox.projectDir, path), 'utf8')

async function open(env?: Record<string, string>) {
  return launchAt(sandbox, 'methoden/design.typ', { env })
}

const figures = (page: Page) => page.locator('.cm-content figure.cm-figure')
const caption = (page: Page, n: number) => figures(page).nth(n).locator('.cm-figure-caption-input')
/** The tools over a picture show while it is chosen: a click on the picture chooses it. */
const tools = async (page: Page, n: number) => {
  await figures(page).nth(n).locator('img').click()
  const bar = figures(page).nth(n).getByRole('toolbar', { name: 'Bildwerkzeuge' })
  await expect(bar).toBeVisible()
  return bar
}

test('shows figures as pictures with a running number and an editable caption, and an empty frame for a missing file', async () => {
  const { app, page } = await open()
  try {
    await expect(figures(page)).toHaveCount(2)
    const first = figures(page).nth(0)
    await expect(first.locator('.cm-figure-number')).toHaveText('Abbildung 2:')
    await expect(caption(page, 0)).toHaveValue('Die Stichprobe')
    // The picture itself decodes (a real PNG), at half the width of the text.
    await expect
      .poll(() => first.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(120)
    const text = await page.locator('.cm-content').innerText()
    expect(text).not.toContain('#figure(')
    // A file that is not there is an empty frame, with the way to choose another one.
    await expect(figures(page).nth(1).locator('.cm-figure-empty')).toBeVisible()
    await expect(figures(page).nth(1).locator('.cm-figure-choose')).toHaveText('Bild ersetzen')
    await expect(figures(page).nth(1).locator('.cm-figure-number')).toHaveText('Abbildung 3:')
  } finally {
    await app.close()
  }
})

test('inserting a figure places an empty frame with its own id, and the caption is typed right away', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.locator('.toolbar').getByRole('button', { name: 'Bild', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Bild mit Beschriftung' }).click()

    // No dialog: an empty frame with a button, and the caret in its caption.
    await expect(figures(page)).toHaveCount(3)
    const empty = figures(page).nth(2)
    await expect(empty.locator('.cm-figure-empty')).toContainText('Noch kein Bild')
    await expect(empty.getByRole('button', { name: 'Bild auswählen …' })).toBeVisible()
    await expect(caption(page, 2)).toBeFocused()
    await page.keyboard.type('Kommt noch')
    await expect.poll(read).toContain('caption: [Kommt noch]')

    // The source is a plain Typst figure with a frame, and an id that has nothing to do with a file.
    const source = await read()
    expect(source).toMatch(
      /#figure\(\n\s{2}rect\(width: 100%, height: 6cm\),\n\s{2}caption: \[Kommt noch\],\n\) <fig-[a-z0-9]{6}>/,
    )
    // Nothing was copied into the project.
    expect(await readdir(join(sandbox.projectDir, 'assets'))).toEqual(['a.png'])
  } finally {
    await app.close()
  }
})

test('choosing an image fills the frame and keeps the id and the caption', async () => {
  const source = join(sandbox.base, 'Mein Foto.png')
  await writeFile(source, makePng(40, 40, [200, 80, 80]))
  const { app, page } = await open({ EZETTA_TEST_IMAGE: source })
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.locator('.toolbar').getByRole('button', { name: 'Bild', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Bild mit Beschriftung' }).click()
    await expect(figures(page)).toHaveCount(3)
    await page.keyboard.type('Später')
    const id = /<(fig-[a-z0-9]{6})>/.exec(await read())![1]!

    await figures(page).nth(2).getByRole('button', { name: 'Bild auswählen …' }).click()
    await expect(figures(page).nth(2).locator('img')).toBeVisible()
    await expect.poll(read).toContain('image("assets/Mein-Foto.png", width: 75%)')
    const after = await read()
    expect(after).toContain('caption: [Später]')
    expect(after).toContain(`<${id}>`)
    expect(after).not.toContain('rect(')
    expect(await readdir(join(sandbox.projectDir, 'assets'))).toContain('Mein-Foto.png')
    // The original is left where it was.
    expect(await readFile(source)).toEqual(makePng(40, 40, [200, 80, 80]))
    await expect(caption(page, 2)).toHaveValue('Später')
  } finally {
    await app.close()
  }
})

test('the tools over a picture show only while it is chosen, and set its width and replace it', async () => {
  const other = join(sandbox.base, 'Neu.png')
  await writeFile(other, makePng(60, 30, [20, 120, 60]))
  const { app, page } = await open({ EZETTA_TEST_IMAGE: other })
  try {
    // Not on hover: the tools wait for the picture to be chosen.
    const hidden = figures(page).nth(0).getByRole('toolbar', { name: 'Bildwerkzeuge' })
    await figures(page).nth(0).locator('img').hover()
    await expect(hidden).toBeHidden()

    // The width is a radio group: the current one is checked, and a click chooses another.
    const bar = await tools(page, 0)
    const before = await bar.elementHandle()
    await expect(bar.getByRole('radio', { name: 'Breite 50%' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await bar.getByRole('radio', { name: 'Breite 75%' }).click()
    await expect.poll(read).toContain('image("assets/a.png", width: 75%)')
    // The picture changes where it is: the tools are the same element, and still shown.
    expect(await before!.evaluate((node) => node.isConnected)).toBe(true)
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('radio', { name: 'Breite 75%' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // Replacing changes the file and nothing else: the id, the caption, and the width stay.
    await bar.getByRole('button', { name: 'Bild ersetzen' }).click()
    await expect.poll(read).toContain('image("assets/Neu.png", width: 75%)')
    const replaced = await read()
    expect(replaced).toContain('caption: [Die Stichprobe]')
    expect(replaced).toContain('<fig-a>')
    expect(replaced).not.toContain('assets/a.png')
    await expect
      .poll(() =>
        figures(page)
          .nth(0)
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(60)

    // There is no delete button: Backspace removes the chosen figure, and undo brings it back.
    await expect(bar.getByRole('button', { name: /entfernen/ })).toHaveCount(0)
    await figures(page).nth(0).locator('img').click()
    await page.keyboard.press('Backspace')
    await expect(figures(page)).toHaveCount(1)
    await expect.poll(read).not.toContain('Neu.png')
    expect(await readdir(join(sandbox.projectDir, 'assets'))).toContain('a.png')
    await page.keyboard.press(`${MOD}+z`)
    await expect(figures(page)).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('the mark of a chosen figure follows the picture, not the width of the text', async () => {
  const { app, page } = await open()
  try {
    const figure = figures(page).nth(0)
    await figure.locator('img').click()
    await expect(figure).toHaveClass(/selected/)
    const holder = (await figure.locator('.cm-figure-holder').boundingBox())!
    const image = (await figure.locator('img').boundingBox())!
    const text = (await page.locator('.cm-content').boundingBox())!
    // The box the mark is drawn around is the picture's own, and the picture is half the text.
    expect(Math.abs(holder.width - image.width)).toBeLessThan(2)
    expect(Math.abs(holder.height - image.height)).toBeLessThan(2)
    expect(image.width).toBeLessThan(text.width * 0.6)
    // A narrower width narrows the mark with it.
    await (await tools(page, 0)).getByRole('radio', { name: 'Breite 25%' }).click()
    await expect
      .poll(async () => (await figure.locator('.cm-figure-holder').boundingBox())!.width)
      .toBeLessThan(image.width * 0.7)
    const narrow = (await figure.locator('.cm-figure-holder').boundingBox())!
    const narrowImage = (await figure.locator('img').boundingBox())!
    expect(Math.abs(narrow.width - narrowImage.width)).toBeLessThan(2)
  } finally {
    await app.close()
  }
})

test('a reference to a figure survives replacing its image, because it points at the id', async () => {
  const other = join(sandbox.base, 'Neu.png')
  await writeFile(other, makePng(60, 30, [20, 120, 60]))
  await rm(sandbox.base + '/x', { force: true })
  await writeFile(
    join(sandbox.projectDir, SHEET),
    `Siehe @fig-a.\n\n${FIGURE('a.png', 'Die Stichprobe', 'fig-a')}`,
  )
  const { app, page } = await open({ EZETTA_TEST_IMAGE: other })
  try {
    const chip = page.locator('.cm-content .cm-xref')
    await expect(chip).toHaveText('Abbildung 2')
    await (await tools(page, 0)).getByRole('button', { name: 'Bild ersetzen' }).click()
    await expect.poll(read).toContain('assets/Neu.png')
    await expect(chip).toHaveText('Abbildung 2')
    await expect(chip).not.toHaveClass(/missing/)
  } finally {
    await app.close()
  }
})

test('the caption is typed in place without losing the focus, and unbalanced brackets are refused', async () => {
  const { app, page } = await open()
  try {
    const field = caption(page, 0)
    await field.click()
    await field.fill('Neue Beschriftung')
    await expect.poll(read).toContain('caption: [Neue Beschriftung]')
    // Typing on: the field kept the focus through every change of the sheet.
    await page.keyboard.type(' mit mehr')
    await expect(field).toBeFocused()
    await expect.poll(read).toContain('caption: [Neue Beschriftung mit mehr]')

    // Brackets that do not match would swallow the text after the figure: they are not written.
    await field.fill('Offen [ nie')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(await read()).toContain('caption: [Neue Beschriftung mit mehr]')

    // Undo is the sheet's own, and Enter leaves the field with the caret behind the figure.
    await field.fill('Fertig')
    await page.keyboard.press('Enter')
    await expect(field).not.toBeFocused()
    await expect.poll(read).toContain('caption: [Fertig]')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).not.toContain('caption: [Fertig]')
  } finally {
    await app.close()
  }
})

test('a figure is atomic: Backspace from the line below selects it, a second press removes it whole', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('Zwischen den Bildern.').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowUp') // the empty line between the figure and the text
    await page.keyboard.press('Backspace')
    await expect(figures(page).nth(0)).toHaveClass(/selected/)
    await expect(figures(page)).toHaveCount(2)
    expect(await read()).toContain('image("assets/a.png", width: 50%)') // nothing deleted yet
    await page.keyboard.press('Backspace')
    await expect(figures(page)).toHaveCount(1)
    await expect.poll(read).not.toContain('assets/a.png')
    const text = await read()
    expect(text).not.toMatch(/#figure\(\s*\n\s*caption|Stichprobe|fig-a/)
    expect(text).toContain('Zwischen den Bildern.')
    expect(text).toContain('image("assets/gone.png", width: 50%)') // the other figure is whole
    await page.keyboard.press(`${MOD}+z`)
    await expect(figures(page)).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('the caret cannot enter a figure, and Delete in front of it selects it', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('Vor dem Bild.').click()
    await page.keyboard.press('End')
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight')
    // Wherever the caret is now, the source of the figures is not on screen.
    await expect(content).not.toContainText('#figure(')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Delete')
    await expect(content).not.toContainText('#figure(')
    await expect(figures(page)).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('a dropped image file becomes a figure at the drop position', async () => {
  const { app, page } = await open()
  try {
    const bytes = [...makePng(30, 30)]
    await page.locator('.cm-content').evaluate((content, data) => {
      const file = new File([new Uint8Array(data)], 'Gedropt.png', { type: 'image/png' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      const box = content.getBoundingClientRect()
      content.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
          clientX: box.left + 20,
          clientY: box.top + 10,
        }),
      )
    }, bytes)
    await expect(figures(page)).toHaveCount(3)
    await expect
      .poll(async () => readdir(join(sandbox.projectDir, 'assets')))
      .toContain('Gedropt.png')
    await expect.poll(read).toContain('image("assets/Gedropt.png"')
  } finally {
    await app.close()
  }
})

test('the continuous view shows the figures of every sheet with continuing numbers', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await page.locator('[role=treeitem][data-path="methoden"]').click()
    await expect(page.locator('.cm-content figure.cm-figure')).toHaveCount(2)
    await expect(page.locator('.cm-content .cm-figure-number').first()).toHaveText('Abbildung 2:')
  } finally {
    await app.close()
  }
})

test('an image in the text opens no menu: a click only chooses it, and Backspace removes it', async () => {
  const source = join(sandbox.base, 'klein.png')
  await writeFile(source, makePng(20, 20))
  const { app, page } = await open({ EZETTA_TEST_IMAGE: source })
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type('Ein Bild: ')
    await page.locator('.toolbar').getByRole('button', { name: 'Bild', exact: true }).click()
    await page.getByRole('menuitem', { name: /Bild im Text/ }).click()
    await expect(page.locator('.cm-content img.cm-inline-image')).toHaveCount(1)
    await expect.poll(read).toContain('image("assets/klein.png"')
    // The caret is still in the text, so typing goes on after the image.
    await page.keyboard.type('weiter')
    await expect.poll(read).toContain('weiter')

    // A click on the image opens nothing (no popover, no dialog); it is chosen, like any widget.
    await page.locator('.cm-content img.cm-inline-image').click()
    await expect(page.locator('.cm-tooltip')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.cm-content .cm-figure.inline')).toHaveClass(/selected/)
    await page.keyboard.press('Backspace')
    await expect(page.locator('.cm-content img.cm-inline-image')).toHaveCount(0)
    await expect.poll(read).not.toContain('klein.png')
  } finally {
    await app.close()
  }
})

test('an image in the text stands on the baseline of the line, as Typst prints it', async () => {
  await writeFile(
    join(sandbox.projectDir, SHEET),
    'Ein Bild #box(image("assets/a.png", height: 1em)) im Text und #box(image("assets/a.png", height: 2em)) größer.\n',
  )
  const { app, page } = await open()
  try {
    const images = page.locator('.cm-content img.cm-inline-image')
    await expect(images).toHaveCount(2)
    // The baseline of the line: a probe of no height, placed in the text, ends on it.
    const gaps = await page.evaluate(() => {
      const line = document.querySelector('.cm-content .cm-line')!
      const probe = document.createElement('span')
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
      line.append(probe)
      const baseline = probe.getBoundingClientRect().bottom
      probe.remove()
      return Array.from(line.querySelectorAll('img.cm-inline-image')).map(
        (img) => img.getBoundingClientRect().bottom - baseline,
      )
    })
    for (const gap of gaps) expect(Math.abs(gap)).toBeLessThan(1.5)
  } finally {
    await app.close()
  }
})

test('clicking a line below a tall figure puts the caret in that line', async () => {
  const lines = Array.from({ length: 5 }, (_, i) => `Nach Zeile ${i + 1} mit etwas Text.`).join(
    '\n\n',
  )
  await writeFile(
    join(sandbox.projectDir, SHEET),
    `Vor dem Bild.\n\n#figure(\n  image("assets/tall.png", width: 60%),\n  caption: [Hoch],\n)\n\n${lines}\n`,
  )
  await writeFile(join(sandbox.projectDir, 'assets/tall.png'), makePng(600, 400))
  const { app, page } = await open()
  try {
    await expect(figures(page)).toHaveCount(1)
    await expect
      .poll(() =>
        figures(page)
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete),
      )
      .toBe(true)
    for (let n = 1; n <= 5; n += 1) {
      const line = page.locator('.cm-content .cm-line', { hasText: `Nach Zeile ${n} ` })
      await line.scrollIntoViewIfNeeded()
      const box = (await line.boundingBox())!
      await page.mouse.click(box.x + 30, box.y + box.height / 2)
      const caretLine = await page.evaluate(() => {
        const node = getSelection()!.anchorNode
        const element = node instanceof Element ? node : node?.parentElement
        return element?.closest('.cm-line')?.textContent ?? null
      })
      expect(caretLine).toContain(`Nach Zeile ${n} `)
    }
  } finally {
    await app.close()
  }
})
