import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launchAt, MOD } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const LONG = Array.from({ length: 45 }, (_, i) => `wort${i + 1}`).join(' ')
const SAMPLE = `Er sagte #quote[Hallo #quote[innen] Welt] dort.

Kurz #quote[drei kleine Wörter] hier.

Davor steht #quote[${LONG}] und danach geht es weiter.

#quote(block: true)[Ein Block.]
`

/** The setting lives in the settings window (Cmd+,, tab "Text"). */
async function toggleBlockMarks(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+,`)
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' })
  await dialog.getByRole('tab', { name: 'Darstellung' }).click()
  await dialog.getByRole('checkbox', { name: 'Blockzitate mit Anführungszeichen' }).click()
  await dialog.getByRole('button', { name: 'Schließen' }).click()
  await expect(dialog).toHaveCount(0)
}

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function open() {
  return launchAt(sandbox, 'methoden/design.typ')
}

const line = (page: Page, text: string) => page.locator('.cm-content .cm-line', { hasText: text })
const hint = (page: Page) => page.locator('.cm-quote-hint')

test('draws the quotation marks of the project language and never shows the syntax', async () => {
  const { app, page } = await open()
  try {
    // German project: „…“ outside, ‚…‘ inside.
    await expect(line(page, 'Er sagte')).toHaveText('Er sagte „Hallo ‚innen‘ Welt“ dort.')
    await expect(line(page, 'Kurz')).toHaveText('Kurz „drei kleine Wörter“ hier.')
    const text = await page.locator('.cm-content').innerText()
    expect(text).not.toContain('#quote(block: true)[Ein Block.]')
    // The marks are decoration: the file has none.
    const source = await read()
    expect(source).not.toMatch(/[„“‚‘]/)
  } finally {
    await app.close()
  }
})

test('the opening low mark of the German quote is drawn, in a face that has it', async () => {
  const { app, page } = await open()
  try {
    const mark = page.locator('.cm-quote-mark.open.low-base').first()
    await expect(mark).toHaveText('„')
    // Libertinus has an empty glyph for it: the mark must not be set in that face.
    expect(await mark.evaluate((el) => getComputedStyle(el).fontFamily)).not.toContain('Libertinus')
    // And something is drawn: the mark's pixels differ from the empty page behind it.
    const box = (await mark.boundingBox())!
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height }
    const shot = await page.screenshot({ clip })
    const flat = await page.evaluate(async (b64) => {
      const image = new Image()
      image.src = `data:image/png;base64,${b64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let dark = 0
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 140) dark += 1
      return dark
    }, shot.toString('base64'))
    expect(flat).toBeGreaterThan(3)
  } finally {
    await app.close()
  }
})

test('the marks follow the language of the project', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: SAMPLE,
    'project.toml': `[project]
version = 1
title = "Thesis"
language = "en"

[order]
"" = ["methoden"]
"methoden" = ["design.typ"]
`,
  })
  const { app, page } = await open()
  try {
    await expect(line(page, 'Er sagte')).toHaveText('Er sagte “Hallo ‘innen’ Welt” dort.')
  } finally {
    await app.close()
  }
})

test('an inline quote has a faint ground that includes its marks, a deeper one inside another', async () => {
  const { app, page } = await open()
  try {
    const background = (selector: string, n: number) =>
      page
        .locator(selector)
        .nth(n)
        .evaluate((node) => getComputedStyle(node).backgroundColor)
    const editorGround = await page
      .locator('.cm-content')
      .evaluate((node) => getComputedStyle(node).backgroundColor)
    // The text and both marks have the ground, so a quote reads as one unit; the text color is not
    // changed (the ground is what marks it).
    const outer = await background('.cm-quote-inline:not(.inner)', 0)
    expect(outer).not.toBe(editorGround)
    expect(outer).not.toBe('rgba(0, 0, 0, 0)')
    await expect(page.locator('.cm-quote-mark.ground.open').first()).toBeVisible()
    expect(await background('.cm-quote-mark.ground.open:not(.inner)', 0)).toBe(outer)
    expect(await background('.cm-quote-mark.ground.close:not(.inner)', 0)).toBe(outer)
    expect(await background('.cm-quote-mark.ground.close.inner', 0)).not.toBe(outer)
    // One inside another is a step deeper.
    const inner = await background('.cm-quote-inline.inner', 0)
    expect(inner).not.toBe(outer)
    expect(inner).not.toBe('rgba(0, 0, 0, 0)')
    // The ground is faint and translucent: the selection is drawn behind the text, and a solid
    // ground would hide it. (Alpha is the fourth number of rgba(…).)
    const alpha = (color: string): number => Number(/,\s*([\d.]+)\)$/.exec(color)?.[1] ?? 1)
    expect(alpha(outer)).toBeLessThan(0.15)
    expect(alpha(inner)).toBeLessThan(0.2)
    expect(alpha(inner)).toBeGreaterThan(alpha(outer))
    // Every inline quote has it (four here: the outer and inner one, a short one, and a long one).
    // (The ground may come in pieces where a mark is kept on the line of the word it touches, so
    // the quotes are counted by their marks.)
    await expect(page.locator('.cm-quote-mark.ground.open')).toHaveCount(4)
    // A block quote has the same ground, beside its rule.
    expect(await background('.cm-line.cm-quote', 0)).toBe(outer)
  } finally {
    await app.close()
  }
})

