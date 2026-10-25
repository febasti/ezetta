import { resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

// The gallery in every theme, one picture per part (the foundation's blocks, the editor's widgets),
// compared with the pictures in `gallery.spec.ts-snapshots`. A change to a block or a token that
// changes how it looks fails here; when the change is meant, run `npm run test:gallery -- -u` and
// look at the new pictures before committing them.
let app: ElectronApplication
let page: Page
test.beforeAll(async () => {
  app = await electron.launch({ args: [resolve('tests/gallery/shell.mjs')] })
  page = await app.firstWindow()
  await page.setViewportSize({ width: 1200, height: 900 })
  await expect(page.getByRole('heading', { name: 'Foundation' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
})
test.afterAll(() => app.close())

const THEMES = [
  ['light', 'Hell'],
  ['dark', 'Dunkel'],
  ['sepia', 'Sepia'],
] as const

for (const [theme, label] of THEMES) {
  test(`the gallery in the ${theme} theme`, async () => {
    await page
      .getByRole('radiogroup', { name: 'Design' })
      .first()
      .getByRole('radio', { name: label })
      .click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    // The caret blinks and a hover lingers: neither belongs in a picture.
    await page.mouse.move(0, 0)
    for (const part of ['foundation', 'editor-gallery'])
      await expect(page.locator(`.${part}`)).toHaveScreenshot(`${part}-${theme}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.002,
      })
  })
}
