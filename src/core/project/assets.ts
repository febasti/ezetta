import { nameKey } from './paths'

/**
 * Image files that come into a project (images live in `assets/`). The type is read from
 * the file's own first bytes, never from its name, so a file that only claims to be an image is
 * refused. Names are made safe and unique, so an import never overwrites a file.
 */

export const ASSETS_DIR = 'assets'
/** Largest image accepted, in bytes. */
export const MAX_ASSET_BYTES = 30 * 1024 * 1024

export type ImageType = 'png' | 'jpg' | 'gif' | 'webp' | 'svg'

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((byte, i) => bytes[at + i] === byte)

/** The image type of a file, from its bytes, or null when it is not a supported image. */
export function imageTypeOf(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  )
    return 'gif'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp'
  // SVG is text: look for an <svg element near the start (after an optional BOM, prolog, or comments).
  let head = ''
  for (let i = 0; i < Math.min(bytes.length, 4096); i += 1) head += String.fromCharCode(bytes[i]!)
  if (/<svg[\s>]/i.test(head)) return 'svg'
  return null
}

/**
 * A file name for an imported image: the suggested name made safe (letters, digits, and dashes),
 * with the extension that belongs to the real type, and unique among `taken` (compared like a case
 * insensitive file system does).
 */
export function assetFileName(suggested: string, type: ImageType, taken: Iterable<string>): string {
  const withoutPath = suggested.split(/[\\/]/).pop() ?? suggested
  const base = withoutPath.replace(/\.[^.]*$/, '')
  const slug =
    (base.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []).join('-').slice(0, 60) || 'bild'
  const used = new Set([...taken].map(nameKey))
  let name = `${slug}.${type}`
  for (let n = 2; used.has(nameKey(name)); n += 1) name = `${slug}-${n}.${type}`
  return name
}
