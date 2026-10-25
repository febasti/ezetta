import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, LANGUAGETOOL, launchAt, quietFor, startLanguageTool } from './helpers'
import type { Sandbox } from './helpers'

// These tests use the real LanguageTool server (`.dev/languagetool`, and Java). The first lets the
// app start its own, as it does for the writer; the others share one started for the file, so they
// do not wait for Java each time.
test.skip(!LANGUAGETOOL, 'LanguageTool is not installed')
// In order, on one worker, so they share one server.
test.describe.configure({ mode: 'default', timeout: 90_000 })

let server: ReturnType<typeof startLanguageTool> | undefined
test.beforeAll(() => {
  if (LANGUAGETOOL) server = startLanguageTool(LANGUAGETOOL)
})
test.afterAll(() => server?.stop())

const SHEET = 'content/methoden/design.typ'
const TEXT = `= Design

Das ist ein Tesst mit @smith2020 und einer Formel $x^2$. Er gehen nach Hause.

Zweiter Absatz ohne Fehler.#footnote[Eine Notitz im Fuß.]
`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: TEXT })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = (path: string) => readFile(join(sandbox.projectDir, path), 'utf8')

/** Opens the Prüfung tab: the text is proofread only while it is showing. */
async function openProof(page: Page) {
  await page
    .locator('footer')
    .getByRole('button', { name: /^Prüfung/ })
    .click()
  await expect(page.getByRole('tab', { name: /Prüfung/ })).toHaveAttribute('aria-selected', 'true')
}

/** Opens the app at the sheet, using the shared server unless it should start its own. */
async function open(options: { ownServer?: boolean } = {}) {
  const env = options.ownServer ? {} : await server!.ready
  return launchAt(sandbox, 'methoden/design.typ', { env })
}

const spelling = (page: Page) => page.locator('.cm-content .cm-proof-spelling')
const grammar = (page: Page) => page.locator('.cm-content .cm-proof-grammar')
const tooltip = (page: Page) => page.locator('.cm-proof-tip')
const badge = (page: Page) => page.getByRole('group', { name: 'Status und Wörter' })
const panel = (page: Page) => page.getByRole('tabpanel', { name: /Prüfung|Literatur/ })

