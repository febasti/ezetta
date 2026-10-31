/** Pure path helpers. Paths inside a project always use "/" and are relative: manifest keys are
 * relative to `content/`, file-system port paths are relative to the project root. */

export const CONTENT_DIR = 'content'
/** The folder next to `content/` that holds the material: folders that are not part of the document. */
export const MATERIAL_DIR = 'material'
/**
 * Where the material is in the tree of the project: a folder named like this (no name a writer can
 * give has a colon) that stands for `material/`, with the folders of the material as its children.
 * Every path of the tree is made of it and the rest, so moving, renaming and the order lists need
 * nothing of their own; `projectFile` says which file a path is.
 */
export const MATERIAL = ':material'
export const MANIFEST_FILE = 'project.toml'
export const SHEET_EXT = '.typ'

export const join = (...parts: string[]): string => parts.filter((p) => p !== '').join('/')

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** True when `path` equals `ancestor` or lies below it. The empty path is every path's ancestor. */
export function isSameOrBelow(path: string, ancestor: string): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(`${ancestor}/`)
}

/** Replaces the leading `from` of `path` with `to` (used when a group moves or is renamed). */
export function rebase(path: string, from: string, to: string): string {
  return path === from ? to : join(to, path.slice(from.length + 1))
}

export const isMaterial = (path: string): boolean =>
  path === MATERIAL || path.startsWith(`${MATERIAL}/`)

/** The file or folder of the project (from its root) that a path of the tree is. */
export function projectFile(path: string): string {
  return isMaterial(path)
    ? join(MATERIAL_DIR, path.slice(MATERIAL.length + 1))
    : join(CONTENT_DIR, path)
}

/** The path of the tree for a path of the project (from its root), or null for a file that is not of the tree. */
export function treePathOf(file: string): string | null {
  if (file.startsWith(`${CONTENT_DIR}/`)) return file.slice(CONTENT_DIR.length + 1)
  if (file.startsWith(`${MATERIAL_DIR}/`))
    return join(MATERIAL, file.slice(MATERIAL_DIR.length + 1))
  return null
}

export const isSheetFile = (name: string): boolean =>
  name.toLowerCase().endsWith(SHEET_EXT) && name.length > SHEET_EXT.length

export const sheetTitle = (fileName: string): string =>
  isSheetFile(fileName) ? fileName.slice(0, -SHEET_EXT.length) : fileName

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * The file name of a new sheet: `s-` and six letters or digits, like `s-k4x9tm`. The
 * name says nothing about the content and never changes, because the app shows the sheet by its
 * first lines and not by its file. `taken` says whether a name is in use; `random` is for tests.
 */
export function newSheetName(taken: (name: string) => boolean, random = Math.random): string {
  for (;;) {
    let id = 's-'
    for (let i = 0; i < 6; i += 1) id += ID_CHARS[Math.floor(random() * ID_CHARS.length)]
    if (!taken(id)) return id
  }
}

export type NameError = 'empty' | 'too_long' | 'forbidden_character' | 'reserved'

/** Names Windows keeps for devices, with or without an extension ("con", "NUL.txt", "COM¹"). */
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\.|$)/i

/** Names of groups and sheets: human readable, valid on macOS, Windows, and Linux. */
export function validateName(name: string): NameError | null {
  if (name.trim() === '') return 'empty'
  if (name.length > 120) return 'too_long'
  if (/[\\/:*?"<>|]/.test(name) || [...name].some((c) => c.charCodeAt(0) < 32))
    return 'forbidden_character'
  if (name.startsWith('.') || name !== name.trim() || name.endsWith('.')) return 'reserved'
  if (DEVICE_NAME.test(name)) return 'reserved'
  return null
}

/** Rejects anything that is not a plain relative path made of safe segments. */
export function isSafeRelativePath(path: string): boolean {
  if (path === '') return true
  return path
    .split('/')
    .every(
      (segment) =>
        segment !== '' &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes('\\') &&
        !segment.includes('\u0000'),
    )
}

/** Case-insensitive, normalization-insensitive key, so names clash the way macOS file systems do. */
export const nameKey = (name: string): string => name.normalize('NFC').toLowerCase()

/** Natural ordering for items that appear on disk but not in the manifest. */
export const compareNames = (a: string, b: string): number =>
  a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
