import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'

export interface ZipFileEntry {
  /** The name inside the archive, with "/". */
  name: string
  method: number
  flags: number
  crc: number
  packed: number
  size: number
  /** Where the entry's local header is. */
  offset: number
}

/** More than this, and a zip is not a backup of a writing project. */
const MAX_ENTRIES = 200_000
const MAX_TOTAL_BYTES = 20 * 1024 * 1024 * 1024
const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

export class ZipError extends Error {}

/**
 * The relative path an entry's name stands for, or null when it must not be written: an absolute
 * path, a drive, a `..` segment, a backslash, or an empty name. This is the guard against an archive
 * that tries to write outside the folder it is unpacked into.
 */
export function safeEntryPath(name: string): string | null {
  if (name === '' || name.includes('\u0000') || name.includes('\\') || name.startsWith('/'))
    return null
  if (/^[A-Za-z]:/.test(name)) return null
  const parts = name.split('/').filter((part, i, all) => part !== '' || i === all.length - 1)
  if (parts.some((part) => part === '..' || part === '.')) return null
  return parts.join('/')
}

/** The entries of a zip file, from its central directory. Only what a backup needs: stored and deflated files, no encryption, no zip64. */
export async function listZip(path: string): Promise<ZipFileEntry[]> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const tailLength = Math.min(size, 22 + 0xffff)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, size - tailLength)
    let end = -1
    for (let i = tailLength - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        end = i
        break
      }
    }
    if (end < 0) throw new ZipError('Not a zip file')
    const count = tail.readUInt16LE(end + 10)
    const directorySize = tail.readUInt32LE(end + 12)
    const directoryOffset = tail.readUInt32LE(end + 16)
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff)
      throw new ZipError('Zip64 archives are not supported')
    if (count > MAX_ENTRIES) throw new ZipError('Too many files')
    if (directoryOffset + directorySize > size) throw new ZipError('The zip file is damaged')
    const directory = Buffer.alloc(directorySize)
    await handle.read(directory, 0, directorySize, directoryOffset)
    const entries: ZipFileEntry[] = []
    let at = 0
    for (let i = 0; i < count; i += 1) {
      if (at + 46 > directory.length || directory.readUInt32LE(at) !== CENTRAL_SIGNATURE)
        throw new ZipError('The zip file is damaged')
      const nameLength = directory.readUInt16LE(at + 28)
      const extra = directory.readUInt16LE(at + 30)
      const comment = directory.readUInt16LE(at + 32)
      entries.push({
        flags: directory.readUInt16LE(at + 8),
        method: directory.readUInt16LE(at + 10),
        crc: directory.readUInt32LE(at + 16),
        packed: directory.readUInt32LE(at + 20),
        size: directory.readUInt32LE(at + 24),
        offset: directory.readUInt32LE(at + 42),
        name: directory.subarray(at + 46, at + 46 + nameLength).toString('utf8'),
      })
      at += 46 + nameLength + extra + comment
    }
    return entries
  } finally {
    await handle.close()
  }
}

/** Where the data of an entry starts: behind its local header, whose name and extra field can differ from the directory's. */
async function dataStart(zipPath: string, entry: ZipFileEntry): Promise<number> {
  const handle = await open(zipPath, 'r')
  try {
    const header = Buffer.alloc(30)
    await handle.read(header, 0, 30, entry.offset)
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new ZipError('The zip file is damaged')
    return entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
  } finally {
    await handle.close()
  }
}

/**
 * Unpacks a zip into `destination` (which must not hold the files already). Every name is checked
 * (`safeEntryPath`), every file's size and checksum are verified, and nothing is written outside
 * the folder. Throws on the first problem; the caller removes what was written (it unpacks into a
 * temporary folder).
 */
export async function extractZip(
  zipPath: string,
  destination: string,
  signal?: AbortSignal,
): Promise<{ files: number; bytes: number }> {
  const entries = await listZip(zipPath)
  const root = resolve(destination)
  let total = 0
  let files = 0
  for (const entry of entries) {
    signal?.throwIfAborted()
    const relative = safeEntryPath(entry.name)
    if (relative === null) throw new ZipError(`An unsafe name in the archive: ${entry.name}`)
    if (relative.endsWith('/')) continue // a folder: made when a file needs it
    if (entry.flags & 1) throw new ZipError('The archive is encrypted')
    if (entry.method !== 0 && entry.method !== 8)
      throw new ZipError(`Unsupported compression in ${entry.name}`)
    total += entry.size
    if (total > MAX_TOTAL_BYTES) throw new ZipError('The archive is too large')
    const target = resolve(root, ...relative.split('/'))
    if (target !== root && !target.startsWith(root + sep))
      throw new ZipError(`An unsafe name in the archive: ${entry.name}`)
    await mkdir(dirname(target), { recursive: true })

    let crc = 0
    let written = 0
    const check = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        crc = zlib.crc32(chunk, crc)
        written += chunk.length
        // A bomb: more data than the directory says.
        if (written > entry.size) done(new ZipError(`${entry.name} is larger than it says`))
        else done(null, chunk)
      },
    })
    const start = await dataStart(zipPath, entry)
    if (entry.packed === 0) {
      // An empty file stored without data: nothing to read.
      await writeFile(target, '', { flag: 'wx' })
    } else {
      const input = createReadStream(zipPath, { start, end: start + entry.packed - 1 })
      const stages: (NodeJS.ReadableStream | NodeJS.WritableStream)[] =
        entry.method === 8 ? [input, zlib.createInflateRaw(), check] : [input, check]
      await pipeline([...stages, createWriteStream(target, { flags: 'wx' })] as never, { signal })
    }
    if (written !== entry.size || crc >>> 0 !== entry.crc)
      throw new ZipError(`${entry.name} is damaged`)
    files += 1
  }
  return { files, bytes: total }
}

/** The one folder that holds every file of the archive, or null when the files are not all in one. */
export function commonTopFolder(entries: readonly ZipFileEntry[]): string | null {
  let top: string | null = null
  for (const entry of entries) {
    const path = safeEntryPath(entry.name)
    if (path === null) continue
    const first = path.split('/')[0]!
    if (!path.includes('/') && !path.endsWith('/')) return null // a file at the top
    if (top === null) top = first
    else if (top !== first) return null
  }
  return top
}
