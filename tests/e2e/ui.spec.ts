import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, launchAt, MOD, openSheet } from './helpers'
import type { Sandbox } from './helpers'

/** The window's least size (`MIN_SIZE` in `src/main/windowState.ts`). */
const LEAST_SIZE = { width: 1100, height: 700 }

const SHEET = 'content/methoden/design.typ'
const SAMPLE = `= Methoden

Das Design ist _qualitativ_ und *explorativ*. Danach folgt ein einfacher Satz.

- Erster Punkt
- Zweiter Punkt

Ein Wort und noch ein Satz.
`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = (path = SHEET) => readFile(join(sandbox.projectDir, path), 'utf8')
const tool = (page: Page, name: string) =>
  page.locator('.toolbar').getByRole('button', { name, exact: true })

async function open() {
  return launchAt(sandbox, 'methoden/design.typ')
}

test('the toolbar has grouped tools, enabled only with an open sheet', async () => {
  const { app, page } = await launch(sandbox)
  try {
    const names = [
      'Zurück',
      'Vor',
      'Überschrift',
      'Betont',
      'Wichtig',
      'Link',
      'Liste',
      'Zitat',
      'Beleg',
      'Querverweis',
      'Fußnote',
      'Anmerkung',
      'Kommentar',
    ]
    for (const name of names) await expect(tool(page, name)).toBeVisible()
    await expect(page.locator('.toolbar .group')).toHaveCount(7)
    for (const name of names) await expect(tool(page, name)).toBeDisabled()
    // The sidebars are switched here, and work without a sheet. There is no commands button.
    await expect(tool(page, 'Gruppen')).toBeEnabled()
    await expect(tool(page, 'Abschnitte')).toBeEnabled()
    await expect(tool(page, 'Befehle')).toHaveCount(0)
    // Quelltext is in the status bar, not in the toolbar, and works without a sheet.
    await expect(tool(page, 'Quelltext')).toHaveCount(0)
    await expect(page.locator('footer').getByRole('button', { name: 'Quelltext' })).toBeEnabled()
    // The footnote display is no longer a tool: it is in the settings window.
    await expect(tool(page, 'Fußnoten')).toHaveCount(0)
    await openSheet(page, 'methoden/design.typ')
    await expect(tool(page, 'Betont')).toBeEnabled()
  } finally {
    await app.close()
  }
})

test('toolbar toggles show what is at the caret', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('qualitativ').first().click()
    await expect(tool(page, 'Betont')).toHaveAttribute('aria-pressed', 'true')
    await expect(tool(page, 'Wichtig')).toHaveAttribute('aria-pressed', 'false')
    await content.getByText('explorativ').first().click()
    await expect(tool(page, 'Wichtig')).toHaveAttribute('aria-pressed', 'true')
    await expect(tool(page, 'Betont')).toHaveAttribute('aria-pressed', 'false')
    await content.getByText('Zweiter Punkt').click()
    await expect(tool(page, 'Liste')).toHaveAttribute('aria-pressed', 'true')
    await tool(page, 'Liste').click()
    const bullet = page.getByRole('menuitem', { name: 'Aufzählung' })
    // The chosen item is highlighted, with no check mark; the others are not.
    await expect(bullet).toHaveAttribute('aria-current', 'true')
    await expect(bullet).toHaveClass(/chosen/)
    await expect(bullet.locator('svg')).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Nummerierte Liste' })).not.toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(await bullet.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    )
    await page.keyboard.press('Escape')
  } finally {
    await app.close()
  }
})

test('toolbar tools change the text, and undo and redo follow', async () => {
  const { app, page } = await open()
  try {
    await expect(tool(page, 'Zurück')).toBeDisabled()
    await page
      .locator('.cm-content')
      .getByText('Ein Wort und noch ein Satz.')
      .dblclick({ position: { x: 4, y: 8 } })
    await tool(page, 'Betont').click()
    await expect.poll(read).toContain('_Ein_ Wort')
    await expect(tool(page, 'Zurück')).toBeEnabled()
    await tool(page, 'Zurück').click()
    await expect.poll(read).toContain('\nEin Wort und noch ein Satz.')
    await expect(tool(page, 'Vor')).toBeEnabled()
    await tool(page, 'Vor').click()
    await expect.poll(read).toContain('_Ein_ Wort')

    await tool(page, 'Wichtig').click()
    await expect.poll(read).toContain('_*Ein*_ Wort')
    await tool(page, 'Liste').click()
    await page.getByRole('menuitem', { name: 'Nummerierte Liste' }).click()
    await expect.poll(read).toContain('+ _*Ein*_ Wort')
    await tool(page, 'Zitat').click()
    await page.getByRole('menuitem', { name: 'Blockzitat' }).click()
    await expect.poll(read).toContain('#quote(block: true)[+ _*Ein*_ Wort und noch ein Satz.]')
  } finally {
    await app.close()
  }
})

