import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launchAt, MOD } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const SAMPLE = `= Haus

Das Haus steht am Hang. Ein Hausbau dauert, das haus ist alt.

Noch ein Haus, #footnote[Eine Fußnote zum Haus.] und Schluss.
`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = () => readFile(join(sandbox.projectDir, SHEET), 'utf8')
const bar = (page: Page) => page.getByRole('search')
const find = (page: Page) => bar(page).getByRole('textbox', { name: 'Suchen', exact: true })
const replaceField = (page: Page) => bar(page).getByRole('textbox', { name: 'Ersetzen durch' })

async function open() {
  return launchAt(sandbox, 'methoden/design.typ')
}

test('finds matches, counts them, and steps through them with Enter and Shift+Enter', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+f`)
    await expect(find(page)).toBeFocused()
    await find(page).fill('Haus')
    // Case is ignored: the heading, Haus, Hausbau, haus, Haus, and the one in the note.
    await expect(bar(page)).toContainText('/ 6')
    // One match is inside the footnote, which is drawn as a marker, so only five show in the text.
    await expect(page.locator('.cm-search-match')).toHaveCount(5)
    await expect(page.locator('.cm-search-current')).toHaveCount(1)
    // Stepping on reaches the match in the note: the note shows its source.
    for (let step = 0; step < 6 && (await page.locator('.cm-footnote-marker').count()) > 0; step++)
      await find(page).press('Enter')
    await expect(page.locator('.cm-footnote-marker')).toHaveCount(0)
    await expect(page.locator('.cm-search-current')).toHaveText('Haus')
    await expect(page.locator('.cm-content')).toContainText('#footnote[Eine Fußnote zum Haus.]')
    await find(page).press('Enter')
    await expect(page.locator('.cm-footnote-marker')).toHaveCount(1)

    await find(page).press('Enter')
    const before = await bar(page).locator('.status').textContent()
    await find(page).press('Enter')
    expect(await bar(page).locator('.status').textContent()).not.toBe(before)
    await find(page).press('Shift+Enter')
    expect(await bar(page).locator('.status').textContent()).toBe(before)

    await bar(page).getByRole('button', { name: 'Groß-/Kleinschreibung beachten' }).click()
    await expect(bar(page)).toContainText('/ 5')
    await bar(page).getByRole('button', { name: 'Nur ganze Wörter' }).click()
    await expect(bar(page)).toContainText('/ 4')
    await find(page).fill('zzz')
    await expect(bar(page)).toContainText('Keine Treffer')
  } finally {
    await app.close()
  }
})

test('Escape closes the bar and leaves the current match selected in the text', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+f`)
    await find(page).fill('Hang')
    await find(page).press('Enter')
    await find(page).press('Escape')
    await expect(bar(page)).toHaveCount(0)
    await expect(page.locator('.cm-search-match')).toHaveCount(0)
    await page.keyboard.type('Berg')
    await expect.poll(read).toContain('am Berg.')
  } finally {
    await app.close()
  }
})

test('replaces one match, or all of them in one undo step', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+Shift+r`)
    await expect(replaceField(page)).toBeVisible()
    await find(page).fill('Haus')
    await bar(page).getByRole('button', { name: 'Groß-/Kleinschreibung beachten' }).click()
    await bar(page).getByRole('button', { name: 'Nur ganze Wörter' }).click()
    await replaceField(page).fill('Heim')

    await bar(page).getByRole('button', { name: 'Ersetzen', exact: true }).click()
    await expect.poll(read).toContain('= Heim')
    await expect(bar(page)).toContainText('/ 3')

    await bar(page).getByRole('button', { name: 'Alle ersetzen' }).click()
    await expect
      .poll(read)
      .toBe(
        '= Heim\n\nDas Heim steht am Hang. Ein Hausbau dauert, das haus ist alt.\n\nNoch ein Heim, #footnote[Eine Fußnote zum Heim.] und Schluss.\n',
      )
    await expect(page.getByText('Ersetzt: 3')).toBeVisible()

    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toContain('= Heim\n\nDas Haus steht')
    expect(await read()).toContain('Noch ein Haus, #footnote[Eine Fußnote zum Haus.]')
  } finally {
    await app.close()
  }
})

test('regular expressions can use groups in the replacement, and a broken one is reported', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').click()
    await page.keyboard.press(`${MOD}+Shift+r`)
    await bar(page).getByRole('button', { name: 'Regulärer Ausdruck' }).click()
    await find(page).fill('(\\w+) (steht) (am) (\\w+)')
    await replaceField(page).fill('$4: $1 $2')
    await bar(page).getByRole('button', { name: 'Ersetzen', exact: true }).click()
    await expect.poll(read).toContain('Hang: Haus steht')
    await find(page).fill('(')
    await expect(bar(page)).toContainText('Ungültiger Ausdruck')
  } finally {
    await app.close()
  }
})
