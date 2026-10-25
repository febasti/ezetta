import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AUTOSAVE_SETTLE_MS, createSandbox, launchAt, MOD, openSheet, quietFor } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [SHEET]: 'Ein Satz.#footnote[Eine Fußnote.]\n\n#quote(block: true)[Ein Block.]\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Einstellungen' })

async function open() {
  return launchAt(sandbox, `methoden/design.typ`)
}

test('Cmd+, and the project menu open the settings, and Escape closes them', async () => {
  const { app, page } = await open()
  try {
    // With the caret in a word, Cmd+, only opens the settings: it is not also a format.
    await page.locator('.cm-content').getByText('Ein Satz.').click()
    await page.keyboard.press(`${MOD}+,`)
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await quietFor(page, AUTOSAVE_SETTLE_MS)
    expect(await readFile(join(sandbox.projectDir, SHEET), 'utf8')).not.toContain('#sub')

    await page.getByRole('button', { name: 'Projektmenü' }).click()
    // The app's own settings are no longer in the project menu.
    await expect(page.getByRole('menuitem', { name: /Design: / })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Sprache: / })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Einstellungen …' }).click()
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(dialog(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the Info tab names the license and lists the software that ships with the app', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Info' }).click()
    await expect(dialog(page).locator('p.free')).toContainText('GNU General Public License')
    await expect(dialog(page).locator('p.version')).toHaveText(/^Version \d+\.\d+\.\d+/)
    const notices = dialog(page).locator('pre')
    await expect(notices).toContainText('Typst 0.15.1')
    await expect(notices).toContainText('LanguageTool')
    await expect(notices).toContainText('OpenThesaurus')
    await expect(notices).toContainText('Marginalia')
    await expect(notices).toContainText('SIL OPEN FONT LICENSE')
  } finally {
    await app.close()
  }
})

test('theme and language change at once and are stored', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('radio', { name: 'Dunkel' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    // The first field of the tab, found by place: its label changes with the language.
    await dialog(page).locator('select').first().selectOption('en')
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    // What is chosen is stored, so the next start has it.
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
  } finally {
    await app.close()
  }
})

test('footnotes can be shown as floating cards, and the tabs are reachable with the arrow keys', async () => {
  const { app, page } = await open()
  try {
    await expect(page.locator('.cm-note-card').first()).toBeVisible()
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Allgemein' }).focus()
    // The tabs are at the top, side by side: the arrow to the right goes on.
    await page.keyboard.press('ArrowRight')
    await expect(dialog(page).getByRole('tab', { name: 'Darstellung' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await dialog(page).getByRole('radio', { name: 'Schwebende Karten' }).check()
    await dialog(page).getByRole('button', { name: 'Schließen' }).click()
    await expect(page.locator('.cm-note-card')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the quotation marks of block quotes are a project setting kept in the project file', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Darstellung' }).click()
    await expect(dialog(page)).toContainText('gilt für das geöffnete Projekt')
    await dialog(page).getByRole('checkbox', { name: 'Blockzitate mit Anführungszeichen' }).click()
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .toContain('block_marks = true')
  } finally {
    await app.close()
  }
})

test('the kind of quotation marks is a project setting kept in the project file', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Darstellung' }).click()
    await dialog(page)
      .getByRole('combobox', { name: 'Anführungszeichen', exact: true })
      .selectOption('de-guillemets')
    await expect
      .poll(() => readFile(join(sandbox.projectDir, 'project.toml'), 'utf8'))
      .toContain('style = "de-guillemets"')
  } finally {
    await app.close()
  }
})

test('typewriter scrolling keeps the line being written in the middle of the window', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Darstellung' }).click()
    await dialog(page)
      .getByRole('checkbox', { name: /in der Mitte/ })
      .click()
    await dialog(page).getByRole('button', { name: 'Schließen' }).click()
    await page.locator('.cm-line').first().click()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(`\n\n${'Eine Zeile.\n\n'.repeat(40)}Hier wird geschrieben`)
    const offset = () =>
      page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller')!.getBoundingClientRect()
        const caret = document.querySelector('.cm-cursor')!.getBoundingClientRect()
        return (
          (caret.top + caret.height / 2 - (scroller.top + scroller.height / 2)) / scroller.height
        )
      })
    await expect.poll(async () => Math.abs(await offset())).toBeLessThan(0.08)
  } finally {
    await app.close()
  }
})

