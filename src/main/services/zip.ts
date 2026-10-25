import { createReadStream, createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import zlib from 'node:zlib'

/** A file to put in the archive: where it is, and what it is called inside (with "/"). */
export interface ZipEntry {
  name: string
  path: string
  /** Modification time in milliseconds. */
  mtime: number
  /** Put the file in as it is, without compressing it: for files that are compressed already (images, other archives). */
  store?: boolean
}

const STORED = 0
const DEFLATED = 8

/** Whether compressing a file would only cost time: it is an image, a PDF, an archive or a stored git object. */
export function isCompressedAlready(name: string): boolean {
  return (
    /\.(png|jpe?g|gif|webp|heic|avif|pdf|zip|gz|bz2|xz|7z|mp3|mp4|m4a|mov|woff2?)$/i.test(name) ||
    /(^|\/)\.ezetta\/history\.git\/objects\//.test(name)
  )
}

const LOCAL_SIGNATURE = 0x04034b50
const DESCRIPTOR_SIGNATURE = 0x08074b50
const CENTRAL_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50
/** Bit 3: sizes and checksum follow the data. Bit 11: the name is UTF-8. */
const FLAGS = 0x0808
const MAX_32 = 0xffffffff

/** The date and time of a file in the two 16-bit words of the zip format (local time, 2-second steps). */
function dosTime(ms: number): { time: number; date: number } {
  const d = new Date(Math.max(ms, Date.UTC(1980, 0, 2)))
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

async function write(out: WriteStream, data: Buffer): Promise<void> {
  if (!out.write(data)) await once(out, 'drain')
}

/**
 * Writes a zip archive of files, one after the other, without holding a file in memory: each is
 * compressed as a stream, and its size and checksum are written behind it (a data descriptor), as
 * every zip program reads. Not for archives over 4 GB or 65,535 files (it throws instead of writing
 * a broken one). The archive is written to `destination` directly: the caller makes it a temporary
 * name and renames it when this has finished. `signal` stops it.
 */
export async function writeZip(
  destination: string,
  entries: readonly ZipEntry[],
  signal?: AbortSignal,
): Promise<{ files: number; bytes: number }> {
  if (entries.length > 0xffff) throw new Error('Too many files for a zip archive')
  signal?.throwIfAborted()
  const out = createWriteStream(destination)
  const failed = new Promise<never>((_, reject) => out.once('error', reject))
  failed.catch(() => undefined)
  const central: Buffer[] = []
  let offset = 0
  let bytes = 0
  const put = async (data: Buffer): Promise<void> => {
    await Promise.race([write(out, data), failed])
    offset += data.length
    if (offset > MAX_32) throw new Error('The archive is too large for the zip format')
  }
  try {
    for (const entry of entries) {
      signal?.throwIfAborted()
      const name = Buffer.from(entry.name, 'utf8')
      const { time, date } = dosTime(entry.mtime)
      const headerOffset = offset
      const stored = entry.store === true
      // A stored file's checksum is read first, so its header is complete and every reader can follow
      // it; a compressed one has its checksum and sizes written behind it.
      let storedCrc = 0
      let storedSize = 0
      if (stored) {
        for await (const chunk of createReadStream(entry.path)) {
          storedCrc = zlib.crc32(chunk as Buffer, storedCrc)
          storedSize += (chunk as Buffer).length
        }
        if (storedSize > MAX_32) throw new Error('A file is too large for the zip format')
      }
      const flags = stored ? 0x0800 : FLAGS
      const local = Buffer.alloc(30)
      local.writeUInt32LE(LOCAL_SIGNATURE, 0)
      local.writeUInt16LE(20, 4) // version needed
      local.writeUInt16LE(flags, 6)
      local.writeUInt16LE(stored ? STORED : DEFLATED, 8)
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(date, 12)
      if (stored) {
        local.writeUInt32LE(storedCrc, 14)
        local.writeUInt32LE(storedSize, 18)
        local.writeUInt32LE(storedSize, 22)
      } // otherwise the checksum and sizes (offsets 14 to 25) follow the data
      local.writeUInt16LE(name.length, 26)
      await put(Buffer.concat([local, name]))

      let crc = 0
      let size = 0
      let packed = 0
      const measure = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          crc = zlib.crc32(chunk, crc)
          size += chunk.length
          done(null, chunk)
        },
      })
      const count = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          packed += chunk.length
          done(null, chunk)
        },
      })
      // The compressed data goes to the archive in pieces, written through `put` so the offset is right.
      const sink = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          put(Buffer.from(chunk)).then(
            () => done(),
            (cause) => done(cause as Error),
          )
        },
      })
      if (stored) {
        await pipeline(createReadStream(entry.path), measure, count, sink, { signal })
        // The file changed while it was being read: the header's checksum no longer fits.
        if (size !== storedSize || crc >>> 0 !== storedCrc >>> 0)
          throw new Error(`${entry.name} changed while it was being backed up`)
      } else {
        await pipeline(
          createReadStream(entry.path),
          measure,
          zlib.createDeflateRaw({ level: 6 }),
          count,
          sink,
          { signal },
        )
        if (size > MAX_32 || packed > MAX_32)
          throw new Error('A file is too large for the zip format')

        const descriptor = Buffer.alloc(16)
        descriptor.writeUInt32LE(DESCRIPTOR_SIGNATURE, 0)
        descriptor.writeUInt32LE(crc, 4)
        descriptor.writeUInt32LE(packed, 8)
        descriptor.writeUInt32LE(size, 12)
        await put(descriptor)
      }
      bytes += size

      const entryRecord = Buffer.alloc(46)
      entryRecord.writeUInt32LE(CENTRAL_SIGNATURE, 0)
      entryRecord.writeUInt16LE(20, 4) // made by
      entryRecord.writeUInt16LE(20, 6) // version needed
      entryRecord.writeUInt16LE(flags, 8)
      entryRecord.writeUInt16LE(stored ? STORED : DEFLATED, 10)
      entryRecord.writeUInt16LE(time, 12)
      entryRecord.writeUInt16LE(date, 14)
      entryRecord.writeUInt32LE(crc, 16)
      entryRecord.writeUInt32LE(packed, 20)
      entryRecord.writeUInt32LE(size, 24)
      entryRecord.writeUInt16LE(name.length, 28)
      entryRecord.writeUInt32LE(headerOffset, 42)
      central.push(Buffer.concat([entryRecord, name]))
    }
    const directoryOffset = offset
    const directory = Buffer.concat(central)
    await put(directory)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(END_SIGNATURE, 0)
    end.writeUInt16LE(central.length, 8)
    end.writeUInt16LE(central.length, 10)
    end.writeUInt32LE(directory.length, 12)
    end.writeUInt32LE(directoryOffset, 16)
    await put(end)
    out.end()
    await Promise.race([once(out, 'finish'), failed])
    return { files: entries.length, bytes }
  } catch (cause) {
    // Closed before the caller removes the file: a stream that is still opening would make it again.
    const closed = out.closed ? Promise.resolve() : once(out, 'close')
    out.destroy()
    await closed.catch(() => undefined)
    throw cause
  }
}
