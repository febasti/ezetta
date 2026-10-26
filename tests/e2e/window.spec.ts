import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createSandbox, launch, launchAt, openSheet } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox({ 'content/methoden/design.typ': '= Design\n\nText.\n' })
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

const mac = process.platform === 'darwin'

test('on macOS the title bar is merged with the toolbar, which leaves the traffic lights room', async () => {
  test.skip(!mac, 'the merged title bar is macOS only')
  const { app, page } = await launch(sandbox)
  try {
    // The window has no title bar of its own.
    const style = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!
      return { fullscreen: window.isFullScreen(), position: window.getWindowButtonPosition() }
    })
    expect(style.position).toEqual({ x: 18, y: 17 })
    await expect(page.locator('html')).toHaveAttribute('data-chrome', 'inset')
    await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'false')

    // The toolbar starts after the traffic lights; its empty space moves the window, its buttons do not.
    const toolbar = page.locator('.toolbar')
    const room = () =>
      toolbar
        .getByRole('button')
        .first()
        .evaluate(
          (el) =>
            el.getBoundingClientRect().left - el.closest('.toolbar')!.getBoundingClientRect().left,
        )
    // The lights end 78 px from the edge (14 pt circles); the first tool keeps 12 px from them.
    expect(await room()).toBeGreaterThanOrEqual(90)
    expect(
      await toolbar.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')),
    ).toBe('drag')
    const button = toolbar.getByRole('button').first()
    expect(
      await button.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')),
    ).toBe('no-drag')
    // The traffic lights sit in the toolbar's height (48 px), centred.
    expect(await toolbar.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(49)

    // In full screen there are no traffic lights, and the room goes.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.send('app:window-chrome-changed', {
        inset: true,
        fullscreen: true,
      }),
    )
    await expect(page.locator('html')).toHaveAttribute('data-fullscreen', 'true')
    await expect.poll(room).toBeLessThan(24)
  } finally {
    await app.close()
  }
})

test('the welcome screen has a strip at the top that moves the window', async () => {
  test.skip(!mac, 'the merged title bar is macOS only')
  const { app, page } = await launch(sandbox, { project: false })
  try {
    const strip = page.locator('.drag-strip')
    await expect(page.getByRole('button', { name: 'Erstellen', exact: true }).first()).toBeVisible()
    await expect(strip).toBeVisible()
    expect(
      await strip.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region')),
    ).toBe('drag')
  } finally {
    await app.close()
  }
})

test('without a project the window is a small fixed launcher, and a project opens in a window of its own size', async () => {
  const { app, page } = await launch(sandbox, { project: false })
  try {
    // Electron's setMaximizable does nothing on Linux, so isMaximizable stays true there: the
    // property is left out of what is compared (a property that is undefined counts as absent).
    const look = async () => {
      const seen = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]!
        const [width, height] = window.getContentSize()
        return {
          width,
          height,
          resizable: window.isResizable(),
          maximizable: window.isMaximizable(),
        }
      })
      return process.platform === 'linux' ? { ...seen, maximizable: undefined } : seen
    }
    const maximizable = (value: boolean) => (process.platform === 'linux' ? undefined : value)
    expect(await look()).toEqual({
      width: 720,
      height: 440,
      resizable: false,
      maximizable: maximizable(false),
    })

    // Open the project as the page does when the writer picks it, and let the page see it.
    await page.evaluate((path) => window.api.project.openRecent({ path }), sandbox.projectDir)
    await page.reload()
    await expect.poll(look).toMatchObject({ resizable: true, maximizable: maximizable(true) })
    expect((await look()).width).toBeGreaterThan(720)

    await page.evaluate(() => window.api.project.close({}))
    await page.reload()
    await expect
      .poll(look)
      .toEqual({ width: 720, height: 440, resizable: false, maximizable: maximizable(false) })
  } finally {
    await app.close()
  }
})

test('in the smallest window the editor keeps its width, nothing runs over, and the columns come back when it grows', async () => {
  const { app, page } = await launchAt(sandbox, 'methoden/design.typ', {})
  try {
    await page.evaluate(() => {
      localStorage.setItem('ui.rightSidebarVisible', 'true')
      for (const key of ['groupsWidth', 'sheetsWidth', 'rightWidth'])
        localStorage.setItem(`ui.${key}`, '520')
    })
    await page.reload()
    await openSheet(page, 'methoden/design.typ')
    // The page takes the size from the test's viewport, as the window's would.
    const resize = (width: number, height: number) => page.setViewportSize({ width, height })
    const measure = () =>
      page.evaluate(() => ({
        inner: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
        editor: document.querySelector('.cm-editor')?.getBoundingClientRect().width ?? 0,
        right: document.querySelector('aside.right')?.getBoundingClientRect().width ?? 0,
      }))
    await resize(1100, 700)
    await expect.poll(async () => (await measure()).inner).toBe(1100)
    await expect.poll(async () => (await measure()).editor).toBeGreaterThanOrEqual(400)
    const small = await measure()
    expect(small.scroll).toBeLessThanOrEqual(small.inner)
    expect(small.editor).toBeGreaterThanOrEqual(400)
    // The right sidebar is narrower than the 520 px chosen, and gets more of them in a wider window.
    expect(small.right).toBeLessThan(520)
    await resize(1800, 900)
    await expect.poll(async () => (await measure()).right).toBeGreaterThan(small.right)
  } finally {
    await app.close()
  }
})
