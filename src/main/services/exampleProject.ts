import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The example project: a small project that comes with the app (`examples/<language>/`) and
 * explains it by being written in it. The original is never opened. Every writer works on a copy in
 * the app's data folder, so what they try out cannot reach the original, and the copy is made
 * again from it when the app brings a newer example.
 *
 * The state of a copy is kept beside it (`<language>.json`, not in the project) as two hashes: of
 * the example it was made from, and of the copy as it was made. From them follow:
 * - no copy: it is made;
 * - a copy that is as it was made, from the example this app has: it is opened;
 * - a copy that is as it was made, from an older example: it is replaced by the new one;
 * - a copy that the writer changed: the writer decides, to go on with it or to start over (the
 *   old copy then goes to the trash).
 */

export type ExampleLanguage = 'de' | 'en'
export const EXAMPLE_LANGUAGES: readonly ExampleLanguage[] = ['de', 'en']

export interface ExampleDeps {
  /** Where the examples are, one folder per language: the app's resources, or the checkout. */
  examplesDir: string
  /** Where the copies are made, one folder per language, and their state files. */
  copiesDir: string
  trashItem: (absPath: string) => Promise<void>
}

export type ExampleOutcome =
  | { status: 'ready'; path: string }
  /** The copy has been changed: the writer chooses between `continue` and `fresh`. */
  | { status: 'modified'; path: string }

interface CopyState {
  /** The hash of the example the copy was made from. */
  made: string
  /** The hash of the copy as it was made. */
  copy: string
}

/** What the app itself writes into a project that was only opened: the versions and the export's files. */
const IGNORED = new Set(['_build', '.ezetta', '.DS_Store'])

/** A hash of a folder: every file's relative path and bytes, in a fixed order, without what the app writes by itself. */
export async function hashFolder(root: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (folder: string): Promise<void> => {
    const entries = (await readdir(join(root, folder), { withFileTypes: true }))
      .filter((entry) => !IGNORED.has(entry.name))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const relative = folder === '' ? entry.name : `${folder}/${entry.name}`
      if (entry.isDirectory()) {
        hash.update(`d:${relative}\n`)
        await walk(relative)
      } else if (entry.isFile()) {
        hash.update(`f:${relative}\n`)
        hash.update(await readFile(join(root, relative)))
        hash.update('\n')
      }
    }
  }
  await walk('')
  return hash.digest('hex')
}

const exists = (path: string): Promise<boolean> =>
  readdir(path).then(
    () => true,
    () => false,
  )

async function readState(file: string): Promise<CopyState | null> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<CopyState>
    return typeof raw.made === 'string' && typeof raw.copy === 'string'
      ? { made: raw.made, copy: raw.copy }
      : null
  } catch {
    return null
  }
}

/**
 * Makes sure there is a copy of the example in `language` to open, or says that the writer has
 * changed it. With `choice` the writer's answer to that question is carried out.
 */
export async function prepareExample(
  deps: ExampleDeps,
  language: ExampleLanguage,
  choice?: 'continue' | 'fresh',
): Promise<ExampleOutcome> {
  const source = join(deps.examplesDir, language)
  const target = join(deps.copiesDir, language)
  const stateFile = join(deps.copiesDir, `${language}.json`)
  if (!(await exists(source))) throw new Error(`The example project in ${language} is missing`)
  const made = await hashFolder(source)

  const makeCopy = async (): Promise<ExampleOutcome> => {
    await mkdir(deps.copiesDir, { recursive: true })
    await rm(target, { recursive: true, force: true })
    try {
      await cp(source, target, { recursive: true })
      await writeFile(stateFile, JSON.stringify({ made, copy: await hashFolder(target) }))
    } catch (cause) {
      // No half a copy: the next try starts clean.
      await rm(target, { recursive: true, force: true })
      await rm(stateFile, { force: true })
      throw cause
    }
    return { status: 'ready', path: target }
  }

  if (!(await exists(target))) return makeCopy()
  const state = await readState(stateFile)
  const changed = state === null || state.copy !== (await hashFolder(target))
  if (!changed) {
    if (state!.made === made) return { status: 'ready', path: target }
    // As it was made, from an older example: nothing of the writer's is in it.
    await deps.trashItem(target)
    return makeCopy()
  }
  if (choice === 'continue') return { status: 'ready', path: target }
  if (choice === 'fresh') {
    await deps.trashItem(target)
    return makeCopy()
  }
  return { status: 'modified', path: target }
}
