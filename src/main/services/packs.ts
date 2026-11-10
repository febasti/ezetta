import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { renameRetrying } from './rootedFs'

/**
 * Packing the version store. Every version adds a few loose objects (one file each), which after
 * a year of writing are tens of thousands of small files: slow to sync, copy and back up, and each
 * takes a whole block of the disk. Here they are moved into git packfiles (with their `.idx`),
 * which git and `isomorphic-git` read like loose objects.
 *
 * Written here rather than by `isomorphic-git`, whose packing compresses in JavaScript and holds
 * the main process for seconds: the zlib and SHA-1 here are Node's own. The packs have no deltas,
 * so two of them are merged by copying their entries. Large objects (images) stay loose:
 * `isomorphic-git` reads a whole pack into memory to read one object from it.
 *
 * Nothing is removed before what replaces it is written, renamed into place and read back object
 * by object; a crash in between leaves an object twice, never missing.
 */

/** Loose objects larger than this (as stored, compressed) stay loose. */
export const PACK_MAX_OBJECT = 512 * 1024
/** Loose objects are packed once there are this many. */
export const PACK_AFTER = 256
/** Packs are merged into one once there are more than this many. */
export const MERGE_AFTER = 8

const inflate = promisify(zlib.inflate)
const deflate = promisify(zlib.deflate)

const TYPE_NUMBER: Record<string, number> = { commit: 1, tree: 2, blob: 3, tag: 4 }
const TYPE_NAME = ['', 'commit', 'tree', 'blob', 'tag']
const IDX_MAGIC = 0xff744f63

/** One object as a packfile holds it: its header (type and size) and its compressed content. */
interface PackEntry {
  oid: string
  bytes: Buffer
}

interface LooseObject {
  oid: string
  path: string
  size: number
}

function entryHeader(type: number, size: number): Buffer {
  const out: number[] = []
  let byte = (type << 4) | (size & 0x0f)
  let rest = Math.floor(size / 16)
  while (rest > 0) {
    out.push(byte | 0x80)
    byte = rest & 0x7f
    rest = Math.floor(rest / 128)
  }
  out.push(byte)
  return Buffer.from(out)
}

function readEntryHeader(
  pack: Buffer,
  offset: number,
): { type: number; size: number; length: number } {
  let byte = pack[offset]!
  const type = (byte >> 4) & 7
  let size = byte & 0x0f
  let shift = 16
  let length = 1
  while (byte & 0x80) {
    byte = pack[offset + length]!
    size += (byte & 0x7f) * shift
    shift *= 128
    length += 1
  }
  return { type, size, length }
}

const sha1 = (...parts: Buffer[]): Buffer => {
  const hash = createHash('sha1')
  for (const part of parts) hash.update(part)
  return hash.digest()
}

/** The loose objects of a store: their ids, files and stored sizes. */
async function looseObjects(gitdir: string, withSizes: boolean): Promise<LooseObject[]> {
  const objects = join(gitdir, 'objects')
  const out: LooseObject[] = []
  for (const dir of await readdir(objects).catch(() => [] as string[])) {
    if (!/^[0-9a-f]{2}$/.test(dir)) continue
    for (const file of await readdir(join(objects, dir)).catch(() => [] as string[])) {
      if (!/^[0-9a-f]{38}$/.test(file)) continue
      const path = join(objects, dir, file)
      const size = withSizes
        ? await stat(path).then(
            (s) => s.size,
            () => -1,
          )
        : 0
      if (size >= 0) out.push({ oid: dir + file, path, size })
    }
  }
  return out
}

async function packFiles(gitdir: string): Promise<string[]> {
  const dir = join(gitdir, 'objects', 'pack')
  return (await readdir(dir).catch(() => [] as string[]))
    .filter((name) => /^pack-[0-9a-f]{40}\.idx$/.test(name))
    .map((name) => name.slice(0, -4))
    .sort()
}

/** Writes the entries as a pack and its index, under the pack's checksum. Returns the name. */
async function writePack(gitdir: string, entries: PackEntry[]): Promise<string> {
  const header = Buffer.alloc(12)
  header.write('PACK', 0, 'latin1')
  header.writeUInt32BE(2, 4)
  header.writeUInt32BE(entries.length, 8)
  const offsets = new Map<string, number>()
  let offset = 12
  for (const entry of entries) {
    offsets.set(entry.oid, offset)
    offset += entry.bytes.length
  }
  if (offset >= 0x80000000) throw new Error('pack too large')
  const body = Buffer.concat([header, ...entries.map((e) => e.bytes)])
  const checksum = sha1(body)
  const pack = Buffer.concat([body, checksum])

  const sorted = [...entries].sort((a, b) => (a.oid < b.oid ? -1 : a.oid > b.oid ? 1 : 0))
  const n = sorted.length
  const idx = Buffer.alloc(8 + 256 * 4 + n * 28 + 20)
  idx.writeUInt32BE(IDX_MAGIC, 0)
  idx.writeUInt32BE(2, 4)
  const fanout = new Array<number>(256).fill(0)
  for (const entry of sorted) fanout[parseInt(entry.oid.slice(0, 2), 16)]! += 1
  let total = 0
  for (let i = 0; i < 256; i += 1) {
    total += fanout[i]!
    idx.writeUInt32BE(total, 8 + i * 4)
  }
  const names = 8 + 256 * 4
  const crcs = names + n * 20
  const offsetTable = crcs + n * 4
  sorted.forEach((entry, i) => {
    Buffer.from(entry.oid, 'hex').copy(idx, names + i * 20)
    idx.writeUInt32BE(zlib.crc32(entry.bytes) >>> 0, crcs + i * 4)
    idx.writeUInt32BE(offsets.get(entry.oid)!, offsetTable + i * 4)
  })
  checksum.copy(idx, offsetTable + n * 4)
  const full = Buffer.concat([idx, sha1(idx)])

  const name = `pack-${checksum.toString('hex')}`
  const dir = join(gitdir, 'objects', 'pack')
  await mkdir(dir, { recursive: true })
  // The pack first, then its index: a reader looks for the index, and finds a whole pack behind it.
  for (const [ext, bytes] of [
    ['pack', pack],
    ['idx', full],
  ] as const) {
    const target = join(dir, `${name}.${ext}`)
    const temp = `${target}.${process.pid}.tmp`
    await writeFile(temp, bytes)
    await renameRetrying(temp, target)
  }
  return name
}

