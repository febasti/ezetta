import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { deflateSync } from 'node:zlib'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

/** The modifier of the app's shortcuts: Cmd on macOS, Ctrl elsewhere. */
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
/** The caret to the end of the text (Cmd+Down on a Mac, Ctrl+End elsewhere). */
export const TO_END = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'
/** The selection one word to the left (Option+Shift+Left on a Mac, Ctrl+Shift+Left elsewhere). */
export const SELECT_WORD_LEFT =
  process.platform === 'darwin' ? 'Shift+Alt+ArrowLeft' : 'Shift+Control+ArrowLeft'

/**
 * The Typst compiler for the tests that need it (formulas, preview, export, templates): the one in
 * `EZETTA_TYPST`, else the usual places, else the `typst` on the PATH; null when there is none.
 */
export const TYPST: string | null = (() => {
  const given = process.env['EZETTA_TYPST']
  const found = [given, '/opt/homebrew/bin/typst', '/usr/local/bin/typst', '/usr/bin/typst'].find(
    (path): path is string => !!path && existsSync(path),
  )
  if (found) return found
  try {
    execFileSync('typst', ['--version'], { stdio: 'ignore' })
    return 'typst'
  } catch {
    return null
  }
})()

export interface Sandbox {
  base: string
  projectDir: string
  userData: string
}

/** A throwaway project on disk with groups, nested groups, and sheets. Never real files. */
export async function createSandbox(overrides: Record<string, string> = {}): Promise<Sandbox> {
  const base = await mkdtemp(join(tmpdir(), 'wm-e2e-'))
  const projectDir = join(base, 'Dissertation')
  const files: Record<string, string> = {
    'project.toml': `[project]
version = 1
title = "Dissertation"
language = "de"

[goals]
words = 80000

[order]
"" = ["einleitung", "methoden", "notizen"]
"methoden" = ["design.typ", "daten", "auswertung.typ"]
"methoden/daten" = ["interviews.typ", "dokumente.typ"]

[items."methoden/design.typ"]
status = "revised"
goal = 1200

[items."notizen"]
export = false
`,
    'library.bib': '',
    'dictionary.txt': '',
    'content/einleitung/einleitung.typ':
      '= Einleitung <sec-einleitung>\n\nDie Größe der Stichprobe wächst über 12 Jahre. Ein Beleg @smith2020[S. 14].#footnote[Eine Fußnote mit Text.]\n',
    'content/methoden/design.typ':
      '= Design\n\nDas Design der Studie ist qualitativ und beschreibt Äpfel, Öl und Übung.\n',
    'content/methoden/auswertung.typ': 'Die Auswertung folgt später.\n',
    'content/methoden/daten/interviews.typ': 'Zwölf Interviews wurden geführt.\n',
    'content/methoden/daten/dokumente.typ': 'Dokumente wurden gesammelt.\n',
    'content/notizen/ideen.typ': '/* nicht drucken */ Eine lose Idee.\n',
  }
  for (const [path, content] of Object.entries({ ...files, ...overrides })) {
    const abs = join(projectDir, path)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content)
  }
  return { base, projectDir, userData: join(base, 'userdata') }
}

export async function launch(
  sandbox: Sandbox,
  options: { project?: boolean; env?: Record<string, string> } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    // The tests read the interface in German, which the app chooses by the system's languages;
    // a machine that has only English (a CI service, say) would show English.
    args: [resolve('.'), `--user-data-dir=${sandbox.userData}`, '--lang=de'],
    env: {
      ...process.env,
      // The tests click the app's own menus; a system menu is not part of the page.
      EZETTA_HTML_MENUS: '1',
      // The windows never take the focus, so the tests can run while you work and one test's
      // window does not end another's hover; on macOS they are not shown at all, so a pointer
      // passing over the screen cannot reach the page (see `createMainWindow`).
      // `EZETTA_E2E_FOREGROUND=1` shows them in front, to watch a test.
      EZETTA_BACKGROUND: process.env['EZETTA_E2E_FOREGROUND'] === '1' ? '0' : '1',
      ...options.env,
      ...(options.project === false ? {} : { EZETTA_PROJECT: sandbox.projectDir }),
    },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 800 })
  return { app, page }
}