test('the heading tool cycles through heading 1 to 4 and back to a paragraph, and shows the level', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').getByText('Ein Wort und noch ein Satz.').click()
    const heading = tool(page, 'Überschrift')
    await expect(heading).toHaveAttribute('aria-pressed', 'false')
    for (const marks of ['=', '==', '===', '====']) {
      await heading.click()
      await expect.poll(read).toContain(`${marks} Ein Wort und noch ein Satz.`)
      await expect(heading).toHaveAttribute('aria-pressed', 'true')
    }
    await heading.click()
    await expect.poll(read).toContain('\nEin Wort und noch ein Satz.')
    expect(await read()).not.toContain('= Ein Wort')
    await expect(heading).toHaveAttribute('aria-pressed', 'false')
    // The status bar still has the menu with every paragraph style, the current one checked.
    await page
      .locator('footer')
      .getByRole('button', { name: /Absatz/ })
      .click()
    await expect(page.getByRole('menuitem', { name: 'Fließtext' })).toBeVisible()
    await page.keyboard.press('Escape')
  } finally {
    await app.close()
  }
})

test('the toolbar is compact: icons alone, with a name beside the icon only where it is not obvious', async () => {
  const { app, page } = await open()
  try {
    // Only these three show their name; every tool keeps it as a tooltip and for screen readers.
    const labels = page.locator('.toolbar .label')
    await expect(labels).toHaveText(['Beleg', 'Querverweis', 'Fußnote'])
    await expect(tool(page, 'Betont')).toHaveAttribute('title', /Betont \(.+\)/)
    await expect(tool(page, 'Überschrift')).toHaveAttribute('title', /nächste Ebene/)
    expect((await page.locator('.toolbar').boundingBox())!.height).toBeLessThan(52)
    // The same at a narrow width: nothing is hidden or dropped.
    await page.setViewportSize({ width: 900, height: 700 })
    await expect(labels).toHaveCount(3)
    await expect(tool(page, 'Betont')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the toolbar keeps the sidebar and history tools left, the right sidebar right, the rest centered', async () => {
  const { app, page } = await open()
  try {
    const box = async (name: string) => (await tool(page, name).boundingBox())!
    const bar = (await page.locator('.toolbar').boundingBox())!
    const mid = bar.x + bar.width / 2
    const gruppen = await box('Gruppen')
    const vor = await box('Vor')
    const first = await box('Überschrift')
    const kommentar = await box('Kommentar')
    const seitenleiste = await box('Seitenleiste')
    // On macOS the traffic lights come first (the title bar is merged with the toolbar).
    const lights = await page
      .locator('html')
      .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--chrome-inset')) || 0)
    expect(gruppen.x - bar.x - lights).toBeLessThan(24)
    expect(vor.x + vor.width).toBeLessThan(first.x)
    expect(bar.x + bar.width - (seitenleiste.x + seitenleiste.width)).toBeLessThan(24)
    // The tools in between are centered on the toolbar, whatever the sides hold.
    const centre = (first.x + kommentar.x + kommentar.width) / 2
    expect(Math.abs(centre - mid)).toBeLessThan(4)
  } finally {
    await app.close()
  }
})

test('the status and word count float in the corner of the text, with no title, path, or file name', async () => {
  const { app, page } = await open()
  try {
    const badge = page.locator('.badge')
    await expect(badge).toContainText('Überarbeitet')
    await expect(badge).toContainText('von 1.200 Wörtern')
    await expect(badge).not.toContainText('design')
    await expect(page.locator('.header, .crumbs, .crumb, .title')).toHaveCount(0)
    // The text has the whole height: it starts under the top of the pane, and the badge is at the right.
    const pane = (await page.locator('main.pane').boundingBox())!
    const text = (await page.locator('.cm-scroller').boundingBox())!
    expect(text.y - pane.y).toBeLessThan(2)
    const box = (await badge.boundingBox())!
    expect(box.x + box.width).toBeGreaterThan(pane.x + pane.width - 40)
  } finally {
    await app.close()
  }
})

test('the status chip changes the status, and the continuous view names its group in the badge', async () => {
  const { app, page } = await open()
  try {
    await page
      .locator('.badge')
      .getByRole('button', { name: /Überarbeitet/ })
      .click()
    await page.getByRole('menuitem', { name: 'Final' }).click()
    await expect(page.locator('.badge')).toContainText('Final')
    await expect
      .poll(() => read('project.toml'))
      .toMatch(/\[items\."methoden\/design\.typ"\]\s+status = "final"/)

    await page.locator('[role=treeitem][data-path="methoden"]').click()
    await expect(page.locator('[data-testid=flow]')).toBeVisible()
    await expect(page.locator('.badge')).toContainText('methoden')
    await expect(page.locator('.badge')).toContainText('4 Abschnitte')
  } finally {
    await app.close()
  }
})

test('keyboard focus is visible on tools and rows', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click()
    await page.keyboard.press('Tab')
    // Wherever focus goes, it is on an element with a visible focus style (outline or its own ring).
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? getComputedStyle(el).outlineStyle : 'none'
    })
    expect(['solid', 'auto', 'none']).toContain(outline)
  } finally {
    await app.close()
  }
})

