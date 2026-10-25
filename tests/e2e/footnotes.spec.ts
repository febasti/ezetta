import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createSandbox, launch, launchAt, MOD } from './helpers'
import type { Sandbox } from './helpers'

const SHEET = 'content/methoden/design.typ'
const SAMPLE = `Die Studie folgt einem qualitativen Design.#footnote[Siehe @smith2020[S. 14] für die Begründung.] Die Stichprobe war zielgerichtet.#footnote[Auswahlkriterien: Erfahrung, Alter.]

Ein zweiter Absatz mit _Betonung_.#footnote[Kurz.]

/* Eine Notiz in einem Kommentar zählt nicht: #footnote[nein] */ Und ein \`Raw #footnote[auch nicht]\`.
`

let sandbox: Sandbox
test.beforeEach(async () => {
  // The sheet before "design" in project order has one note of its own.
  sandbox = await createSandbox({ [SHEET]: SAMPLE })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const read = (path = SHEET) => readFile(join(sandbox.projectDir, path), 'utf8')

async function open(path = 'methoden/design.typ') {
  return launchAt(sandbox, `${path}`)
}

const markers = (page: Page) => page.locator('.cm-content .cm-footnote-marker')
const cards = (page: Page) => page.locator('.cm-note-card')
/** The footnote display is set in the settings window, on the Editor page. */
async function editorSettings(
  page: Page,
  change: (dialog: ReturnType<Page['getByRole']>) => Promise<unknown>,
): Promise<void> {
  await page.keyboard.press(`${MOD}+,`)
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' })
  await dialog.getByRole('tab', { name: 'Darstellung' }).click()
  await change(dialog)
  await dialog.getByRole('button', { name: 'Schließen' }).click()
  await expect(dialog).toHaveCount(0)
}

/** The three ways to show and write footnotes: margin notes (the default), a list, floating cards. */
async function setMode(page: Page, name: 'Randnotizen' | 'Fußnotenliste' | 'Schwebende Karten') {
  await editorSettings(page, (dialog) => dialog.getByRole('radio', { name }).check())
}
/** The margin card of the note that is open: it holds the small editor. */
const editing = (page: Page) => page.locator('.cm-note-card.editing')

const tool = (page: Page, name: string) =>
  page.locator('.toolbar').getByRole('button', { name, exact: true })

test('shows each footnote as a superscript number with a card in the margin, level with it', async () => {
  const { app, page } = await open()
  try {
    await expect(markers(page)).toHaveText(['2', '3', '4']) // the earlier sheet has note 1
    await expect(cards(page)).toHaveCount(3)
    await expect(cards(page).nth(0)).toContainText('Siehe (smith2020, S. 14) für die Begründung.')
    await expect(cards(page).nth(1)).toContainText('Auswahlkriterien')

    const text = await page.locator('.cm-content').innerText()
    expect(text).not.toContain('#footnote[Siehe')
    expect(text).not.toContain('#footnote[Auswahl')
    expect(text).not.toContain('nein') // notes in comments and raw text are not notes, and stay as written
    expect(text).toContain('#footnote[auch nicht]')

    // The cards are to the right of the text, in order, and do not overlap.
    const boxes = await cards(page).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()),
    )
    const lineRight = await page
      .locator('.cm-content .cm-line')
      .first()
      .evaluate((el) => el.getBoundingClientRect().right)
    for (const box of boxes) expect(box.left).toBeGreaterThan(lineRight)
    for (let i = 1; i < boxes.length; i += 1)
      expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom)
    // Each card is level with its marker (or pushed down by the one above it).
    const markerTop = await markers(page)
      .first()
      .evaluate((el) => el.getBoundingClientRect().top)
    expect(Math.abs(boxes[0]!.top - markerTop)).toBeLessThan(30)
  } finally {
    await app.close()
  }
})