test('quotation marks typed by hand become a quote when the closing mark is typed', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    // German marks, and then straight ones, each in a paragraph of its own.
    await page.keyboard.type('Dann „Das ist wahr“')
    await expect.poll(read).toContain('Dann #quote[Das ist wahr]')
    await page.keyboard.type(' und "so auch')
    await page.keyboard.type('"')
    await expect.poll(read).toContain('Dann #quote[Das ist wahr] und #quote[so auch]')
    // Not a mark of the file: it was never written, and the editor draws the project's own marks.
    const source = await read()
    expect(source).not.toMatch(/[„“"]/)
    await expect(line(page, 'Dann')).toHaveText('Dann „Das ist wahr“ und „so auch“')
    await expect(page.locator('.cm-quote-mark.ground.open:not(.inner)')).toHaveCount(5)
    // The caret is behind the quote: typing goes on in the text.
    await page.keyboard.type(' weiter')
    await expect.poll(read).toContain('#quote[so auch] weiter')
  } finally {
    await app.close()
  }
})

test('a lone mark, an inch sign, and text typed in Quelltext mode are left as typed', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    // An inch sign is not an opening mark, and a mark after a space is not a closing one.
    await page.keyboard.type('Der Bildschirm hat 5" und 6" Größe und " lose')
    await expect.poll(read).toContain('Der Bildschirm hat 5" und 6" Größe und " lose')
    expect(await read()).not.toContain('Der Bildschirm hat 5" und 6" Größe und " lose#quote')

    // With Quelltext on, what is typed stays as typed.
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(' dann "eigen')
    await page.keyboard.type('"')
    await expect.poll(read).toContain('dann "eigen"')
  } finally {
    await app.close()
  }
})

test('a press next to the marks marks the quote, and the next one takes it off, keeping its text', async () => {
  const { app, page } = await open()
  const kurz = () => line(page, 'Kurz')
  const armed = page.locator('.cm-content .cm-quote-mark.armed')
  try {
    await kurz().click()
    await page.keyboard.press('End')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft') // before " hier."
    // Wherever the caret is, the syntax stays hidden.
    await expect(page.locator('.cm-content')).not.toContainText('#quote[drei')
    // Right after the closing mark: the first Backspace marks the quote and changes nothing.
    await page.keyboard.press('Backspace')
    await expect(armed).toHaveCount(2)
    await expect(kurz()).toHaveText('Kurz „drei kleine Wörter“ hier.')
    // The second takes the quote off; its words stay.
    await page.keyboard.press('Backspace')
    await expect(kurz()).toHaveText('Kurz drei kleine Wörter hier.')
    await expect.poll(read).toContain('Kurz drei kleine Wörter hier.')
    await page.keyboard.press(`${MOD}+z`)
    await expect(kurz()).toHaveText('Kurz „drei kleine Wörter“ hier.')
    await expect.poll(read).toContain('Kurz #quote[drei kleine Wörter] hier.')

    // Moving the caret lets the mark go: the next Backspace is an ordinary one again.
    await kurz().click()
    await page.keyboard.press('End')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Backspace')
    await expect(armed).toHaveCount(2)
    await page.keyboard.press('ArrowLeft') // into the quote, before its closing mark
    await expect(armed).toHaveCount(0)
    await page.keyboard.press('Backspace')
    await expect(kurz()).toHaveText('Kurz „drei kleine Wörte“ hier.')
    await page.keyboard.press(`${MOD}+z`)

    // From inside, at the start of the quoted words, the same: mark, then take off.
    await kurz().click()
    await page.keyboard.press('Home')
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight') // past "Kurz " and „
    await page.keyboard.press('Backspace')
    await expect(armed).toHaveCount(2)
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('Kurz drei kleine Wörter hier.')
  } finally {
    await app.close()
  }
})

