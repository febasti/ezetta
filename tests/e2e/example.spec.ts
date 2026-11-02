import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, TO_END } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox()
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const SHEET = 'schreiben/grundlagen.typ'
const original = resolve('examples/de/content', SHEET)
const copy = () => join(sandbox.userData, 'examples', 'de', 'content', SHEET)
const hashOf = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

/** Every file of the original example, with its hash: it must be the same at the end of a test. */
async function originalState(): Promise<string> {
  const root = resolve('examples/de')
  const out: string[] = []
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const relative = join(folder, entry.name)
      if (entry.isDirectory()) await walk(relative)
      else out.push(`${relative} ${await hashOf(join(root, relative))}`)
    }
  }
  await walk('')
  return out.sort().join('\n')
}

async function openExample(page: Page) {
  await page.getByRole('button', { name: 'Ansehen' }).click()
  await expect(page.getByRole('button', { name: 'Projektmenü' })).toBeVisible()
}

async function closeProject(page: Page) {
  await page.getByRole('button', { name: 'Projektmenü' }).click()
  await page.getByRole('menuitem', { name: 'Projekt schließen' }).click()
  await expect(page.getByRole('button', { name: 'Ansehen' })).toBeVisible()
}

async function type(page: Page, text: string) {
  await page.locator('[role=treeitem][data-path="schreiben"]').click()
  await page.locator(`[role=option][data-path="${SHEET}"]`).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.locator('.cm-content').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press(TO_END)
  await page.keyboard.type(text)
}

test('the Welcome screen opens a copy of the example project, and what is tried out never reaches the original', async () => {
  const before = await originalState()
  const { app, page } = await launch(sandbox, { project: false })
  try {
    await expect(page.getByRole('heading', { name: 'Das Beispielprojekt ansehen.' })).toBeVisible()
    await openExample(page)
    // The project opens in the folder of the copy, not in the examples folder.
    await expect(page.locator('[role=treeitem][data-path=""]')).toContainText('Alle Abschnitte')
    expect(existsSync(join(sandbox.userData, 'examples', 'de', 'project.toml'))).toBe(true)
    await page.locator('[role=treeitem]', { hasText: 'Titelei' }).first().click()
    await expect(page.getByLabel('Untertitel', { exact: true })).toHaveValue(
      'Ein Rundgang durch Ezetta',
    )

    await type(page, ' Ein Satz, den ich ausprobiere.')
    await expect
      .poll(async () => (existsSync(copy()) ? await readFile(copy(), 'utf8') : ''))
      .toContain('Ein Satz, den ich ausprobiere.')
    expect(await readFile(original, 'utf8')).not.toContain('ausprobiere')
    expect(await originalState()).toBe(before)
  } finally {
    await app.close()
  }
  expect(await originalState()).toBe(before)
})

test('a copy that was changed is asked about: it can be kept, or made again from the original', async () => {
  const before = await originalState()
  const { app, page } = await launch(sandbox, { project: false })
  try {
    await openExample(page)
    await type(page, ' Meine Notiz.')
    await expect.poll(() => readFile(copy(), 'utf8')).toContain('Meine Notiz.')
    await closeProject(page)

    // Opened again: the writer's copy is asked about, and "Weiterarbeiten" keeps it.
    await page.getByRole('button', { name: 'Ansehen' }).click()
    const alert = page.getByRole('alertdialog')
    await expect(alert).toContainText('Du hast das Beispielprojekt verändert')
    await alert.getByRole('button', { name: 'Weiterarbeiten' }).click()
    await expect(page.getByRole('button', { name: 'Projektmenü' })).toBeVisible()
    expect(await readFile(copy(), 'utf8')).toContain('Meine Notiz.')
    await closeProject(page)

    // "Neu beginnen" makes the copy again from the original.
    await page.getByRole('button', { name: 'Ansehen' }).click()
    await alert.getByRole('button', { name: 'Neu beginnen' }).click()
    await expect(page.getByRole('button', { name: 'Projektmenü' })).toBeVisible()
    expect(await readFile(copy(), 'utf8')).not.toContain('Meine Notiz.')
    expect(await hashOf(copy())).toBe(await hashOf(original))
    await closeProject(page)

    // A copy nobody changed is opened at once, without a question.
    await page.getByRole('button', { name: 'Ansehen' }).click()
    await expect(page.getByRole('button', { name: 'Projektmenü' })).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  } finally {
    await app.close()
  }
  expect(await originalState()).toBe(before)
})