test('the font of the editor is chosen in the settings: serif, sans-serif or monospace, with size and spacing', async () => {
  const { app, page } = await open()
  try {
    const writing = () =>
      page.locator('.cm-scroller').evaluate((el) => {
        const css = getComputedStyle(el)
        return { family: css.fontFamily, size: parseFloat(css.fontSize), line: css.lineHeight }
      })
    expect((await writing()).family).toContain('Libertinus Serif')
    expect((await writing()).size).toBeCloseTo(18.4, 1)

    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Darstellung' }).click()
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('1em "Libertinus Serif"')))
      .toBe(true)

    // Each style has its one face.
    await dialog(page).getByRole('radio', { name: 'Serifenlos' }).check()
    await expect.poll(async () => (await writing()).family).toContain('Libertinus Sans')
    await dialog(page).getByRole('radio', { name: 'Monospace' }).check()
    await expect.poll(async () => (await writing()).family).toContain('IBM Plex Mono')
    await dialog(page).getByRole('radio', { name: 'Serifen', exact: true }).check()
    await expect.poll(async () => (await writing()).family).toContain('Libertinus Serif')

    // Size and line spacing.
    const number = async (name: string, text: string) => {
      const field = dialog(page).getByRole('textbox', { name })
      await field.fill(text)
      await field.press('Enter')
    }
    await number('Schriftgröße', '19')
    await number('Zeilenabstand', '1,85')
    await expect.poll(async () => (await writing()).size).toBeCloseTo(19.95, 1)
    const wide = await writing()
    expect(parseFloat(wide.line) / wide.size).toBeCloseTo(1.85, 1)
    // A value outside the range is brought into it, and the arrow keys step.
    await number('Schriftgröße', '99')
    await expect(dialog(page).getByRole('textbox', { name: 'Schriftgröße' })).toHaveValue('32,0')
    await number('Textbreite', '900')
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--measure-writing'),
        ),
      )
      .toBe('900px')
    await number('Schriftgröße', '19')
    await dialog(page).getByRole('textbox', { name: 'Schriftgröße' }).press('ArrowUp')
    await expect(dialog(page).getByRole('textbox', { name: 'Schriftgröße' })).toHaveValue('19,5')

    // The choice is kept when the app is opened again.
    await dialog(page).getByRole('button', { name: 'Schließen' }).click()
    await page.reload()
    await openSheet(page, 'methoden/design.typ')
    await expect(page.locator('.cm-scroller').first()).toBeVisible()
    await expect.poll(async () => (await writing()).family).toContain('Libertinus Serif')
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--font-writing'),
        ),
      )
      .toContain('Libertinus Serif')
  } finally {
    await app.close()
  }
})

test('what stands in the text (citations, footnotes, a quote’s source) follows the font of the editor', async () => {
  await writeFile(
    join(sandbox.projectDir, SHEET),
    'Ein Satz @smith2020[S. 14].#footnote[Eine Fußnote.]\n\n#quote(block: true, attribution: [Müller])[Ein Block.]\n',
  )
  const { app, page } = await open()
  try {
    const families = () =>
      page.evaluate(() => {
        const of = (selector: string) => {
          const el = document.querySelector(selector)
          return el ? getComputedStyle(el).fontFamily : null
        }
        return {
          text: of('.cm-scroller'),
          citation: of('.cm-cite'),
          marker: of('.cm-footnote-marker'),
          note: of('.cm-note-card'),
          source: of('.cm-quote-source-text'),
        }
      })
    const allLikeTheText = async () => {
      const f = await families()
      return [f.citation, f.marker, f.note, f.source].every((family) => family === f.text)
    }
    await expect(page.locator('.cm-cite')).toBeVisible()
    await expect(page.locator('.cm-quote-source-text')).toBeVisible()
    await expect.poll(allLikeTheText).toBe(true)

    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Darstellung' }).click()
    await dialog(page).getByRole('radio', { name: 'Serifenlos' }).check()
    await expect.poll(async () => (await families()).citation).toContain('Libertinus Sans')
    expect(await allLikeTheText()).toBe(true)
  } finally {
    await app.close()
  }
})

test('the monospace face is used for the writing, and for code and formulas too', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    await dialog(page).getByRole('tab', { name: 'Darstellung' }).click()
    await dialog(page).getByRole('radio', { name: 'Monospace' }).check()
    const vars = () =>
      page.evaluate(() => {
        const css = getComputedStyle(document.documentElement)
        return [css.getPropertyValue('--font-writing'), css.getPropertyValue('--font-mono')]
      })
    await expect
      .poll(vars)
      .toEqual([expect.stringContaining('IBM Plex Mono'), expect.stringContaining('IBM Plex Mono')])
    await expect
      .poll(() => page.locator('.cm-scroller').evaluate((el) => getComputedStyle(el).fontFamily))
      .toContain('IBM Plex Mono')
  } finally {
    await app.close()
  }
})