test('an emptied quote goes with the next Backspace', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({ [SHEET]: 'Ein #quote[ab] Ende.\n' })
  const { app, page } = await open()
  try {
    const text = line(page, 'Ende')
    await expect(text).toHaveText('Ein „ab“ Ende.')
    await text.click()
    await page.keyboard.press('End')
    for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowLeft') // inside, after "ab"
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toBe('Ein #quote[] Ende.\n')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toBe('Ein  Ende.\n')
  } finally {
    await app.close()
  }
})

test('the marks of the quote the caret is in are in the accent, and a block quote its rule', async () => {
  const { app, page } = await open()
  const current = page.locator('.cm-content .cm-quote-mark.current')
  try {
    await line(page, 'Kurz').getByText('kleine').click()
    await expect(current).toHaveText(['„', '“'])
    // In a quote inside another, only the inner one.
    await page.locator('.cm-content').getByText('nne').click() // inside "innen"
    await expect(current).toHaveText(['‚', '‘'])
    await page.keyboard.press(`${MOD}+ArrowDown`) // the empty last line, outside every quote
    await expect(current).toHaveCount(0)
    await expect(page.locator('.cm-content .cm-line.cm-quote-current')).toHaveCount(0)
    await page.locator('.cm-content .cm-line.cm-quote').click()
    await expect(page.locator('.cm-content .cm-line.cm-quote-current')).toHaveCount(1)
  } finally {
    await app.close()
  }
})

test('the quote tool wraps a selection, and takes the quote off again', async () => {
  const { app, page } = await open()
  try {
    // Select the word "dort" at the end of the first line.
    await line(page, 'Er sagte').click()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft') // in front of the full stop
    await page.keyboard.press('Shift+Alt+ArrowLeft')
    const tool = page.locator('.toolbar').getByRole('button', { name: 'Zitat', exact: true })
    await tool.click()
    await page.getByRole('menuitem', { name: 'Zitat im Text' }).click()
    await expect.poll(read).toContain('Welt] #quote[dort].')
    await expect(line(page, 'Er sagte')).toContainText('„dort“')
    await expect(tool).toHaveAttribute('aria-pressed', 'true')

    // With the caret in the quote the shortcut takes it off.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press(`${MOD}+Alt+g`)
    await expect.poll(read).toContain('Welt] dort.')
    await expect(tool).toHaveAttribute('aria-pressed', 'false')
  } finally {
    await app.close()
  }
})

