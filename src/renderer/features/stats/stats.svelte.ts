import { flattenSheets } from '@core/project/tree'
import type { StatusDto } from '@shared/project'
import { editor } from '../editor/editorSession.svelte'
import { project } from '../sidebar/project.svelte'

/** A reader takes about this many words a minute through academic prose. */
export const WORDS_PER_MINUTE = 200

export interface Counts {
  words: number
  footnoteWords: number
  footnotes: number
  figures: number
  tables: number
  /** Works cited, each once, and citations in all. */
  works: number
  citations: number
}

/** How many different values there are. */
const uniqueCount = (values: readonly string[]): number =>
  Object.keys(Object.fromEntries(values.map((v) => [v, true]))).length

const empty = (): Counts => ({
  words: 0,
  footnoteWords: 0,
  footnotes: 0,
  figures: 0,
  tables: 0,
  works: 0,
  citations: 0,
})

/**
 * What the Statistik tab shows: the open sheet, the selected group, and the project,
 * from the sheet statistics the sheets report when they are saved, with the open sheet's words read
 * from the editor so they follow what is typed.
 */
class StatsStore {
  /** The open sheet, or null without one. */
  sheet = $derived.by(() => {
    const node = editor.path ? project.node(editor.path) : null
    if (!node || node.kind !== 'sheet') return null
    return {
      node,
      counts: {
        words: editor.liveStats.words,
        footnoteWords: editor.liveStats.footnoteWords,
        footnotes: node.footnotes,
        figures: node.figures,
        tables: node.tables,
        works: uniqueCount(node.citations.map(([key]) => key)),
        citations: node.citations.length,
      } satisfies Counts,
    }
  })

  /** The sheets of the project that are in the export, and the ones that are not. */
  project = $derived.by(() => {
    const total = empty()
    const keys: Record<string, true> = {}
    const byStatus: Record<StatusDto, { sheets: number; words: number }> = {
      draft: { sheets: 0, words: 0 },
      revised: { sheets: 0, words: 0 },
      final: { sheets: 0, words: 0 },
    }
    let excludedWords = 0
    let excludedSheets = 0
    if (project.snapshot) {
      for (const { node } of flattenSheets(project.snapshot.tree)) {
        if (node.kind !== 'sheet') continue
        if (!node.inExport) {
          excludedWords += node.words
          excludedSheets += 1
          continue
        }
        total.words += node.words
        total.footnoteWords += node.footnoteWords
        total.footnotes += node.footnotes
        total.figures += node.figures
        total.tables += node.tables
        total.citations += node.citations.length
        for (const [key] of node.citations) keys[key] = true
        byStatus[node.status].sheets += 1
        byStatus[node.status].words += node.words
      }
    }
    total.works = Object.keys(keys).length
    return { counts: total, byStatus, excludedWords, excludedSheets }
  })

  group = $derived(project.currentGroup)
}

export const stats = new StatsStore()
