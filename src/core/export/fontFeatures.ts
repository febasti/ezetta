/**
 * Whether a font file has real small caps, which Typst's `smallcaps` asks for (it never makes them
 * up): the OpenType feature `smcp` in its GSUB table, or in Apple's own substitution table
 * (`morx`) the feature Typst maps it to (lower case to small caps, type 37 setting 1, or the older
 * letter case small caps, type 3 setting 3). Only the table directory and the feature lists are
 * read, through `read`, so a large file is not loaded whole.
 */

export type SmallCaps = 'yes' | 'no' | 'unknown'

/** Reads `length` bytes at `offset` of the file (fewer at its end). */
export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>

const tag = (b: Uint8Array, at: number): string =>
  String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!)
const u16 = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!
const u32 = (b: Uint8Array, at: number): number =>
  ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!

/** The feature tags of the GSUB table of the font that starts at `start` (a collection has several). */
async function faceFeatures(read: ReadAt, start: number): Promise<Set<string> | null> {
  const head = await read(start, 12)
  if (head.length < 12) return null
  const tables = u16(head, 4)
  if (tables === 0 || tables > 200) return null
  const dir = await read(start + 12, tables * 16)
  if (dir.length < tables * 16) return null
  let gsub: number | null = null
  let morx: number | null = null
  for (let i = 0; i < tables; i += 1) {
    const name = tag(dir, i * 16)
    if (name === 'GSUB') gsub = u32(dir, i * 16 + 8)
    if (name === 'morx') morx = u32(dir, i * 16 + 8)
  }
  const features = gsub === null ? new Set<string>() : await gsubFeatures(read, gsub)
  if (features === null) return null
  if (morx !== null && (await morxSmallCaps(read, morx))) features.add('smcp')
  return features
}

/** The feature tags of a GSUB table. */
async function gsubFeatures(read: ReadAt, at: number): Promise<Set<string> | null> {
  const header = await read(at, 10)
  if (header.length < 10) return null
  const listAt = at + u16(header, 6)
  const count = u16(await read(listAt, 2), 0)
  if (count > 5000) return null
  const records = await read(listAt + 2, count * 6)
  const features = new Set<string>()
  for (let i = 0; i + 6 <= records.length; i += 6) features.add(tag(records, i))
  return features
}

/** Whether a `morx` table (version 2 or 3) offers small caps in one of its chains. */
async function morxSmallCaps(read: ReadAt, at: number): Promise<boolean> {
  const header = await read(at, 8)
  if (header.length < 8 || u16(header, 0) < 2) return false
  const chains = Math.min(u32(header, 4), 64)
  let chainAt = at + 8
  for (let c = 0; c < chains; c += 1) {
    const chain = await read(chainAt, 16)
    if (chain.length < 16) return false
    const length = u32(chain, 4)
    const entries = Math.min(u32(chain, 8), 2000)
    const list = await read(chainAt + 16, entries * 12)
    for (let i = 0; i + 12 <= list.length; i += 12) {
      const type = u16(list, i)
      const setting = u16(list, i + 2)
      if ((type === 37 && setting === 1) || (type === 3 && setting === 3)) return true
    }
    if (length < 16) return false
    chainAt += length
  }
  return false
}

/**
 * Whether the font file (a single font, or a collection, where any face with small caps counts)
 * has the `smcp` feature. A file that cannot be read is "unknown".
 */
export async function smallCapsOf(read: ReadAt): Promise<SmallCaps> {
  try {
    const first = await read(0, 12)
    if (first.length < 12) return 'unknown'
    const starts: number[] = []
    if (tag(first, 0) === 'ttcf') {
      const faces = Math.min(u32(first, 8), 64)
      const offsets = await read(12, faces * 4)
      for (let i = 0; i + 4 <= offsets.length; i += 4) starts.push(u32(offsets, i))
    } else starts.push(0)
    let unknown = false
    for (const start of starts) {
      const features = await faceFeatures(read, start)
      if (features === null) unknown = true
      else if (features.has('smcp')) return 'yes'
    }
    return unknown ? 'unknown' : 'no'
  } catch {
    return 'unknown'
  }
}

/** The families Typst brings: what their small caps are, since they have no file to read. */
export const EMBEDDED_SMALL_CAPS: Readonly<Record<string, SmallCaps>> = {
  'Libertinus Serif': 'yes',
  'New Computer Modern': 'yes',
  'New Computer Modern Math': 'no',
  'DejaVu Sans Mono': 'no',
}