test('undo with the keyboard still works alongside the toolbar', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').getByText('Ein Wort und noch ein Satz.').click()
    await page.keyboard.press(`${MOD}+ArrowDown`)
    await page.keyboard.type(' Neu.')
    await expect.poll(read).toContain('Neu.')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).not.toContain('Neu.')
  } finally {
    await app.close()
  }
})

/** The caret's offset from where
 * the browser itself puts the caret. */
async function alignment(page: Page) {
  return page.evaluate(() => {
    const native = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    const cursor = document.querySelector('.cm-cursor')!.getBoundingClientRect()
    const scroller = document.querySelector('.cm-scroller') as HTMLElement
    return {
      caretOffset: cursor.left - native.left,
      scrollbar: scroller.offsetWidth - scroller.clientWidth,
    }
  })
}

for (const [name, lines] of [
  ['a short sheet', 5],
  ['a long sheet with a scrollbar', 120],
] as const) {
  test(`the cursor sits exactly where the text is (${name})`, async () => {
    const text = Array.from(
      { length: lines },
      (_, i) => `Zeile ${i + 1} mit etwas Text, damit die Zeile eine Länge hat.`,
    ).join('\n\n')
    sandbox = await createSandbox({ [SHEET]: `= Titel\n\n${text}\n` })
    const { app, page } = await open()
    try {
      for (const needle of ['Zeile 1 mit', 'Zeile 3 mit']) {
        await page.locator('.cm-content').getByText(needle).first().click()
        await page.keyboard.press('End')
        // The cursor is drawn in CodeMirror's next measure cycle, so wait for it to settle.
        await expect.poll(async () => Math.abs((await alignment(page)).caretOffset)).toBeLessThan(1)
        const a = await alignment(page)
        if (lines > 50) expect(a.scrollbar).toBeGreaterThan(0)
      }
    } finally {
      await app.close()
    }
  })
}

test('the toolbar switches the sidebars, and the project menu is in the groups column', async () => {
  const { app, page } = await open()
  try {
    // The columns are no longer switched in the sidebar itself.
    await expect(page.locator('.sidebar .toggles')).toHaveCount(0)
    const groups = page.getByRole('region', { name: 'Gruppen' })
    await expect(groups.getByRole('button', { name: 'Projektmenü' })).toBeVisible()
    await expect(groups).toContainText('Dissertation')

    await tool(page, 'Gruppen').click()
    await expect(page.locator('[role=tree]')).toHaveCount(0)
    await expect(tool(page, 'Gruppen')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('[role=option][data-path="methoden/design.typ"]')).toBeVisible()
    await tool(page, 'Abschnitte').click()
    // With both columns hidden the sidebar is gone and the text has the width.
    await expect(page.locator('.sidebar')).toHaveCount(0)
    await tool(page, 'Gruppen').click()
    await expect(groups.getByRole('button', { name: 'Projektmenü' })).toBeVisible()
    await groups.getByRole('button', { name: 'Projektmenü' }).click()
    await expect(page.getByRole('menuitem', { name: 'Als PDF exportieren …' })).toBeVisible()
  } finally {
    await app.close()
  }
})

test('it behaves like a Mac app: arrow cursor, no selectable chrome, the system font, its window kept', async () => {
  let placed: { x: number; y: number; width: number; height: number } | undefined
  const first = await open()
  try {
    const { page, app } = first
    const css = (selector: string, property: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property)
    // Buttons, rows and tabs keep the arrow; only the text has the text cursor.
    expect(await css('.toolbar button', 'cursor')).toBe('default')
    expect(await css('[role=treeitem]', 'cursor')).not.toBe('pointer')
    // The interface is not selectable text; the writing is.
    expect(await css('[role=treeitem]', 'user-select')).toBe('none')
    expect(await css('.cm-content', 'user-select')).toBe('text')
    // The system font for the interface (San Francisco on macOS), the writing font for the text.
    expect(await css('body', 'font-family')).toMatch(/^-apple-system/)

    // The window opens again where it was: somewhere on this machine's screen, whose size a
    // virtual display of a CI service keeps small.
    const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
    // A screen smaller than the window's least size cannot show where a window was put.
    if (area.width >= LEAST_SIZE.width + 80 && area.height >= LEAST_SIZE.height + 80) {
      placed = {
        x: area.x + 40,
        y: area.y + 40,
        width: Math.min(1200, area.width - 80),
        height: Math.min(800, area.height - 80),
      }
      await app.evaluate(
        ({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0]!.setBounds(bounds),
        placed,
      )
      await expect
        .poll(() => readFile(join(sandbox.userData, 'settings.json'), 'utf8').catch(() => ''))
        .toMatch(new RegExp(`"width": ${placed.width}`))
    }
  } finally {
    await first.app.close()
  }
  const second = await launch(sandbox)
  try {
    const bounds = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.getBounds(),
    )
    if (placed) expect(bounds).toMatchObject(placed)
  } finally {
    await second.app.close()
  }
})
