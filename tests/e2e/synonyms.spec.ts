import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { createSandbox, launch, openSheet } from './helpers'
import type { Sandbox } from './helpers'

// These tests start the real helper (Java and LanguageTool in `.dev/languagetool`) and read the
// thesaurus files in `.dev/thesaurus`.
test.skip(
  !existsSync(resolve('.dev/languagetool')) ||
    !existsSync(resolve('.dev/thesaurus/th_de_DE_v2.dat')),
  'LanguageTool or the thesaurus is not installed',
)
test.describe.configure({ timeout: 120_000 })

const SHEET = 'content/methoden/design.typ'
let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    [SHEET]: 'Die Ergebnisse zeigten, dass er es begründete.\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function open() {
  const { app, page } = await launch(sandbox, { env: { EZETTA_HTML_MENUS: '0' } })
  await app.evaluate(({ Menu }) => {
    const seen: unknown[] = []
    ;(globalThis as unknown as { __menus: unknown[] }).__menus = seen
    Menu.prototype.popup = function (options?: { callback?: () => void }) {
      ;(this as unknown as { __close: () => void }).__close = () => options?.callback?.()
      seen.push(this)
    }
  })
  await openSheet(page, 'methoden/design.typ')
  return { app, page }
}

interface Shown {
  label: string
  sub?: string[]
}

/** The items of the last system menu, with the labels of a submenu. */
async function lastMenu(app: ElectronApplication): Promise<Shown[]> {
  return app.evaluate(() => {
    type Item = { label: string; type: string; submenu?: { items: Item[] } }
    const menus = (globalThis as unknown as { __menus: { items: Item[] }[] }).__menus
    return (menus.at(-1)?.items ?? [])
      .filter((i) => i.type !== 'separator')
      .map((i) => ({
        label: i.label,
        ...(i.submenu
          ? { sub: i.submenu.items.filter((s) => s.type !== 'separator').map((s) => s.label) }
          : {}),
      }))
  })
}

async function choose(app: ElectronApplication, ...path: string[]): Promise<void> {
  await app.evaluate((_, labels) => {
    type Menu = { items: Item[]; __close?: () => void }
    type Item = { label: string; click: () => void; submenu?: Menu }
    const menus = (globalThis as unknown as { __menus: unknown[] }).__menus
    const menu = menus.at(-1) as Menu
    let items = menu.items
    let item: Item | undefined
    for (const label of labels) {
      item = items.find((i) => i.label === label || i.label.startsWith(label))
      if (!item) throw new Error(`no item ${label}`)
      items = item.submenu?.items ?? []
    }
    item!.click()
    menu.__close?.()
  }, path)
}

/** The middle of a word on the page, found through the browser's own text ranges. */
async function centerOf(page: Page, word: string): Promise<{ x: number; y: number }> {
  return page.evaluate((needle) => {
    const walker = document.createTreeWalker(
      document.querySelector('.cm-content')!,
      NodeFilter.SHOW_TEXT,
    )
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node.textContent ?? '').indexOf(needle)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    throw new Error(`no word ${needle}`)
  }, word)
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Synonyme' })
/** The synonyms the dialog offers, as their words (a hint such as the article stays out). */
const offered = (page: Page) =>
  dialog(page)
    .locator('.sense button .word')
    .allTextContents()
    .then((words) => words.map((w) => w.trim()))

/** Right-clicks the word and opens the synonyms: the menu has the entry at once, without waiting. */
async function synonymsOf(page: Page, app: ElectronApplication, word: string): Promise<string[]> {
  const { x, y } = await centerOf(page, word)
  const started = Date.now()
  await page.mouse.click(x, y, { button: 'right' })
  await expect
    .poll(async () => (await lastMenu(app)).some((i) => i.label === 'Synonyme …'))
    .toBe(true)
  // The menu does not wait for the helper: it opens at once, even the first time.
  expect(Date.now() - started).toBeLessThan(1500)
  await choose(app, 'Synonyme …')
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('searchbox', { name: 'Wort nachschlagen' })).toHaveValue(word)
  // The first lookup starts the helper: that takes a few seconds.
  await expect(dialog(page).locator('.sense button').first()).toBeVisible({ timeout: 60_000 })
  return offered(page)
}

test('a right click on an inflected word offers synonyms in the form the sentence needs', async () => {
  const { app, page } = await open()
  try {
    const words = await synonymsOf(page, app, 'Ergebnisse')
    // The word is a plural noun: so are all the synonyms, and none is the word itself.
    expect(words.length).toBeGreaterThan(2)
    for (const word of words) expect(word).toMatch(/^[A-ZÄÖÜ]/)
    expect(words).not.toContain('Ergebnisse')
    expect(words.join(' ')).toMatch(/Resultate|Erfolge|Ausgänge/)
    // No singular base form among them: "Ergebnis" would be the wrong inflection.
    expect(words).not.toContain('Resultat')
  } finally {
    await app.close()
  }
})

test('choosing a synonym puts it in place of the word, and the rest of the sentence stays', async () => {
  const { app, page } = await open()
  try {
    const words = await synonymsOf(page, app, 'Ergebnisse')
    await dialog(page).locator('.sense button').first().click()
    await expect(dialog(page)).toHaveCount(0)
    await expect.poll(read).toContain(`Die ${words[0]} zeigten, dass er es begründete.`)
  } finally {
    await app.close()
  }
})

test('a verb is offered in the tense of the word', async () => {
  const { app, page } = await open()
  try {
    const words = await synonymsOf(page, app, 'begründete')
    // Past tense, third person: "rechtfertigte", not "rechtfertigen".
    expect(words.some((w) => /te$/.test(w))).toBe(true)
    expect(words.some((w) => /^(rechtfertigte|erklärte|belegte|legitimierte)/.test(w))).toBe(true)
    expect(words).not.toContain('rechtfertigen')
  } finally {
    await app.close()
  }
})

test('the search looks up another word in the same place, and its synonyms replace the word', async () => {
  const { app, page } = await open()
  try {
    await synonymsOf(page, app, 'Ergebnisse')
    const search = dialog(page).getByRole('searchbox', { name: 'Wort nachschlagen' })
    await search.fill('Resultate')
    await search.press('Enter')
    // The synonyms of "Resultate", plural as the sentence needs them there.
    await expect.poll(() => offered(page)).toContain('Ergebnisse')
    for (const word of await offered(page)) expect(word).toMatch(/^[A-ZÄÖÜ]/)
    // A word the thesaurus does not know says so.
    await search.fill('Xyzzyquatsch')
    await search.press('Enter')
    await expect(dialog(page)).toContainText('Keine Synonyme für „Xyzzyquatsch“')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    expect(await read()).toContain('Die Ergebnisse zeigten')
  } finally {
    await app.close()
  }
})
