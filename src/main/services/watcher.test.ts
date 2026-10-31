import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { watchProject } from './watcher'
import type { ProjectWatcher } from './watcher'

let root: string
let watcher: ProjectWatcher | null = null
const batches: string[][] = []

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'wm-watch-')))
  await mkdir(join(root, 'content', 'g'), { recursive: true })
  batches.length = 0
})
afterEach(async () => {
  await watcher?.close()
  watcher = null
  await rm(root, { recursive: true, force: true })
})

const seen = (): string[] => batches.flat()
async function waitFor(check: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 50))
  expect(check()).toBe(true)
}
async function start(platform: NodeJS.Platform): Promise<void> {
  watcher = watchProject(root, (paths) => batches.push(paths), { debounceMs: 100, platform })
  await new Promise((r) => setTimeout(r, 400)) // let the watcher finish its initial scan
}

// Chokidar everywhere but Windows; there the system's own recursive watch (which macOS has too).
describe.each(['darwin', 'win32'] as const)('watchProject as on %s', (platform) => {
  it('reports created, changed, and renamed files as project-relative paths', async () => {
    await start(platform)
    await writeFile(join(root, 'content', 'g', 'a.typ'), 'x')
    await waitFor(() => seen().includes('content/g/a.typ'))
    await rename(join(root, 'content', 'g', 'a.typ'), join(root, 'content', 'g', 'b.typ'))
    await waitFor(() => seen().includes('content/g/b.typ'))
    expect(seen()).toContain('content/g/a.typ')
  })

  it('ignores hidden files, temporary write files, and _build', async () => {
    await start(platform)
    await writeFile(join(root, 'content', 'g', '.a.typ.123.tmp'), 'x')
    await mkdir(join(root, '_build'))
    await writeFile(join(root, '_build', 'main.typ'), 'x')
    await writeFile(join(root, 'content', 'g', 'real.typ'), 'x')
    await waitFor(() => seen().includes('content/g/real.typ'))
    expect(seen().filter((p) => p.startsWith('_build') || p.includes('.tmp'))).toEqual([])
  })

  it('also watches a file outside the project when asked, and reports it by its absolute path', async () => {
    const outside = await realpath(await mkdtemp(join(tmpdir(), 'wm-ext-')))
    try {
      const bib = join(outside, 'library.bib')
      await writeFile(bib, '@book{a}')
      await start(platform)
      watcher!.setExternal([bib])
      await new Promise((r) => setTimeout(r, 400))
      await writeFile(bib, '@book{a}\n@book{b}')
      await waitFor(() => seen().includes(bib))
      // Once it is no longer asked for, changes to it are not reported.
      watcher!.setExternal([])
      await new Promise((r) => setTimeout(r, 400))
      batches.length = 0
      await writeFile(bib, '@book{c}')
      await writeFile(join(root, 'content', 'g', 'x.typ'), 'x')
      await waitFor(() => seen().includes('content/g/x.typ'))
      expect(seen()).not.toContain(bib)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('lets a watched folder be renamed, and reports it', async () => {
    await writeFile(join(root, 'content', 'g', 'a.typ'), 'x')
    await start(platform)
    await rename(join(root, 'content', 'g'), join(root, 'content', 'h'))
    await waitFor(() => seen().some((path) => path.startsWith('content/h')))
  })
})
