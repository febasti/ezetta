import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, openSheet, pastMenuGuard, TO_END } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const SAMPLE = '= Methoden\n\nDas Design ist qualitativ.\n'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')

async function open(): Promise<{ app: Awaited<ReturnType<typeof launch>>['app']; page: Page }> {
  const { app, page } = await launch(sandbox)
  await openSheet(page, 'methoden/design.typ')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.locator('.cm-content').focus()
  await page.keyboard.press(TO_END)
  return { app, page }
}

test('/ at the start of a line offers the kinds of paragraph and what can be inserted', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    const menu = page.locator('.cm-tooltip-autocomplete')
    await expect(menu).toBeVisible()
    // Two groups, each option with its icon.
    await expect(menu.locator('completion-section')).toHaveText(['Absatz', 'Einfügen'])
    await expect(menu.getByRole('option', { name: 'Überschrift 2' })).toBeVisible()
    await expect(menu.getByRole('option', { name: 'Trenner' })).toBeVisible()
    await expect(menu.getByRole('option', { name: 'Fußnote' })).toBeVisible()
    await expect(menu.locator('svg.cm-completionKind').first()).toBeVisible()

    // Typing narrows it, by another word for the thing too: "h2" finds the heading of level 2.
    await page.keyboard.type('h2')
    await expect(menu.getByRole('option')).toHaveCount(1)
    await expect(menu.getByRole('option')).toHaveText(/Überschrift 2/)
    await pastMenuGuard(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Vorgehen')
    // The slash and what was typed after it are gone; the line is a heading.
    await expect.poll(read).toContain('\n\n== Vorgehen')
    expect(await read()).not.toContain('/')
    await expect(page.locator('.cm-heading-2')).toContainText('Vorgehen')
  } finally {
    await app.close()
  }
})

test('a divider is inserted from the slash menu, drawn, chosen with a click and removed', async () => {
  const { app, page } = await open()
  try {
    // On the empty last line, what is typed starts a paragraph of its own.
    await page.keyboard.type('/trenn')
    const menu = page.locator('.cm-tooltip-autocomplete')
    await expect(menu.getByRole('option')).toHaveCount(1)
    await pastMenuGuard(page)
    await page.keyboard.press('Enter')
    await expect.poll(read).toBe(`${SAMPLE}\n#divider()`)
    const divider = page.locator('.cm-divider')
    await expect(divider).toBeVisible()
    await expect(divider).toHaveAttribute('role', 'separator')
    await expect(page.locator('.cm-content')).not.toContainText('#divider')

    // The caret is after it: Enter starts the next paragraph.
    await page.keyboard.press('Enter')
    await page.keyboard.type('Weiter.')
    await expect.poll(read).toBe(`${SAMPLE}\n#divider()\n\nWeiter.`)

    // A click chooses it, and Backspace takes it away.
    await divider.click()
    await expect(divider).toHaveClass(/selected/)
    await page.keyboard.press('Backspace')
    await expect(page.locator('.cm-divider')).toHaveCount(0)
    await expect.poll(read).not.toContain('#divider()')
  } finally {
    await app.close()
  }
})

test('a slash inside a line is text, and so is one followed by what no item is called', async () => {
  const { app, page } = await open()
  try {
    const menu = page.locator('.cm-tooltip-autocomplete')
    await page.keyboard.type('Und/oder')
    await expect(menu).toBeHidden()
    await page.keyboard.press('Enter')
    await page.keyboard.type('/usr')
    await expect(menu).toBeHidden()
    await page.keyboard.press('Enter')
    await expect.poll(read).toContain('\n\nUnd/oder\n\n/usr')
  } finally {
    await app.close()
  }
})