/**
 * Opens a sheet from the sidebar, as a writer does: its group in the groups column, then the sheet,
 * and waits for the editor.
 */
export async function openSheet(page: Page, path = 'methoden/design.typ'): Promise<void> {
  await page.locator(`[role=treeitem][data-path="${dirname(path)}"]`).click()
  await page.locator(`[role=option][data-path="${path}"]`).click()
  await expect(page.locator('.cm-content')).toBeVisible()
}

/** Starts the app on the sandbox and opens a sheet in it. */
export async function launchAt(
  sandbox: Sandbox,
  path = 'methoden/design.typ',
  options: Parameters<typeof launch>[1] = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const opened = await launch(sandbox, options)
  await openSheet(opened.page, path)
  return opened
}

/** A file's text as a function, for `expect.poll`: autosave writes a moment after typing stops. */
export const fileText =
  (path: string): (() => Promise<string>) =>
  () =>
    readFile(path, 'utf8').catch(() => '')

/**
 * Waits a fixed time on purpose, for a check that something does not happen (nothing is written,
 * nothing changes back): there is no event to wait for when nothing happens. Use it only for that;
 * anything that does happen is waited for with `expect` or `expect.poll`.
 */
export const quietFor = (page: Page, ms: number): Promise<void> => page.waitForTimeout(ms)

/** Long enough for an autosave to have happened, had there been one: its pause (800 ms) and the write. */
export const AUTOSAVE_SETTLE_MS = 1500

/**
 * The `@` menu (citations, cross-references) is CodeMirror's autocompletion, which ignores Enter for
 * a moment after it opens (`interactionDelay`, 75 ms), so a fast typist does not choose by
 * accident. A test that presses Enter waits past it.
 */
export const pastMenuGuard = (page: Page): Promise<void> => page.waitForTimeout(250)

const CRC = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table.push(c >>> 0)
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

/** A real, decodable PNG of one colour, so tests can check that an image actually loads. */
export function makePng(
  width = 120,
  height = 80,
  rgb: [number, number, number] = [60, 120, 200],
): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => rgb).flat()),
  ])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Where the development copy of LanguageTool is (`npm run fetch:dev-data`), or null. */
export const LANGUAGETOOL: string | null = (() => {
  const base = resolve('.dev/languagetool')
  if (!existsSync(base)) return null
  const name = readdirSync(base).find((n) => existsSync(join(base, n, 'languagetool-server.jar')))
  return name ? join(base, name) : null
})()

/**
 * One LanguageTool server for the tests of a file, so that each start of the app does not wait
 * for Java: the app uses it through `EZETTA_LANGUAGETOOL_PORT`. `ready` resolves with that
 * environment once the server answers.
 */
export function startLanguageTool(home: string): {
  ready: Promise<Record<string, string>>
  stop: () => void
} {
  let child: ReturnType<typeof spawn> | undefined
  const ready = (async () => {
    const port = await new Promise<number>((done, fail) => {
      const server = createServer()
      server.once('error', fail)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        server.close(() => done(typeof address === 'object' && address ? address.port : 0))
      })
    })
    child = spawn(
      process.env['EZETTA_JAVA'] ?? 'java',
      [
        '-Xmx768m',
        '-cp',
        'languagetool-server.jar',
        'org.languagetool.server.HTTPServer',
        '--port',
        String(port),
      ],
      { cwd: home, stdio: 'ignore' },
    )
    await expect
      .poll(
        () =>
          fetch(`http://127.0.0.1:${port}/v2/languages`).then(
            (r) => r.ok,
            () => false,
          ),
        { timeout: 60_000, intervals: [250] },
      )
      .toBe(true)
    return { EZETTA_LANGUAGETOOL_PORT: String(port) }
  })()
  return { ready, stop: () => void child?.kill() }
}