test('the text is proofread only while the Prüfung tab is showing', async () => {
  const { app, page } = await open({ ownServer: true })
  try {
    // Nothing is checked, and nothing is underlined, until the tab is open (the checker would have
    // started and answered by now).
    await quietFor(page, 3000)
    await expect(page.locator('.cm-content .cm-proof')).toHaveCount(0)
    await expect(page.locator('footer').getByRole('button', { name: /^Prüfung/ })).toHaveText(
      'Prüfung',
    )
    await openProof(page)
    // Until the first answer, the text and the tab say that it is being checked, not that all is well.
    await expect(badge(page).getByText('Wird geprüft …')).toBeVisible()
    await expect(panel(page).getByText('Keine Hinweise.')).toHaveCount(0)
    await expect(spelling(page).first()).toBeVisible({ timeout: 40_000 })
    await expect(badge(page).getByText('Wird geprüft …')).toHaveCount(0)
    // Leaving the tab takes the underlines away; coming back brings them back at once.
    await page.getByRole('tab', { name: 'Literatur' }).click()
    await expect(page.locator('.cm-content .cm-proof')).toHaveCount(0)
    await page.getByRole('tab', { name: /Prüfung/ }).click()
    await expect(spelling(page).first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
  }
})

test('underlines a spelling and a grammar error, and leaves citations and formulas alone', async () => {
  const { app, page } = await open()
  try {
    await openProof(page)
    await expect(spelling(page).first()).toBeVisible({ timeout: 40_000 })
    await expect(spelling(page)).toHaveText(['Tesst'])
    await expect(grammar(page)).toHaveCount(1)
    // The status bar says how many issues there are, and the tab lists them.
    await expect(page.getByRole('button', { name: /Prüfung: \d+ Hinweise/ })).toBeVisible()
    await expect(panel(page).locator('[aria-expanded]')).not.toHaveCount(0)
    await expect(panel(page).locator('mark.spelling')).toHaveText(['Tesst', 'Notitz'])
  } finally {
    await app.close()
  }
})

test('a very long paragraph is checked in pieces, and marks it finds in each of them', async () => {
  const filler = 'Dies ist ein ganz gewöhnlicher Satz ohne jeden Fehler im Text. '.repeat(120)
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: `= Design\n\nAm Anfang steht ein Tesst. ${filler}In der Mitte steht ein Fehlerr. ${filler}Am Ende steht ein Tesst.\n`,
  })
  const { app, page } = await open()
  try {
    await openProof(page)
    await expect(spelling(page)).toHaveText(['Tesst', 'Fehlerr', 'Tesst'], { timeout: 60_000 })
    await expect(badge(page).getByText('Wird geprüft …')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('an entry of the list opens with its suggestions, and the text is not selected', async () => {
  const { app, page } = await open()
  try {
    await openProof(page)
    await expect(spelling(page).first()).toBeVisible({ timeout: 40_000 })
    const entry = panel(page).locator('li', { hasText: 'Tesst' }).first()
    await entry.locator('[aria-expanded]').click()
    await expect(entry.locator('.proof-suggestion').first()).toBeVisible()
    await expect(entry.locator('.explain')).not.toBeEmpty()
    // The text shows the place with a background; nothing in it is selected.
    await expect(page.locator('.cm-content .cm-proof-focus')).toHaveText('Tesst')
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
    // A suggestion is applied from the list, and the entry leaves it.
    const word = (await entry.locator('.proof-suggestion').first().textContent())!.trim()
    await entry.locator('.proof-suggestion').first().click()
    await expect(spelling(page)).toHaveCount(0)
    await expect(panel(page).locator('li', { hasText: 'Tesst' })).toHaveCount(0)
    await expect.poll(() => read(SHEET)).toContain(`Das ist ein ${word} mit @smith2020`)
    // Opening an entry again closes it.
    const grammarEntry = panel(page)
      .locator('li')
      .filter({ has: page.locator('mark.grammar') })
    await grammarEntry.locator('[aria-expanded]').click()
    await expect(grammarEntry.locator('.detail')).toBeVisible()
    await grammarEntry.locator('[aria-expanded]').click()
    await expect(grammarEntry.locator('.detail')).toHaveCount(0)
    await expect(page.locator('.cm-content .cm-proof-focus')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the actions of an open entry: dictionary, ignore, and switching the rule off', async () => {
  const { app, page } = await open()
  try {
    await openProof(page)
    await expect(spelling(page).first()).toBeVisible({ timeout: 40_000 })
    const entry = (text: string) => panel(page).locator('li', { hasText: text }).first()
    await entry('Tesst').locator('[aria-expanded]').click()
    await entry('Tesst').getByRole('button', { name: 'Zum Projektwörterbuch' }).click()
    await expect(spelling(page)).toHaveCount(0)
    expect(await read('dictionary.txt')).toBe('Tesst\n')

    await entry('Er gehen').locator('[aria-expanded]').click()
    await entry('Er gehen').getByRole('button', { name: 'Regel ausschalten' }).click()
    await expect(grammar(page)).toHaveCount(0)
    expect(await read('project.toml')).toMatch(/disabled_rules = \[ "[A-Z_0-9]+" \]/)
    // The rule can be switched on again at the foot of the tab.
    await panel(page).getByRole('button', { name: 'Einschalten' }).click()
    await expect(grammar(page).first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await app.close()
  }
})

test('hovering an underline shows a card like an open entry of the tab', async () => {
  const { app, page } = await open()
  try {
    await openProof(page)
    await expect(spelling(page).first()).toBeVisible({ timeout: 40_000 })
    // The grammar issue's card: its kind, the explanation, a suggestion, and the quiet actions.
    await grammar(page).first().hover()
    await expect(tooltip(page)).toBeVisible()
    await expect(tooltip(page).locator('.proof-dot.grammar')).toBeVisible()
    await expect(tooltip(page).locator('.cm-proof-tip-explain')).not.toBeEmpty()
    await expect(tooltip(page).getByRole('button', { name: 'Ignorieren' })).toBeVisible()
    await expect(tooltip(page).getByRole('button', { name: 'Zum Projektwörterbuch' })).toHaveCount(
      0,
    )
    // It is no wider than a card, and an action from it closes it.
    const box = (await tooltip(page).boundingBox())!
    expect(box.width).toBeLessThanOrEqual(342)
    await tooltip(page).getByRole('button', { name: 'Ignorieren' }).click()
    await expect(tooltip(page)).toHaveCount(0)
    await expect(grammar(page)).toHaveCount(0)

    // A suggestion from the spelling issue's card replaces the word.
    await spelling(page).first().hover()
    await expect(tooltip(page)).toBeVisible()
    await expect(tooltip(page).getByRole('button', { name: 'Zum Projektwörterbuch' })).toBeVisible()
    const suggestion = tooltip(page).locator('.proof-suggestion').first()
    const word = (await suggestion.textContent())!
    await suggestion.click()
    await expect(spelling(page)).toHaveCount(0)
    await expect.poll(() => read(SHEET)).toContain(`Das ist ein ${word} mit @smith2020`)
  } finally {
    await app.close()
  }
})

test('text in a footnote is checked, and its suggestions are applied from the list', async () => {
  const { app, page } = await open()
  try {
    await openProof(page)
    const entry = panel(page).locator('li', { hasText: 'Notitz' })
    await expect(entry).toBeVisible({ timeout: 40_000 })
    await expect(entry.getByText('in einer Fußnote')).toBeVisible()
    await entry.locator('[aria-expanded]').click()
    const suggestion = entry.locator('.proof-suggestion').first()
    const word = (await suggestion.textContent())!.trim()
    await suggestion.click()
    await expect.poll(() => read(SHEET)).toContain(`#footnote[Eine ${word} im Fuß.]`)
  } finally {
    await app.close()
  }
})

test('the language, the kinds and the meticulous mode are chosen in the Prüfung tab, not in the project menu', async () => {
  const { app, page } = await open()
  try {
    // The project menu has neither the strictness nor the language any more.
    await page.getByRole('button', { name: 'Projektmenü' }).click()
    await expect(page.getByRole('menuitem', { name: /Strenge Prüfung/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Sprache der Prüfung/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await openProof(page)
    const language = panel(page).getByRole('combobox', { name: 'Sprache' })
    await expect(language).toBeVisible()
    await expect(language.locator('option')).toHaveCount(3) // de-DE, de-AT, de-CH
    await expect(language).toHaveValue('de-DE')
    await language.selectOption('de-CH')
    await expect(language).toHaveValue('de-CH')
    await expect.poll(() => read('project.toml')).toContain('language = "de-CH"')

    // The kinds are checkboxes under "Prüfen auf"; one switched off is kept in the project.
    const kinds = panel(page).getByRole('group', { name: 'Prüfen auf' })
    await expect(kinds.getByRole('checkbox')).toHaveCount(4)
    await expect(kinds.getByRole('checkbox', { name: 'Typografie' })).toBeChecked()
    await kinds.getByRole('checkbox', { name: 'Typografie' }).uncheck()
    await expect.poll(() => read('project.toml')).toContain('typography')

    // The meticulous mode is a switch, off at first, and kept in the project too.
    const picky = panel(page).getByRole('switch', { name: 'Akribischer Modus' })
    await expect(picky).not.toBeChecked()
    await picky.check()
    await expect.poll(() => read('project.toml')).toContain('picky')
    await expect(picky).toBeChecked()
  } finally {
    await app.close()
  }
})
