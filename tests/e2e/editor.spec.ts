import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { createSandbox, launch, MOD, openSheet, TO_END } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'

const SAMPLE = `= Methoden

Das Design ist _qualitativ_ und *explorativ*. Die ::Stichprobe war zielgerichtet:: breit /* Auswahlkriterien */ und gut.

== Vorgehen

- Erster Punkt
- Zweiter Punkt
+ Eins
+ Zwei

Siehe #link("https://example.org")[diese Seite] und https://example.org/bare.

#quote(block: true)[Ein Zitat im Block.]

Ein Wort und noch ein Satz.
`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function open(): Promise<{
  page: Page
  app: Awaited<ReturnType<typeof launch>>['app']
  content: Locator
}> {
  const { app, page } = await launch(sandbox)
  await openSheet(page, 'methoden/design.typ')
  const content = page.locator('.cm-content')
  await expect(content).toBeVisible()
  return { app, page, content }
}

/** Puts the caret at the end of the document and returns after a short settle. */
async function toEnd(page: Page): Promise<void> {
  await page.keyboard.press(TO_END)
}

test('shows simple markup as styled text, with syntax hidden where it reads better', async () => {
  const { app, page, content } = await open()
  try {
    await toEnd(page)
    await expect(page.locator('.cm-heading-1')).toContainText('Methoden')
    await expect(page.locator('.cm-heading-2')).toContainText('Vorgehen')
    await expect(page.locator('.cm-emphasis').first()).toHaveText('_qualitativ_')
    await expect(page.locator('.cm-strong').first()).toHaveText('*explorativ*')
    // Heading, emphasis, and strong markers stay visible (dimmed).
    await expect(page.locator('.cm-heading-1 .cm-marker')).toHaveText('=')
    // Highlights, links, and quotes hide their syntax.
    await expect(page.locator('.cm-highlight')).toHaveText('Stichprobe war zielgerichtet')
    const text = await content.innerText()
    expect(text).not.toContain('::')
    expect(text).not.toContain('#link')
    expect(text).not.toContain('#quote')
    expect(text).toContain('diese Seite')
    await expect(page.locator('.cm-link').first()).toHaveText('diese Seite')
    await expect(page.locator('.cm-line.cm-quote')).toContainText('Ein Zitat im Block.')
    // Lists show bullets and numbers instead of - and +.
    await expect(page.locator('.cm-list-marker')).toHaveText(['•', '•', '1.', '2.'])
    // The comment is a pill.
    await expect(page.locator('.cm-comment-pill')).toHaveCount(1)
    await expect(page.locator('.cm-comment-pill')).toContainText('Auswahlkriterien')
    expect(text).not.toContain('/*')
  } finally {
    await app.close()
  }
})

test('reveals the source where the selection touches it, and hides it again', async () => {
  const { app, page, content } = await open()
  try {
    await toEnd(page)
    // Clicking the pill puts the caret next to it and shows the comment as written.
    await page.locator('.cm-comment-pill').click()
    await expect(page.locator('.cm-comment-pill')).toHaveCount(0)
    await expect(content).toContainText('/* Auswahlkriterien */')
    await toEnd(page)
    await expect(page.locator('.cm-comment-pill')).toHaveCount(1)

    // A click into the marked words shows both delimiters at once, not only the nearer one.
    await page.locator('.cm-highlight').getByText('war').click()
    await expect(content).toContainText('::Stichprobe war zielgerichtet::')
    await toEnd(page)
    expect(await content.innerText()).not.toContain('::')

    // Selecting the whole line shows the highlight's delimiters too.
    await page.locator('.cm-highlight').click({ clickCount: 3 })
    await expect(content).toContainText('::Stichprobe war zielgerichtet::')
    await toEnd(page)
    expect(await content.innerText()).not.toContain('::')
  } finally {
    await app.close()
  }
})