/**
 * Reads a pack written by `writePack` (or any pack without deltas): its entries, each checked
 * against its id. Null when the pack has deltas or does not hold what its index says.
 */
async function readPack(gitdir: string, name: string): Promise<PackEntry[] | null> {
  const dir = join(gitdir, 'objects', 'pack')
  const [pack, idx] = await Promise.all([
    readFile(join(dir, `${name}.pack`)),
    readFile(join(dir, `${name}.idx`)),
  ]).catch(() => [null, null])
  if (!pack || !idx) return null
  if (idx.readUInt32BE(0) !== IDX_MAGIC || idx.readUInt32BE(4) !== 2) return null
  if (pack.toString('latin1', 0, 4) !== 'PACK') return null
  const n = idx.readUInt32BE(8 + 255 * 4)
  if (pack.readUInt32BE(8) !== n) return null
  const names = 8 + 256 * 4
  const offsetTable = names + n * 24
  const located: { oid: string; offset: number }[] = []
  for (let i = 0; i < n; i += 1) {
    const offset = idx.readUInt32BE(offsetTable + i * 4)
    if (offset & 0x80000000) return null // a pack of 2 GB or more is not one of ours
    located.push({ oid: idx.toString('hex', names + i * 20, names + i * 20 + 20), offset })
  }
  located.sort((a, b) => a.offset - b.offset)
  const end = pack.length - 20
  const entries: PackEntry[] = []
  for (let i = 0; i < located.length; i += 1) {
    const { oid, offset } = located[i]!
    const bytes = pack.subarray(offset, i + 1 < located.length ? located[i + 1]!.offset : end)
    if (!(await entryHolds(bytes, oid))) return null
    entries.push({ oid, bytes })
  }
  return entries
}

/** Whether a pack entry is a whole object (not a delta) whose content has the given id. */
async function entryHolds(bytes: Buffer, oid: string): Promise<boolean> {
  const { type, size, length } = readEntryHeader(bytes, 0)
  const name = TYPE_NAME[type]
  if (!name) return false
  const content = await inflate(bytes.subarray(length)).catch(() => null)
  if (!content || content.length !== size) return false
  return sha1(Buffer.from(`${name} ${size}\0`), content).toString('hex') === oid
}

/** Packs the loose objects of a store once there are enough of them. True when it did. */
export async function packLoose(gitdir: string, after = PACK_AFTER): Promise<boolean> {
  if ((await looseObjects(gitdir, false)).length < after) return false
  const loose = (await looseObjects(gitdir, true)).filter((o) => o.size <= PACK_MAX_OBJECT)
  if (loose.length < after) return false
  const entries: PackEntry[] = []
  for (const object of loose) {
    const raw = await readFile(object.path)
      .then((bytes) => inflate(bytes))
      .catch(() => null)
    if (!raw) continue // gone, or not a whole object: it stays as it is
    const nul = raw.indexOf(0)
    const [type, size] = raw.toString('latin1', 0, nul).split(' ')
    const content = raw.subarray(nul + 1)
    if (TYPE_NUMBER[type ?? ''] === undefined || Number(size) !== content.length) continue
    if (sha1(raw).toString('hex') !== object.oid) continue
    const packed = await deflate(content)
    entries.push({
      oid: object.oid,
      bytes: Buffer.concat([entryHeader(TYPE_NUMBER[type!]!, content.length), packed]),
    })
  }
  if (entries.length === 0) return false
  const name = await writePack(gitdir, entries)
  const written = await readPack(gitdir, name)
  if (!written || written.length !== entries.length)
    throw new Error(`pack ${name} did not read back`)
  const packed = new Set(written.map((e) => e.oid))
  for (const object of loose) if (packed.has(object.oid)) await rm(object.path, { force: true })
  return true
}

/** Merges the packs of a store into one once there are more than `after`. True when it did. */
export async function mergePacks(gitdir: string, after = MERGE_AFTER): Promise<boolean> {
  const names = await packFiles(gitdir)
  if (names.length <= after) return false
  const merged = new Map<string, PackEntry>()
  const used: string[] = []
  for (const name of names) {
    const entries = await readPack(gitdir, name)
    if (!entries) continue // not one we can merge: it stays as it is
    used.push(name)
    for (const entry of entries) if (!merged.has(entry.oid)) merged.set(entry.oid, entry)
  }
  if (used.length < 2) return false
  const name = await writePack(gitdir, [...merged.values()])
  const written = await readPack(gitdir, name)
  if (!written || written.length !== merged.size) throw new Error(`pack ${name} did not read back`)
  const dir = join(gitdir, 'objects', 'pack')
  for (const old of used) {
    if (old === name) continue
    // The index first: a reader never finds an index without its pack.
    await rm(join(dir, `${old}.idx`), { force: true })
    await rm(join(dir, `${old}.pack`), { force: true })
  }
  return true
}