test('a click lands on the line clicked after the margin narrowed the text', async () => {
  const { app, page } = await open()
  try {
    await expect(cards(page)).toHaveCount(3)
    // The first paragraph wraps once the text makes room for the cards. Measured at the full
    // width, every line below it would be off by a line.
    await page.locator('.cm-content').getByText('Ein zweiter Absatz').click()
    await page.keyboard.press('Home')
    await page.keyboard.type('X')
    await expect.poll(() => read()).toContain('\nXEin zweiter Absatz')
  } finally {
    await app.close()
  }
})

test('the source is shown only in Quelltext mode, not where the selection touches a note', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('Ein zweiter Absatz').click({ clickCount: 3 })
    // A selection over the note highlights its marker, and the source stays hidden.
    await expect(page.locator('.cm-footnote-marker.selected')).toHaveCount(1)
    expect(await content.innerText()).not.toContain('#footnote[Kurz.]')
    await page.locator('footer').getByRole('button', { name: 'Quelltext' }).click()
    await expect(content).toContainText('#footnote[Siehe @smith2020[S. 14] für die Begründung.]')
    await expect(markers(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a click on a marker or a card writes the note in its margin card, and edits go into the text', async () => {
  const { app, page } = await open()
  try {
    await markers(page).nth(2).click()
    const card = editing(page)
    await expect(card).toHaveCount(1)
    await expect(card.locator('.cm-content')).toHaveText('Kurz.')
    await expect(page.locator('.cm-note-editor')).toHaveCount(0)
    await expect(markers(page).nth(2)).toHaveClass(/active/)
    await expect(cards(page).nth(2)).toHaveClass(/active/)
    await page.keyboard.type(' Mehr Text.')
    await expect.poll(read).toContain('#footnote[Kurz. Mehr Text.]')

    // One undo history: undo in the card reverts the main text, and the card follows.
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(read).toContain('#footnote[Kurz.]')
    await expect(card.locator('.cm-content')).toHaveText('Kurz.')

    // Formatting works inside a note, and Escape closes it with the caret after the marker.
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.press(`${MOD}+i`)
    await expect.poll(read).toContain('#footnote[_Kurz._]')
    await page.keyboard.press('Escape')
    await expect(editing(page)).toHaveCount(0)
    await expect(cards(page).nth(2)).toContainText('Kurz.')

    await cards(page).nth(0).click()
    // The citation in the note is a chip here too (this project has no library, so it shows the key).
    await expect(editing(page).locator('.cm-content')).toContainText('Siehe (smith2020, S. 14)')
    // Another card takes over: only one note is open.
    await cards(page).nth(1).click()
    await expect(editing(page)).toHaveCount(1)
    await expect(editing(page).locator('.cm-content')).toContainText('Auswahlkriterien')
  } finally {
    await app.close()
  }
})

test('as floating cards a click on a marker opens the note in a card over the text', async () => {
  const { app, page } = await open()
  try {
    await setMode(page, 'Schwebende Karten')
    await expect(cards(page)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Fußnoten' })).toHaveCount(0)
    await markers(page).nth(2).click()
    const editor = page.locator('.cm-note-editor')
    await expect(editor).toBeVisible()
    await expect(editor.locator('.cm-content')).toHaveText('Kurz.')
    await expect(editor.locator('.cm-note-editor-title')).toHaveText('Fußnote 4')
    await page.keyboard.type(' Mehr Text.')
    await expect.poll(read).toContain('#footnote[Kurz. Mehr Text.]')
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('clicking elsewhere closes the open note, in a card and over the text', async () => {
  const { app, page } = await open()
  try {
    await markers(page).first().click()
    await expect(editing(page)).toHaveCount(1)
    await page.locator('.cm-content').getByText('Ein zweiter Absatz').click()
    await expect(editing(page)).toHaveCount(0)

    await setMode(page, 'Schwebende Karten')
    await markers(page).first().click()
    await expect(page.locator('.cm-note-editor')).toBeVisible()
    // The card covers the lines under its marker: click in the empty space beside the text.
    const box = (await page.locator('.cm-scroller').first().boundingBox())!
    await page.mouse.click(box.x + box.width - 8, box.y + 80)
    await expect(page.locator('.cm-note-editor')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('the Fußnote tool inserts a note at the caret and opens it for typing', async () => {
  const { app, page } = await open()
  try {
    await page.locator('.cm-content').getByText('Ein zweiter Absatz').click()
    await page.keyboard.press('End')
    await tool(page, 'Fußnote').click()
    await expect(editing(page)).toHaveCount(1)
    await page.keyboard.type('Eine neue Notiz')
    await expect.poll(read).toContain('Betonung_.#footnote[Kurz.]#footnote[Eine neue Notiz]')
    await expect(markers(page)).toHaveText(['2', '3', '4', '5'])
    await page.keyboard.press('Escape')

    // The keyboard shortcut does the same, and on an existing note it opens that note.
    await page.locator('.cm-content').getByText('Ein zweiter Absatz').click()
    await page.keyboard.press('Home')
    await page.keyboard.press(`${MOD}+Alt+f`)
    await expect(editing(page)).toHaveCount(1)
    await page.keyboard.type('Vorn')
    await expect.poll(read).toContain('#footnote[Vorn]Ein zweiter')
  } finally {
    await app.close()
  }
})

test('numbers continue across sheets, and can restart at each chapter', async () => {
  sandbox = await createSandbox({
    [SHEET]: 'A#footnote[a] B#footnote[b]\n\n= Kapitel\n\nC#footnote[c] D#footnote[d]\n',
    'content/methoden/auswertung.typ': 'E#footnote[e]\n\n= Neu\n\nF#footnote[f]\n',
  })
  const { app, page } = await open('methoden/auswertung.typ')
  try {
    // Order: einleitung (1 note), design (4 notes), then auswertung.
    await expect(markers(page)).toHaveText(['6', '7'])
    await page.locator('.project').click()
    await page.getByRole('menuitem', { name: /pro Kapitel neu nummerieren/ }).click()
    // Per chapter: E carries on from the chapter that began in design (C, D), then "Neu" restarts at 1.
    await expect(markers(page)).toHaveText(['3', '1'])
    await expect.poll(() => read('project.toml')).toContain('restart = "chapter"')
    await page.locator('.project').click()
    await page.getByRole('menuitem', { name: /pro Kapitel neu nummerieren/ }).click()
    await expect(markers(page)).toHaveText(['6', '7'])
  } finally {
    await app.close()
  }
})

test('footnotes are shown and written in one of three places, and only one can be chosen', async () => {
  const { app, page } = await open()
  try {
    await page.keyboard.press(`${MOD}+,`)
    const dialog = page.getByRole('dialog', { name: 'Einstellungen' })
    await dialog.getByRole('tab', { name: 'Darstellung' }).click()
    const group = dialog.getByRole('group', { name: 'Fußnoten anzeigen und schreiben' })
    await expect(group.getByRole('radio')).toHaveCount(3)
    await expect(group.getByRole('radio', { name: 'Randnotizen' })).toBeChecked()
    await group.getByRole('radio', { name: 'Fußnotenliste' }).check()
    await expect(group.getByRole('radio', { name: 'Randnotizen' })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Schließen' }).click()

    // The list: no margin cards, no floating card, every note in the list.
    const panel = page.getByRole('region', { name: 'Fußnoten' })
    await expect(cards(page)).toHaveCount(0)
    await expect(panel.locator('li')).toHaveCount(3)
    await markers(page).nth(2).click()
    await expect(page.locator('.cm-note-editor')).toHaveCount(0)
    await expect(panel.locator('li').nth(2).locator('.cm-content')).toHaveText('Kurz.')

    await setMode(page, 'Randnotizen')
    await expect(page.getByRole('region', { name: 'Fußnoten' })).toHaveCount(0)
    await expect(cards(page)).toHaveCount(3)

    await setMode(page, 'Schwebende Karten')
    await expect(cards(page)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Fußnoten' })).toHaveCount(0)
    // The text column is back to its normal width and place.
    await expect(page.locator('.badge')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('the footnote list lists all notes in order and writes them in place, and replaces the margin when narrow', async () => {
  const { app, page } = await open()
  try {
    await expect(page.locator('.panel')).toHaveCount(0)
    await setMode(page, 'Fußnotenliste')
    const panel = page.getByRole('region', { name: 'Fußnoten' })
    await expect(panel.locator('li')).toHaveCount(3)
    await expect(panel.locator('li').nth(2)).toContainText('Kurz.')
    await panel.locator('li').nth(1).getByRole('button').click()
    const row = panel.locator('li').nth(1)
    await expect(row.locator('.cm-content')).toContainText('Auswahlkriterien')
    await page.keyboard.type(' Mehr.')
    await expect.poll(read).toContain('Alter. Mehr.]')
    // Another row takes over, and leaving the list closes the note.
    await panel.locator('li').nth(2).getByRole('button').click()
    await expect(panel.locator('.cm-content')).toHaveCount(1)
    await page.locator('.cm-content').getByText('Ein zweiter Absatz').click()
    await expect(panel.locator('.cm-content')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await setMode(page, 'Randnotizen')
    await expect(page.getByRole('region', { name: 'Fußnoten' })).toHaveCount(0)

    // With too little room the margin gives way to the list on its own.
    await page.locator('[role=separator][aria-label]').first().focus()
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight')
    await expect(cards(page)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Fußnoten' })).toBeVisible()
    await expect(markers(page)).toHaveCount(3)
  } finally {
    await app.close()
  }
})

test('the continuous view shows numbered markers, and a click goes to that note in its sheet', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await page.locator('[role=treeitem][data-path="methoden"]').click()
    const flow = page.locator('[data-testid=flow] .cm-content')
    await expect(flow.locator('.cm-footnote-marker')).toHaveText(['2', '3', '4'])
    await flow.locator('.cm-footnote-marker').nth(1).click()
    await expect(page.locator('[data-testid=flow]')).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('Die Studie folgt')
    await expect(markers(page)).toHaveCount(3)
  } finally {
    await app.close()
  }
})

test('a marker is atomic: arrows jump over it, Backspace selects it, a second press deletes it', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('Ein zweiter Absatz').click()
    await page.keyboard.press('End') // right after the marker of note 4
    const before = await markers(page).count()

    // The arrow key steps over the whole marker, and its source never shows.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    await expect(content).not.toContainText('#footnote[Kurz.]')
    await expect(markers(page)).toHaveCount(before)

    // Backspace highlights the marker first and leaves the text alone.
    await page.keyboard.press('Backspace')
    await expect(page.locator('.cm-footnote-marker.selected')).toHaveCount(1)
    await expect(markers(page)).toHaveCount(before)
    await page.keyboard.press('Backspace')
    await expect(markers(page)).toHaveCount(before - 1)
    await expect.poll(() => read()).not.toContain('#footnote[Kurz.]')
    expect(await read()).toContain('Ein zweiter Absatz mit _Betonung_.')
    expect(await read()).not.toMatch(/footnote\[Kurz|#footnote\[$|Kurz\.\]/)
  } finally {
    await app.close()
  }
})

test('Delete in front of a marker selects it too, and undo brings the note back', async () => {
  const { app, page } = await open()
  try {
    const content = page.locator('.cm-content')
    await content.getByText('Ein zweiter Absatz').click()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft') // in front of the marker
    const before = await markers(page).count()
    await page.keyboard.press('Delete')
    await expect(page.locator('.cm-footnote-marker.selected')).toHaveCount(1)
    await page.keyboard.press('Delete')
    await expect(markers(page)).toHaveCount(before - 1)
    await page.keyboard.press(`${MOD}+z`)
    await expect(markers(page)).toHaveCount(before)
    await expect.poll(() => read()).toContain('#footnote[Kurz.]')
  } finally {
    await app.close()
  }
})

test('a selection in a note shows in the margin card, in the list and in the floating card', async () => {
  const { app, page } = await open()
  try {
    // The selection must differ from what is behind it: the card and the row are tinted themselves.
    const selected = async (editorRoot: ReturnType<Page['locator']>) => {
      await expect(editorRoot.locator('.cm-content')).toBeFocused()
      await page.keyboard.press(`${MOD}+a`)
      const layer = editorRoot.locator('.cm-selectionBackground').first()
      await expect(layer).toBeVisible()
      const [selection, host] = await Promise.all([
        layer.evaluate((el) => getComputedStyle(el).backgroundColor),
        editorRoot.evaluate((el) => {
          let node: Element | null = el
          while (node) {
            const color = getComputedStyle(node).backgroundColor
            if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color
            node = node.parentElement
          }
          return ''
        }),
      ])
      expect(selection).not.toBe('rgba(0, 0, 0, 0)')
      expect(selection).not.toBe(host)
    }

    await markers(page).nth(2).click()
    await selected(editing(page).locator('.cm-editor'))
    await page.keyboard.press('Escape')

    await setMode(page, 'Fußnotenliste')
    await markers(page).nth(2).click()
    const row = page.getByRole('region', { name: 'Fußnoten' }).locator('li').nth(2)
    await selected(row.locator('.cm-editor'))
    await page.keyboard.press('Escape')

    await setMode(page, 'Schwebende Karten')
    await markers(page).nth(2).click()
    await selected(page.locator('.cm-note-editor .cm-editor'))
  } finally {
    await app.close()
  }
})

const BIB = `
@article{smith2020, author = {Smith, John}, title = {Eine Studie}, journal = {Zeitschrift}, year = {2020}}
`
async function openWithNote(note: string) {
  await rm(sandbox.base, { recursive: true, force: true })
  sandbox = await createSandbox({
    [SHEET]: `Ein Satz.#footnote[${note}] Mehr Text hier.\n`,
    'library.bib': BIB,
  })
  return open()
}

test('a note shows its words like the text: highlights, emphasis and citations', async () => {
  const { app, page } = await openWithNote(
    'Siehe @smith2020[S. 4] und ::wichtig:: sowie *fett* und _kursiv_.',
  )
  try {
    const words = cards(page).first().locator('.cm-note-text')
    await expect(words.locator('.cm-cite')).toHaveText('(Smith 2020, S. 4)')
    await expect(words.locator('.cm-highlight')).toHaveText('wichtig')
    await expect(words.locator('strong')).toHaveText('fett')
    await expect(words.locator('em')).toHaveText('kursiv')
    // The syntax is not shown.
    await expect(words).not.toContainText('::')
    await expect(words).not.toContainText('@smith2020')
    // The same in the list below the text.
    await editorSettings(page, (dialog) =>
      dialog.getByRole('radio', { name: 'Fußnotenliste' }).check(),
    )
    const row = page.getByRole('region', { name: 'Fußnoten' }).locator('.note-words')
    await expect(row.locator('.cm-cite')).toHaveText('(Smith 2020, S. 4)')
    await expect(row.locator('.cm-highlight')).toHaveText('wichtig')
  } finally {
    await app.close()
  }
})

test('the citation editor opens from a note, by the tool and by a chip, and the work lands in the note', async () => {
  const { app, page } = await openWithNote('Siehe')
  try {
    await cards(page).first().click()
    const field = page.locator('.cm-note-edit .cm-content')
    await field.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' hier ')
    await page.locator('.toolbar').getByRole('button', { name: 'Beleg', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Beleg bearbeiten' })
    await expect(dialog).toBeVisible()
    await expect(page.locator('.cm-note-edit .cm-cite-editor')).toHaveCount(1)
    await dialog.locator('input.cm-cite-search').fill('smith')
    await dialog.getByRole('listbox').getByRole('option', { name: /Smith/ }).click()
    await expect.poll(() => read()).toContain('#footnote[Siehe hier @smith2020')
    // A chip in the open note opens the editor for it.
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await field.locator('.cm-cite').click()
    await expect(dialog).toBeVisible()
  } finally {
    await app.close()
  }
})