test('"Quelltext" shows everything as written, then returns to the styled view', async () => {
  const { app, page, content } = await open()
  try {
    await toEnd(page)
    await page.getByRole('button', { name: 'Quelltext' }).click()
    await expect(page.locator('.cm-comment-pill')).toHaveCount(0)
    await expect(content).toContainText('::Stichprobe war zielgerichtet::')
    await expect(content).toContainText('#link("https://example.org")[diese Seite]')
    await expect(content).toContainText('#quote(block: true)[Ein Zitat im Block.]')
    await expect(content).toContainText('/* Auswahlkriterien */')
    await expect(page.getByRole('button', { name: 'Quelltext' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByRole('button', { name: 'Quelltext' }).click()
    await expect(page.locator('.cm-comment-pill')).toHaveCount(1)
    expect(await content.innerText()).not.toContain('::')
  } finally {
    await app.close()
  }
})

test('emphasis and strong by keyboard toggle on a word and on a selection', async () => {
  const { app, page, content } = await open()
  try {
    const word = content.getByText('Ein Wort und noch ein Satz.')
    await word.dblclick({ position: { x: 40, y: 8 } }) // selects "Wort"? the exact word is checked below
    await page.keyboard.press(`${MOD}+i`)
    await expect.poll(read).toMatch(/_\w+_ und noch ein Satz\./)
    await page.keyboard.press(`${MOD}+i`)
    await expect.poll(read).toContain('Ein Wort und noch ein Satz.')
    await page.keyboard.press(`${MOD}+b`)
    await expect.poll(read).toMatch(/\*\w+\* (und|Wort)/)
  } finally {
    await app.close()
  }
})

test('the toolbar turns the selection into a comment', async () => {
  const { app, page, content } = await open()
  try {
    await content.getByText('Ein Wort und noch ein Satz.').dblclick({ position: { x: 4, y: 8 } })
    await page.getByRole('button', { name: 'Kommentar' }).click()
    await expect.poll(read).toContain('/* Ein */ Wort und noch ein Satz.')
    expect(await read()).not.toContain('::Ein::')
    // The caret is right after it, so the comment shows as written; moving on shows the pill.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.cm-comment-pill').last()).toContainText('Ein')
  } finally {
    await app.close()
  }
})

test('the toolbar adds a comment after the highlight that holds the caret', async () => {
  const { app, page, content } = await open()
  try {
    await content.getByText('Ein Wort und noch ein Satz.').dblclick({ position: { x: 4, y: 8 } })
    await page.getByRole('button', { name: 'Anmerkung' }).click()
    await expect.poll(read).toContain('::Ein:: Wort und noch ein Satz.')
    await page.getByRole('button', { name: 'Kommentar' }).click()
    await expect.poll(read).toContain('::Ein:: /*  */ Wort')
    // The caret is inside the new comment, so typing fills it.
    await page.keyboard.type('Nachfragen')
    await expect.poll(read).toContain('::Ein:: /* Nachfragen */ Wort')
  } finally {
    await app.close()
  }
})

test('tools are disabled without an open sheet', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await expect(page.getByRole('button', { name: 'Anmerkung' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Kommentar' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Quelltext' })).toBeEnabled()
  } finally {
    await app.close()
  }
})

test('selecting text shows no floating toolbar: the toolbar applies to the selection', async () => {
  const { app, page, content } = await open()
  try {
    await content.getByText('Ein Wort und noch ein Satz.').dblclick({ position: { x: 4, y: 8 } })
    await expect(page.locator('.cm-tooltip')).toHaveCount(0)
    const tool = (name: string) =>
      page.locator('.toolbar').getByRole('button', { name, exact: true })
    await tool('Betont').click()
    await expect.poll(read).toContain('_Ein_ Wort')
    await tool('Überschrift').click()
    await tool('Überschrift').click()
    await expect.poll(read).toContain('== _Ein_ Wort und noch ein Satz.')
    await expect(page.getByRole('button', { name: /Absatz: Überschrift 2/ })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the paragraph style menu in the status bar changes the style, and shows the current one', async () => {
  const { app, page, content } = await open()
  try {
    await content.getByText('Ein Wort und noch ein Satz.').click()
    await expect(page.getByRole('button', { name: /Absatz: Fließtext/ })).toBeVisible()
    await page.getByRole('button', { name: /Absatz: Fließtext/ }).click()
    await page.getByRole('menuitem', { name: 'Aufzählung' }).click()
    await expect.poll(read).toContain('- Ein Wort und noch ein Satz.')
    await expect(page.getByRole('button', { name: /Absatz: Aufzählung/ })).toBeVisible()
    await page.getByRole('button', { name: /Absatz: Aufzählung/ }).click()
    await page.getByRole('menuitem', { name: 'Aufzählung' }).click() // again: back to body text
    await expect.poll(read).toContain('\nEin Wort und noch ein Satz.')
  } finally {
    await app.close()
  }
})

test('Enter starts a paragraph, Shift+Enter breaks the line, Backspace joins two paragraphs', async () => {
  const { app, page } = await open()
  try {
    // Typed on the empty last line of the sheet, the words start a paragraph of their own.
    await toEnd(page)
    await page.keyboard.type('Erster Absatz.')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zweiter')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('Absatz.')
    await expect.poll(read).toMatch(/Satz\.\n\nErster Absatz\.\n\nZweiter \\\nAbsatz\.$/)
    // The empty line is the gap between the paragraphs; the backslash is hidden away from the caret.
    await expect(page.locator('.cm-content .cm-line.cm-gap').last()).toBeVisible()
    await expect(page.locator('.cm-content .cm-line', { hasText: 'Zweiter' }).last()).toHaveText(
      'Zweiter',
    )
    // Backspace at the start of a paragraph joins it to the one above in one press.
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toMatch(/Erster Absatz\.Zweiter \\\nAbsatz\.$/)
  } finally {
    await app.close()
  }
})

/** Pastes into the editor as another program would put it on the clipboard. */
async function paste(page: Page, plain: string, html?: string): Promise<void> {
  await page.evaluate(
    ([text, markup]) => {
      const data = new DataTransfer()
      data.setData('text/plain', text!)
      if (markup) data.setData('text/html', markup)
      document
        .querySelector('.cm-content')!
        .dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        )
    },
    [plain, html],
  )
}

test('pasted text keeps its paragraphs and loses its other line breaks; text copied here stays', async () => {
  const { app, page } = await open()
  try {
    // From a PDF: the lines break where the page did, an empty line ends the paragraph.
    await toEnd(page)
    await paste(page, 'Eine Zeile aus\neinem PDF.\n\nZweiter Absatz.')
    await expect.poll(read).toMatch(/Satz\.\n\nEine Zeile aus einem PDF\.\n\nZweiter Absatz\.$/)
    // From a word processor: the paragraphs of its HTML.
    await page.keyboard.press('Enter')
    await paste(
      page,
      'Aus Word.\nNoch einer.',
      '<p class=MsoNormal>Aus Word.</p><p>Noch einer.</p>',
    )
    await expect.poll(read).toMatch(/Absatz\.\n\nAus Word\.\n\nNoch einer\.$/)
    // What would be markup prints as it was copied: escaped in the file, drawn without the backslash.
    await page.keyboard.press('Enter')
    await paste(page, 'Mail an a@b.de, Preis $5 und *Sternchen*.')
    await expect.poll(read).toMatch(/\n\nMail an a\\@b\.de, Preis \\\$5 und \\\*Sternchen\\\*\.$/)
    await page.keyboard.press('Enter')
    await expect(page.locator('.cm-content .cm-line', { hasText: 'Mail an' })).toHaveText(
      'Mail an a@b.de, Preis $5 und *Sternchen*.',
    )
    // Copied in the editor itself: pasted as it is, lists and all.
    await page.keyboard.press(`${MOD}+a`)
    const copied = await page.evaluate(() => {
      const data = new DataTransfer()
      document
        .querySelector('.cm-content')!
        .dispatchEvent(
          new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
        )
      return data.getData('text/plain')
    })
    expect(copied).toContain('- Erster Punkt\n- Zweiter Punkt')
    await toEnd(page)
    await page.keyboard.press('Enter')
    await paste(page, copied)
    await expect
      .poll(async () => (await read()).split('- Erster Punkt\n- Zweiter Punkt').length)
      .toBe(3)
  } finally {
    await app.close()
  }
})

test('the caret goes over the empty line between two paragraphs, and a click there ends the one above', async () => {
  const { app, page } = await open()
  try {
    const paragraph = page.locator('.cm-content .cm-line', { hasText: 'Das Design' })
    await paragraph.click({ position: { x: 40, y: 8 } })
    await page.keyboard.press('Home')
    // Left at the start of a paragraph: the end of the heading above, in one press.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('X')
    await expect.poll(read).toContain('= MethodenX\n\nDas Design')
    // Right at the end of it: the start of the paragraph below.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('Y')
    await expect.poll(read).toContain('= MethodenX\n\nYDas Design')
    // Up from the first line of the paragraph: the heading.
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('End')
    await page.keyboard.type('Z')
    await expect.poll(read).toContain('= MethodenXZ\n\nYDas Design')
    // Down from the heading: the paragraph again.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Home')
    await page.keyboard.type('W')
    await expect.poll(read).toContain('= MethodenXZ\n\nWYDas Design')
    // A click on the gap: the end of the paragraph above.
    await page.locator('.cm-content .cm-line.cm-gap').first().click()
    await page.keyboard.type('V')
    await expect.poll(read).toContain('= MethodenXZV\n\nWYDas Design')
  } finally {
    await app.close()
  }
})

test('with Quelltext on the text is lines as written: the empty line can be reached and typed on', async () => {
  const { app, page } = await open()
  try {
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await expect(page.locator('.cm-content .cm-line.cm-gap')).toHaveCount(0)
    await page.locator('.cm-content .cm-line', { hasText: 'Das Design' }).click({
      position: { x: 40, y: 8 },
    })
    await page.keyboard.press('Home')
    // Left at the start of a paragraph stops on the empty line, and what is typed stays there.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('X')
    await expect.poll(read).toContain('= Methoden\nX\nDas Design')
    // Backspace takes one character at a time, the empty line too.
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('= Methoden\n\nDas Design')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('= Methoden\nDas Design')
    // Enter and Shift+Enter write one line break each.
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('= Methoden\n\nDas Design')
    await page.keyboard.press('Shift+Enter')
    await expect.poll(read).toContain('= Methoden\n\n\nDas Design')
    // Up stops on an empty line as well.
    await page.keyboard.press('ArrowUp')
    await page.keyboard.type('Y')
    await expect.poll(read).toContain('= Methoden\nY\n\nDas Design')
    // A paste stays as it is, markup and line breaks too.
    await toEnd(page)
    await paste(page, '#strong[fett]\nzweite Zeile')
    await expect.poll(read).toMatch(/#strong\[fett\]\nzweite Zeile$/)
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
  } finally {
    await app.close()
  }
})

test('typing ==text== becomes a comment', async () => {
  const { app, page, content } = await open()
  try {
    await content.getByText('Ein Wort und noch ein Satz.').click()
    await toEnd(page)
    await page.keyboard.type(' ==Quelle prüfen==')
    await expect.poll(read).toContain('/* Quelle prüfen */')
    expect(await read()).not.toContain('==Quelle')
    // Undo goes back in one step to what was typed before the rule fired.
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).not.toContain('/* Quelle prüfen */')
  } finally {
    await app.close()
  }
})

test('Hyperlink asks for an address and writes #link, and opening is limited to safe addresses', async () => {
  const { app, page, content } = await open()
  try {
    await content.getByText('Ein Wort und noch ein Satz.').dblclick({ position: { x: 4, y: 8 } })
    await page.keyboard.press(`${MOD}+Shift+k`)
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox').fill('example.com/seite')
    await dialog.getByRole('textbox').press('Enter')
    await expect.poll(read).toContain('#link("https://example.com/seite")[Ein] Wort')
    // Its syntax is never shown, not even with the caret in the link.
    await content.locator('.cm-link', { hasText: 'Ein' }).click()
    expect(await content.innerText()).not.toContain('#link("https://example.com')
    // The address is changed with the same tool, which knows the one there is.
    await page.keyboard.press(`${MOD}+Shift+k`)
    await expect(dialog.getByRole('textbox')).toHaveValue('https://example.com/seite')
    await dialog.getByRole('textbox').fill('example.org/neu')
    await dialog.getByRole('textbox').press('Enter')
    await expect.poll(read).toContain('#link("https://example.org/neu")[Ein] Wort')
    // Backspace at the start of its words takes the link off and keeps them.
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    await expect.poll(read).toContain('\nEin Wort und noch ein Satz.')

    // The dialog can take a link off too: "Link entfernen" shows only on a link.
    await page.keyboard.press(`${MOD}+Shift+k`)
    await expect(dialog.getByRole('button', { name: 'Link entfernen' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Abbrechen' }).click()
    await content.locator('.cm-link', { hasText: 'diese Seite' }).click()
    await page.keyboard.press(`${MOD}+Shift+k`)
    await dialog.getByRole('button', { name: 'Link entfernen' }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(read).toContain('Siehe diese Seite und https://example.org/bare.')

    const refused = await page.evaluate(() =>
      window.api.app.openExternal({ url: 'file:///etc/passwd' }),
    )
    expect(refused).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    const refusedJs = await page.evaluate(() =>
      window.api.app.openExternal({ url: 'javascript:alert(1)' }),
    )
    expect(refusedJs).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  } finally {
    await app.close()
  }
})

test('the continuous view shows the same styling, and Quelltext applies there too', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await page.locator('[role=treeitem][data-path="methoden"]').click()
    const flow = page.locator('[data-testid=flow] .cm-content')
    await expect(flow).toContainText('Das Design ist')
    await expect(flow.locator('.cm-comment-pill')).toHaveCount(1)
    await expect(flow.locator('.cm-highlight')).toHaveText('Stichprobe war zielgerichtet')
    await page.getByRole('button', { name: 'Quelltext' }).click()
    await expect(flow.locator('.cm-comment-pill')).toHaveCount(0)
    await expect(flow).toContainText('::Stichprobe war zielgerichtet::')
  } finally {
    await app.close()
  }
})

test('a long sheet keeps its height while scrolling, also at the end and past it', async () => {
  // Paragraphs set off by single line breaks, with no short line of plain characters (from which
  // CodeMirror takes its line height). The space between them used to depend on the line drawn
  // above, so the estimated height of the undrawn lines changed with the scroll position, and the
  // sheet jumped near its end.
  const paragraph =
    'Die Attraktion wird über ihre Marker bestimmt, nicht über das Objekt selbst; so ändert sich ' +
    'die Wahrnehmung mit jeder Reproduktion. '
  const text = Array.from({ length: 60 }, (_, i) => `${i + 1}. ${paragraph.repeat(3 + (i % 4))}`)
  await writeFile(join(sandbox.projectDir, SHEET), text.join('\n') + '\n')
  const { app, page } = await open()
  try {
    const scroller = page.locator('.cm-scroller')
    /** Scrolls to `top` and returns the sheet's height once CodeMirror has measured. */
    const heightAt = (top: number): Promise<number> =>
      scroller.evaluate(async (element, to) => {
        element.scrollTop = to
        for (let i = 0; i < 6; i += 1) await new Promise(requestAnimationFrame)
        return element.scrollHeight
      }, top)
    // Draw every line once, down to the real end, so all heights are measured rather than estimated.
    let end = 0
    for (let top = 0; top <= end + 400; top += 400) end = await heightAt(top)
    const heights = [
      await heightAt(0),
      await heightAt(end / 2),
      await heightAt(1e6),
      await heightAt(end / 3),
      await heightAt(1e6),
    ]
    for (const height of heights) expect(Math.abs(height - heights[0]!)).toBeLessThanOrEqual(1)
  } finally {
    await app.close()
  }
})
