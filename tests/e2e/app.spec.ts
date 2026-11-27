import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { createSandbox, launch, quietFor } from './helpers'
import type { Sandbox } from './helpers'

let sandbox: Sandbox
test.beforeEach(async () => {
  sandbox = await createSandbox()
})
test.afterEach(() => rm(sandbox.base, { recursive: true, force: true }))

// Drives the real built app (run `npm run build` first). The Chromium sandbox stays on.
test('the renderer reaches main only through the typed IPC contract, and the baseline holds', async () => {
  const { app, page } = await launch(sandbox, { project: false })
  try {
    const chrome = await page.evaluate(() => window.api.app.windowChrome({}))
    expect(chrome).toMatchObject({ ok: true, value: { fullscreen: false } })

    // Invalid requests are rejected by the main process, as typed results.
    const invalid = await page.evaluate(() =>
      window.api.project.createSheet({ parent: '', name: 'x', extra: 1 } as never),
    )
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    const noProject = await page.evaluate(() =>
      window.api.project.createSheet({ parent: '', name: 'x' }),
    )
    expect(noProject).toMatchObject({ ok: false, error: { code: 'no_project' } })

    // Security baseline, observed from inside the renderer.
    const exposed = await page.evaluate(() => ({
      keys: Object.keys(window.api).sort(),
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      origin: window.location.origin,
    }))
    expect(exposed.keys).toEqual([
      'app',
      'backup',
      'export',
      'history',
      'on',
      'project',
      'proof',
      'templates',
      'thesaurus',
      'version',
    ])
    expect(exposed.require).toBe('undefined')
    expect(exposed.process).toBe('undefined')
    expect(exposed.origin).toBe('app://renderer')

    const csp = await page.evaluate(async () =>
      (await fetch(window.location.href)).headers.get('content-security-policy'),
    )
    expect(csp).toContain(`script-src 'self'`)
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  } finally {
    await app.close()
  }
})

test('shows the welcome screen when no project is open', async () => {
  const { app, page } = await launch(sandbox, { project: false })
  try {
    await expect(page.getByRole('button', { name: /^(Erstellen|Create)$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Öffnen|Open)$/ })).toBeVisible()
    // Nothing asks for a project's state before one is open, so no error is shown.
    await quietFor(page, 1000)
    await expect(page.getByText(/Es ist kein Projekt geöffnet|No project is open/)).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('a second start with the same data folder ends, and the first goes on', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await expect(page.locator('[role=treeitem]').first()).toBeVisible()
    // The second process finds the first and quits by itself, before it opens a window.
    const second = await electron
      .launch({
        args: [resolve('.'), `--user-data-dir=${sandbox.userData}`, '--lang=de'],
        env: { ...process.env, EZETTA_BACKGROUND: '1', EZETTA_PROJECT: sandbox.projectDir },
      })
      .catch(() => null) // it was gone before the test could reach it
    if (second) {
      try {
        await expect.poll(() => second.process().exitCode, { timeout: 10_000 }).not.toBeNull()
      } finally {
        second.process().kill()
      }
    }
    expect(app.windows()).toHaveLength(1)
    const chrome = await page.evaluate(() => window.api.app.windowChrome({}))
    expect(chrome).toMatchObject({ ok: true })
  } finally {
    await app.close()
  }
})

test('a page that ended unexpectedly is loaded again, with the project still open', async () => {
  const { app, page } = await launch(sandbox)
  try {
    await expect(page.locator('[role=treeitem]').first()).toBeVisible()
    const crashed = page.waitForEvent('crash')
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.forcefullyCrashRenderer(),
    )
    await crashed
    // Asked through the main process: the test's own hold on the page ended with the page.
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const contents = BrowserWindow.getAllWindows()[0]!.webContents
          if (contents.isCrashed() || contents.isLoading()) return false
          return contents.executeJavaScript(
            "document.querySelector('[role=treeitem]') !== null",
          ) as Promise<boolean>
        }),
      )
      .toBe(true)
  } finally {
    await app.close()
  }
})