test('a long inline quote offers a block quote while the caret is in it, and a short one does not', async () => {
  const { app, page } = await open()
  try {
    await expect(hint(page)).toHaveCount(0)
    await line(page, 'Kurz').click()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight') // somewhere in the line, near the short quote
    await expect(hint(page)).toHaveCount(0)

    await line(page, 'Davor steht').click({ position: { x: 40, y: 8 } })
    await page.keyboard.press('Home')
    for (let i = 0; i < 16; i += 1) await page.keyboard.press('ArrowRight') // inside the quote
    await expect(hint(page)).toHaveText('45 Wörter – als Blockzitat setzen')
    expect(await read()).toContain('#quote[wort1 ')

    await hint(page).click()
    await expect
      .poll(read)
      .toContain(`Davor steht\n\n#quote(block: true)[${LONG}]\n\nund danach geht es weiter.`)
    await expect(page.locator('.cm-line.cm-quote').first()).toContainText('wort1 wort2')
    await expect(hint(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the two forms are turned into each other from the quote menu', async () => {
  const { app, page } = await open()
  try {
    // Block to inline: caret in the block quote.
    await page.locator('.cm-content').getByText('Ein Block.').click()
    await page.locator('.toolbar').getByRole('button', { name: 'Zitat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Zitat im Text' }).click()
    await expect.poll(read).toContain('#quote[Ein Block.]')
    expect(await read()).not.toContain('block: true')

    // Inline to block: caret in the short quote.
    await line(page, 'Kurz').click()
    await page.keyboard.press('Home')
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight')
    await page.locator('.toolbar').getByRole('button', { name: 'Zitat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Blockzitat' }).click()
    await expect.poll(read).toContain('Kurz\n\n#quote(block: true)[drei kleine Wörter]\n\nhier.')
  } finally {
    await app.close()
  }
})

test('the continuous view shows the marks too, and Quelltext shows the syntax', async () => {
  const { app, page } = await open()
  try {
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await expect(page.locator('.cm-content')).toContainText('#quote[Hallo #quote[innen] Welt]')
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await expect(line(page, 'Er sagte')).toContainText('„Hallo')
  } finally {
    await app.close()
  }
})

test('a block quote keeps its syntax hidden, and typing at its edges stays inside it', async () => {
  const { app, page } = await open()
  try {
    const block = page.locator('.cm-content .cm-line.cm-quote')
    await expect(block).toHaveText('Ein Block.')

    // Clicking at the start and typing puts the text in the quote, and the syntax never shows.
    await block.click({ position: { x: 1, y: 8 } })
    await page.keyboard.press('Home')
    await page.keyboard.type('A')
    await expect(page.locator('.cm-content')).not.toContainText('#quote(block')
    await expect.poll(read).toContain('#quote(block: true)[AEin Block.]')

    // The same at the end of the line.
    await page.keyboard.press('End')
    await page.keyboard.type('Z')
    await expect.poll(read).toContain('[AEin Block.Z]')
    await expect(page.locator('.cm-content')).not.toContainText('#quote(block')

    // An arrow key out of the quote leaves it in one step, to the line before.
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('Y')
    await expect.poll(read).toMatch(/\nY\n#quote\(block: true\)\[AEin/)
  } finally {
    await app.close()
  }
})

test('Backspace at the start of a block quote marks it, and the next one takes it off', async () => {
  const { app, page } = await open()
  try {
    const block = page.locator('.cm-content .cm-line.cm-quote')
    await block.click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    await expect(page.locator('.cm-content .cm-line.cm-quote-armed')).toHaveCount(1)
    expect(await read()).toMatch(/\n#quote\(block: true\)\[Ein Block\.\]\n$/)
    await page.keyboard.press('Backspace')
    await expect(page.locator('.cm-content .cm-line.cm-quote')).toHaveCount(0)
    await expect.poll(read).toMatch(/weiter\.\n\nEin Block\.\n$/)
  } finally {
    await app.close()
  }
})

test('Enter on an empty last line leaves a block quote, as in a list', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content .cm-line.cm-quote').click()
    await page.keyboard.press('End')
    // Enter at the end of the text starts a paragraph in the quote.
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zwei.')
    await expect.poll(read).toContain('#quote(block: true)[Ein Block.\nZwei.]')
    // Enter on the empty line that follows takes it out of the quote.
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Danach.')
    await expect.poll(read).toMatch(/#quote\(block: true\)\[Ein Block\.\nZwei\.\]\nDanach\.\n$/)
    await expect(page.locator('.cm-content .cm-line.cm-quote')).toHaveCount(2)
  } finally {
    await app.close()
  }
})

test('the project setting puts the quotation marks of the language around block quotes', async () => {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: 'Davor.\n\n#quote(block: true)[Er sagte #quote[innen] dort.]\n\nDanach.\n',
  })
  const { app, page } = await open()
  try {
    const block = page.locator('.cm-content .cm-line.cm-quote')
    // Off: no marks, and the inner quote has the outer ones.
    await expect(block).toHaveText('Er sagte „innen“ dort.')

    await toggleBlockMarks(page)
    // On: the marks come from the same place as for inline quotes, and the inner quote nests.
    await expect(block).toHaveText('„Er sagte ‚innen‘ dort.“')
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .toContain('block_marks = true')
    // The file's block quote itself is unchanged: the marks are never typed into the text.
    expect(await read()).toContain('#quote(block: true)[Er sagte #quote[innen] dort.]')

    // Typing at the edges stays inside the marks, and Backspace at the start only marks the quote.
    await block.click()
    await page.keyboard.press('Home')
    await page.keyboard.type('A')
    // (With the caret in it, the quote offers to add a source after its closing mark.)
    await expect(block).toHaveText('„AEr sagte ‚innen‘ dort.“+ Quelle hinzufügen')
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    await expect(page.locator('.cm-content .cm-line.cm-quote')).toHaveCount(1)
    await expect.poll(read).toContain('#quote(block: true)[AEr sagte #quote[innen] dort.]')

    await toggleBlockMarks(page)
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .not.toContain('block_marks')
  } finally {
    await app.close()
  }
})

const BIB = `
@article{smith2020, author = {Smith, John}, title = {Eine Studie}, journal = {Zeitschrift}, year = {2020}}
@book{jones2019, author = {Jones, Mary}, title = {Ein Buch}, year = {2019}}
`

async function openWith(content: string) {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({ [SHEET]: content, 'library.bib': BIB })
  return open()
}

const citeDialog = (page: Page) => page.getByRole('dialog', { name: 'Beleg bearbeiten' })
const sourceChips = (page: Page) => page.locator('.cm-content .cm-quote-source .cm-cite')

test('the source of a block quote is drawn after its text as chips, never inside the quoted text', async () => {
  const { app, page } = await openWith(
    'Davor.\n\n#quote(block: true, attribution: [@smith2020[S. 12]])[Der zitierte Text.]\n\nDanach.\n',
  )
  try {
    const block = page.locator('.cm-content .cm-line.cm-quote')
    await expect(block).toHaveText('Der zitierte Text.(Smith 2020, S. 12)')
    await expect(sourceChips(page)).toHaveText(['(Smith 2020, S. 12)'])
    await expect(page.locator('.cm-content')).not.toContainText('attribution')
    // A click on the chip opens the citation editor for it.
    await sourceChips(page).click()
    await expect(citeDialog(page)).toBeVisible()
    await expect(citeDialog(page).locator('.cm-cite-token')).toHaveText(['Smith 2020, S. 12×'])
  } finally {
    await app.close()
  }
})

test('a block quote without a source offers one while the caret is in it, and the work goes to the attribution', async () => {
  const { app, page } = await openWith('Davor.\n\n#quote(block: true)[Ein Block.]\n\nDanach.\n')
  try {
    const add = page.locator('.cm-quote-source-add')
    await expect(add).toHaveCount(0)
    await page.locator('.cm-content').getByText('Ein Block.').click()
    await expect(add).toHaveText('+ Quelle hinzufügen')
    await add.click()
    await expect(citeDialog(page)).toBeVisible()
    await page.locator('input.cm-cite-search').fill('jones')
    await page.keyboard.press('Enter')
    // The citation is in the attribution, not in the quoted words.
    await expect.poll(read).toContain('#quote(block: true, attribution: [@jones2019])[Ein Block.]')
    await expect(sourceChips(page)).toHaveText(['(Jones 2019)'])
    await page.getByLabel('Seite oder Stelle').fill('S. 3')
    await expect
      .poll(read)
      .toContain('#quote(block: true, attribution: [@jones2019[S. 3]])[Ein Block.]')

    // Taking the last work out takes the empty source away with it.
    await citeDialog(page).getByRole('button', { name: 'Beleg entfernen' }).click()
    await expect.poll(read).toContain('#quote(block: true)[Ein Block.]')
  } finally {
    await app.close()
  }
})

test('the Beleg button in a block quote cites into its source', async () => {
  const { app, page } = await openWith('#quote(block: true)[Ein Block.]\n')
  try {
    await page.locator('.cm-content').getByText('Ein Block.').click()
    await page.locator('.toolbar').getByRole('button', { name: 'Beleg', exact: true }).click()
    await page.locator('input.cm-cite-search').fill('smith')
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('#quote(block: true, attribution: [@smith2020])[Ein Block.]')
  } finally {
    await app.close()
  }
})

test('an epigraph is set apart, and its source is a free-text field under it', async () => {
  const { app, page } = await openWith(
    '= Kapitel\n\n#quote(block: true, attribution: [Goethe, _Faust_])[Habe nun, ach!] <epigraph>\n\nText.\n',
  )
  try {
    const motto = page.locator('.cm-content .cm-line.cm-epigraph')
    await expect(motto).toHaveText('Habe nun, ach!')
    await expect(page.locator('.cm-content')).not.toContainText('<epigraph>')
    const field = page.locator('.cm-epigraph-source-input')
    await expect(field).toHaveValue('Goethe, _Faust_')

    // Typing in the field changes the attribution, and nothing else.
    await field.fill('Goethe, Faust I')
    await expect
      .poll(read)
      .toContain('#quote(block: true, attribution: [Goethe, Faust I])[Habe nun, ach!] <epigraph>')
    // Brackets that do not match are not written.
    await field.fill('Offen [ nie')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(await read()).toContain('attribution: [Goethe, Faust I]')
    // An empty field takes the source away.
    await field.fill('')
    await expect.poll(read).toContain('#quote(block: true)[Habe nun, ach!] <epigraph>')
    await field.press('Enter')
    await expect(page.locator('.cm-content .cm-line.cm-epigraph')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the quote menu has the three kinds and changes between them', async () => {
  const { app, page } = await openWith(
    'Er sagte #quote[kurz] @smith2020 dort.\n\n#quote(block: true, attribution: [@jones2019])[Ein Block.]\n',
  )
  try {
    const menu = page.locator('.toolbar').getByRole('button', { name: 'Zitat', exact: true })
    await page.locator('.cm-content').getByText('Ein Block.').click()
    await menu.click()
    for (const name of ['Zitat im Text', 'Blockzitat', 'Epigraph'])
      await expect(page.getByRole('menuitem', { name })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Epigraph' }).click()
    await expect
      .poll(read)
      .toContain('#quote(block: true, attribution: [@jones2019])[Ein Block.] <epigraph>')

    // And back to a block quote in the text: the label goes, the source stays.
    await menu.click()
    await page.getByRole('menuitem', { name: 'Blockzitat' }).click()
    await expect
      .poll(read)
      .toContain('#quote(block: true, attribution: [@jones2019])[Ein Block.]\n')
    expect(await read()).not.toContain('<epigraph>')

    // A block quote becomes a quote in the text with its source after it, as any citation.
    await menu.click()
    await page.getByRole('menuitem', { name: 'Zitat im Text' }).click()
    await expect.poll(read).toContain('#quote[Ein Block.] @jones2019')
  } finally {
    await app.close()
  }
})

test('the caret stays inside a block quote after the line above is joined to it', async () => {
  const { app, page } = await openWith('Davor.\n\n#quote(block: true)[Der Text.]\n')
  try {
    await toggleBlockMarks(page)
    await page.locator('.cm-content').getByText('Davor.').click()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowDown') // the blank line
    await page.keyboard.press('Delete') // joins it to the quote's line
    await page.keyboard.type('X')
    // The text went into the quote, behind the opening mark, not in front of it.
    await expect(page.locator('.cm-content .cm-line.cm-quote')).toHaveText(
      '„XDer Text.“+ Quelle hinzufügen',
    )
    await expect.poll(read).toContain('#quote(block: true)[XDer Text.]')
  } finally {
    await app.close()
  }
})

test('a block quote with its text gone loses its source first, then itself', async () => {
  const { app, page } = await openWith('#quote(block: true, attribution: [@smith2020[S. 4]])[Er]\n')
  try {
    await expect(sourceChips(page)).toHaveCount(1)
    const block = page.locator('.cm-content .cm-line.cm-quote')
    await block.click()
    // With text in it, Backspace at its start only marks the quote: source and quote stay.
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    expect(await read()).toBe('#quote(block: true, attribution: [@smith2020[S. 4]])[Er]\n')
    // The words go letter by letter; then the source, then the quote.
    await block.click()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight') // after "Er"
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toBe('#quote(block: true, attribution: [@smith2020[S. 4]])[]\n')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toBe('#quote(block: true)[]\n')
    await expect(sourceChips(page)).toHaveCount(0)
    await page.keyboard.press('Backspace')
    await expect.poll(read).toBe('\n')
    // Undo brings back the quote, then its source.
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toBe('#quote(block: true)[]\n')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toContain('attribution: [@smith2020[S. 4]]')
  } finally {
    await app.close()
  }
})

test('a line never breaks between a quotation mark, a footnote marker, or hidden syntax and the text it touches', async () => {
  const text = (i: number) =>
    `${'Ein Satz mit Wörtern '.slice(0, i)}und dann #quote[noch eins] am Schluss, ` +
    `Wasser ist H#sub[2]O, ein Wort#footnote[Eine Notiz.] und mehr #quote[Text].`
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: Array.from({ length: 12 }, (_, i) => text(i * 2)).join('\n') + '\n',
  })
  const { app, page } = await open()
  try {
    await expect(page.locator('.cm-content .cm-together .cm-quote-mark').first()).toBeVisible()
    // At every width of the text, each piece kept together is on one line.
    const split = await page.locator('.cm-content').evaluate(async (content) => {
      const found: string[] = []
      for (let width = 300; width <= 760; width += 4) {
        content.style.maxWidth = `${width}px`
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        for (const piece of Array.from(content.querySelectorAll('.cm-together'))) {
          const tops = Array.from(piece.getClientRects()).map((rect) => Math.round(rect.top))
          if (Math.max(...tops) - Math.min(...tops) > 4)
            found.push(`${width}: ${piece.textContent}`)
        }
      }
      content.style.maxWidth = ''
      return found
    })
    expect(split).toEqual([])
  } finally {
    await app.close()
  }
})
