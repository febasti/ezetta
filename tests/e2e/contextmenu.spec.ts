import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { createSandbox, launch, openSheet } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: 'Ein Satz mit Wörtern.\n' })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

/** Starts the app with system menus on, and catches them: a system menu is not part of the page. */
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
  role?: string
  type: string
  checked?: boolean
  enabled: boolean
  sub?: Shown[]
}

/** The items of the last system menu, as the system would list them. */
async function lastMenu(app: ElectronApplication): Promise<Shown[]> {
  return app.evaluate(() => {
    const menus = (globalThis as unknown as { __menus: { items: unknown[] }[] }).__menus
    type Item = {
      label: string
      role?: string
      type: string
      checked?: boolean
      enabled: boolean
      submenu?: { items: Item[] }
    }
    const list = (items: Item[]): Shown[] =>
      items.map((i) => ({
        label: i.label,
        ...(i.role ? { role: i.role } : {}),
        type: i.type,
        ...(i.type === 'checkbox' ? { checked: i.checked } : {}),
        enabled: i.enabled,
        ...(i.submenu ? { sub: list(i.submenu.items) } : {}),
      }))
    interface Shown {
      label: string
    }
    return list((menus.at(-1) as unknown as { items: Item[] }).items) as never
  })
}

/** Chooses an item of the last system menu, by the labels along its way, and closes the menu. */
async function choose(app: ElectronApplication, ...path: string[]): Promise<void> {
  await app.evaluate((_, labels) => {
    const menus = (globalThis as unknown as { __menus: unknown[] }).__menus
    type Menu = { items: Item[]; __close?: () => void }
    type Item = { label: string; click: () => void; submenu?: Menu }
    const menu = menus.at(-1) as Menu
    let items = menu.items
    let item: Item | undefined
    for (const label of labels) {
      item = items.find((i) => i.label === label)
      if (!item) throw new Error(`no item ${label}`)
      items = item.submenu?.items ?? []
    }
    item!.click()
    menu.__close?.()
  }, path)
}

const labels = (items: Shown[]): string[] =>
  items.filter((i) => i.type !== 'separator').map((i) => i.label)

test('a right click in the text opens the system menu with editing, format, and insert', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click({ button: 'right', position: { x: 40, y: 12 } })
    await expect.poll(async () => (await lastMenu(app).catch(() => [])).length).toBeGreaterThan(5)
    const items = await lastMenu(app)
    // The synonyms of the word under the click come first (they are the thesaurus's own test).
    expect(labels(items).filter((l) => !/Synonyme/.test(l))).toEqual([
      'Rückgängig',
      'Wiederholen',
      'Ausschneiden',
      'Kopieren',
      'Einfügen',
      'Alles auswählen',
      expect.stringMatching(/Betont/),
      expect.stringMatching(/Wichtig/),
      expect.stringMatching(/Hyperlink/),
      'Absatz',
      'Einfügen',
      'Quelltext',
    ])
    // The clipboard items are the system's own.
    const byLabel = (l: string) => items.find((i) => i.label === l && i.role)
    expect(byLabel('Ausschneiden')).toMatchObject({ role: 'cut', enabled: false })
    expect(byLabel('Kopieren')).toMatchObject({ role: 'copy', enabled: false })
    expect(byLabel('Einfügen')).toMatchObject({ role: 'paste', enabled: true })
    expect(byLabel('Alles auswählen')).toMatchObject({ role: 'selectall' })
    const insert = items.find((i) => i.label === 'Einfügen' && i.sub)!
    expect(labels(insert.sub!)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Fußnote/), expect.stringMatching(/Beleg/)]),
    )
  } finally {
    await app.close()
  }
})

test('an item chosen in the system menu does its work, and Cut and Copy follow the selection', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click({ position: { x: 40, y: 12 } })
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    // The selection popover is above the text: click on the line itself.
    await page.locator('.cm-content').click({ button: 'right', position: { x: 60, y: 46 } })
    // The click moved nothing: the word is still selected, so Cut and Copy are on.
    await expect
      .poll(async () => (await lastMenu(app)).find((i) => i.role === 'copy')?.enabled)
      .toBe(true)
    const betont = (await lastMenu(app)).find((i) => /Betont/.test(i.label))!
    await choose(app, betont.label)
    await expect.poll(read).toMatch(/(_|#emph\[)Ein Satz mit Wörtern/)
    await expect.poll(async () => (await lastMenu(app)).length).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

test('the system menu of a sheet row has its status, goal and export items', async () => {
  const { app, page } = await open()
  try {
    await page.locator('[role=option][data-path="methoden/design.typ"]').click({ button: 'right' })
    await expect.poll(async () => (await lastMenu(app).catch(() => [])).length).toBeGreaterThan(3)
    const items = labels(await lastMenu(app))
    expect(items).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Entwurf/),
        expect.stringMatching(/Final/),
        expect.stringMatching(/Papierkorb|Löschen/),
      ]),
    )
    // No rename for a sheet.
    expect(items.some((l) => /Umbenennen/.test(l))).toBe(false)
  } finally {
    await app.close()
  }
})

test('without system menus the app draws its own, with the submenus listed in it', async () => {
  const { app, page } = await launch(sandbox) // the tests' default: the app's own menus
  try {
    await openSheet(page, 'methoden/design.typ')
    await page.locator('.cm-content').click({ button: 'right', position: { x: 40, y: 12 } })
    await expect(page.getByRole('menuitem', { name: 'Einfügen › Fußnote einfügen' })).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await app.close()
  }
})
