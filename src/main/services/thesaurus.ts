import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEntry } from '@core/thesaurus/entry'
import type { Sense } from '@core/thesaurus/entry'
import type { ThesaurusLanguage, ThesaurusPort } from '@core/thesaurus/lookup'

/**
 * The thesaurus files in the MyThes format: one headword line, then its senses. A file is
 * read once, when it is first needed, and indexed by the bytes where each entry starts, so an entry
 * is cut out of the buffer without decoding the rest.
 */

const FILES: Record<ThesaurusLanguage, string> = {
  de: 'th_de_DE_v2.dat',
  en: 'th_en_US_v2.dat',
}

interface Loaded {
  buffer: Buffer
  /** Where each headword's line starts, and where its entry ends. */
  index: Map<string, [number, number]>
}

/** Finds the entries in the file's bytes: `word|n`, then n lines. The first line names the encoding. */
export function indexThesaurus(buffer: Buffer): Map<string, [number, number]> {
  const index = new Map<string, [number, number]>()
  const lineEnd = (from: number): number => {
    const at = buffer.indexOf(10, from)
    return at < 0 ? buffer.length : at
  }
  let pos = lineEnd(0) + 1 // the encoding line
  while (pos < buffer.length) {
    const end = lineEnd(pos)
    const line = buffer.toString('utf8', pos, end)
    const bar = line.lastIndexOf('|')
    const count = bar < 0 ? NaN : Number(line.slice(bar + 1).trim())
    if (!Number.isInteger(count)) {
      pos = end + 1
      continue
    }
    let entryEnd = end
    for (let i = 0; i < count && entryEnd < buffer.length; i += 1) entryEnd = lineEnd(entryEnd + 1)
    const word = line.slice(0, bar)
    // A word that occurs twice keeps its first entry.
    if (!index.has(word)) index.set(word, [pos, entryEnd])
    pos = entryEnd + 1
  }
  return index
}

/** The thesaurus of the files in `dir`, or an empty one when the folder is not there. */
export function createThesaurusStore(options: {
  dir: string | null
  read?: (path: string) => Promise<Buffer>
}): ThesaurusPort {
  const read = options.read ?? ((path: string) => readFile(path))
  const loading = new Map<ThesaurusLanguage, Promise<Loaded | null>>()

  const load = (language: ThesaurusLanguage): Promise<Loaded | null> => {
    const kept = loading.get(language)
    if (kept) return kept
    const pending = (async (): Promise<Loaded | null> => {
      if (!options.dir) return null
      try {
        const buffer = await read(join(options.dir, FILES[language]))
        return { buffer, index: indexThesaurus(buffer) }
      } catch {
        return null
      }
    })()
    loading.set(language, pending)
    return pending
  }

  return {
    async entry(language, headword): Promise<Sense[] | null> {
      const loaded = await load(language)
      const span = loaded?.index.get(headword)
      if (!loaded || !span) return null
      return parseEntry(loaded.buffer.toString('utf8', span[0], span[1]))?.senses ?? null
    },
  }
}
