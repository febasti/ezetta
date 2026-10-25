import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, MOD } from './helpers'
import type { Sandbox } from './helpers'

const BIB = `
@article{smith2020, author = {Smith, John}, title = {Eine Studie}, year = {2020}}
@book{jones2019, author = {Jones, Mary and M{\\"u}ller, J{\\"o}rg}, title = {Ein Buch}, year = {2019}}
@book{adler2021, author = {Adler, Anna}, title = {Zuerst}, year = {2021}}
@book{many2018, author = {A, B and C, D and E, F}, title = {Viele}, year = {2018}}
`

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({
    'library.bib': BIB,
    'content/einleitung/einleitung.typ':
      '= Einleitung\n\nErst @smith2020 und @jones2019[S. 4]. Dann wieder @smith2020.\n',
    'content/methoden/design.typ':
      '= Design\n\nHier @smith2020 @many2018 und @unbekannt.\n\n#figure(image("assets/a.png"), caption: [Aus @adler2021]) <fig-a>\n\nNoch eine Note.#footnote[Siehe @jones2019.]\n',
    'content/methoden/auswertung.typ':
      'Die Zahl stimmt/*#cite-needed*/. Und @jones2019/*#check: prüfen*/ dort.\n',
    'content/notizen/ideen.typ': 'Nur Notiz @adler2021 und @adler2021.\n',
  })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const toggle = (page: Page) =>
  page.locator('.toolbar').getByRole('button', { name: 'Seitenleiste', exact: true })
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Seitenleiste' })
const scope = (page: Page, name: string) =>
  sidebar(page).getByRole('radiogroup', { name: 'Bereich' }).getByRole('radio', { name })
/** The cited works, each a full reference with its count. */
const works = (page: Page) => sidebar(page).locator('.works .work')

async function open(path = 'einleitung/einleitung.typ') {
  const { app, page } = await launch(sandbox)
  const group = path.slice(0, path.lastIndexOf('/'))
  await page.locator(`[role=treeitem][data-path="${group}"]`).click()
  await page.locator(`[role=option][data-path="${path}"]`).click()
  await expect(page.locator('.cm-content')).toBeVisible()
  return { app, page }
}

test('is hidden until asked for, and lists the works of the open sheet with counts, alphabetically', async () => {
  const { app, page } = await open()
  try {
    await expect(sidebar(page)).toHaveCount(0)
    await toggle(page).click()
    await expect(sidebar(page)).toBeVisible()
    await expect(scope(page, 'Abschnitt')).toBeChecked()
    await expect(sidebar(page)).toContainText('Werke: 2 · Zitate: 3')
    // Alphabetical by author, each a full reference; the count is the number of citations.
    await expect(works(page)).toHaveText([
      /Jones, M\., & Müller, J\. \(2019\)\. Ein Buch\.\s*1×/,
      /Smith, J\. \(2020\)\. Eine Studie\.\s*2×/,
    ])
    await expect(works(page).last().locator('.count')).toHaveAttribute('title', '2-mal zitiert')
    // A book's title is in italics.
    await expect(works(page).first().locator('em')).toHaveText('Ein Buch')
    // In the sheet's own list every work is cited here: no dot.
    await expect(sidebar(page).locator('.dot.here')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('shows the group or the whole project, leaves out sheets that are not exported, and counts notes and captions', async () => {
  const { app, page } = await open()
  try {
    await toggle(page).click()
    await scope(page, 'Projekt').check()
    // notizen is not exported: its two citations of adler2021 do not count, only the one in the caption.
    await expect(works(page)).toHaveText([
      /A, B\., C, D\., & E, F\. \(2018\)\. Viele\.\s*1×/,
      /Adler, A\. \(2021\)\. Zuerst\.\s*1×/,
      /Jones, M\., & Müller, J\. \(2019\)\. Ein Buch\.\s*3×/,
      /Smith, J\. \(2020\)\. Eine Studie\.\s*3×/,
      /unbekannt.*1×/,
    ])
    await expect(sidebar(page)).toContainText('Werke: 5 · Zitate: 9')
    // The work that is not in the bibliography is marked, and comes last.
    await expect(works(page).last().locator('.reference')).toHaveClass(/missing/)
    await expect(works(page).last()).toContainText('Nicht in der Bibliographie')
    // Only the works of the open sheet carry the dot.
    await expect(sidebar(page).locator('.dot.here')).toHaveCount(2)

    // The group "methoden" has the sheets design and auswertung.
    await page.locator('[role=treeitem][data-path="methoden"]').click()
    await scope(page, 'Gruppe').check()
    await expect(sidebar(page)).toContainText('Werke: 5 · Zitate: 6')
    await expect(works(page).nth(1)).toContainText('Adler, A. (2021)')
  } finally {
    await app.close()
  }
})

test('a work is its reference only: nothing opens on a click, and the text can be selected', async () => {
  const { app, page } = await open()
  try {
    await toggle(page).click()
    await scope(page, 'Projekt').check()
    const jones = works(page).filter({ hasText: 'Jones, M.' })
    await jones.click()
    // No list of the places it is cited at, and nothing in the row is a button.
    await expect(sidebar(page).locator('.works [aria-expanded]')).toHaveCount(0)
    await expect(sidebar(page).locator('.works .uses')).toHaveCount(0)
    await expect(sidebar(page).locator('.works').getByRole('button')).toHaveCount(0)
    expect(
      await jones.locator('.reference').evaluate((el) => getComputedStyle(el).userSelect),
    ).toBe('text')
  } finally {
    await app.close()
  }
})

test('lists places that need a citation and citations to check, and follows what is typed', async () => {
  const { app, page } = await open('methoden/auswertung.typ')
  try {
    await toggle(page).click()
    const openSection = sidebar(page).getByRole('region', { name: 'Offen' })
    await expect(openSection).toContainText('Beleg fehlt')
    await expect(openSection).toContainText('Zu prüfen')
    await expect(openSection.locator('.count')).toHaveText(['1×', '1×'])
    await openSection.getByRole('button', { name: /Beleg fehlt/ }).click()
    await expect(openSection.locator('.uses [role=button]').first()).toContainText('Zeile 1')

    // Typing a citation changes the list after a moment.
    await expect(works(page)).toHaveCount(1)
    await page.locator('.cm-content').focus()
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.type(' Ein @smith2020')
    await page.keyboard.type(' Ende')
    await expect(works(page)).toHaveCount(2)
    await expect(sidebar(page)).toContainText('Werke: 2 · Zitate: 2')
  } finally {
    await app.close()
  }
})

test('an excluded sheet is listed when it is what is being looked at, and the button hides the sidebar again', async () => {
  const { app, page } = await open(':material/notizen/ideen.typ')
  try {
    await toggle(page).click()
    // The sheet itself, and the group it is in, are not exported: all of it is shown.
    await expect(sidebar(page)).toContainText('Werke: 1 · Zitate: 2')
    await scope(page, 'Gruppe').check()
    await expect(sidebar(page)).toContainText('Werke: 1 · Zitate: 2')
    await expect(works(page)).toHaveText([/Adler, A\. \(2021\)\. Zuerst\.\s*2×/])
    await toggle(page).click()
    await expect(sidebar(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})
