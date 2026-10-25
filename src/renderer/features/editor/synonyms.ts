import type { EditorView } from '@codemirror/view'
import { proofUnits } from '@core/proof/extract'
import type { Gender } from '@core/thesaurus/lookup'
import type { synonymResultSchema } from '@shared/thesaurus'
import type { z } from 'zod'
import { fullTree, sourceText } from '../../editor/source'
import { proof } from '../proof/proof.svelte'
import { standInsOf } from './proofing'

/** A word in the text, with the paragraph it is in as the thesaurus reads it. */
export interface WordInContext {
  /** The word's place in the source, for replacing it. */
  from: number
  to: number
  /** The paragraph as plain text, and the word's place in it. */
  text: string
  textFrom: number
  textTo: number
}

const WORD_CHAR = /[\p{L}\p{M}'’-]/u

/** The word the click or the selection is on: the selection if it is one word, else the word around `pos`. */
function wordRange(view: EditorView, pos: number): { from: number; to: number } | null {
  const { from, to, empty } = view.state.selection.main
  const word = /^\p{L}[\p{L}\p{M}'’-]*$/u
  if (!empty) return word.test(view.state.sliceDoc(from, to)) ? { from, to } : null
  const line = view.state.doc.lineAt(pos)
  let start = pos
  let end = pos
  while (start > line.from && WORD_CHAR.test(view.state.sliceDoc(start - 1, start))) start -= 1
  while (end < line.to && WORD_CHAR.test(view.state.sliceDoc(end, end + 1))) end += 1
  // Marks around a word are not part of it.
  while (start < end && /['’-]/.test(view.state.sliceDoc(start, start + 1))) start += 1
  while (end > start && /['’-]/.test(view.state.sliceDoc(end - 1, end))) end -= 1
  return start < end ? { from: start, to: end } : null
}

/**
 * The word at `pos` and its paragraph in plain text: citations, references, and formulas stand for
 * words, markup is left out, so the grammar of the sentence reads as it will in the PDF. Null where
 * the word is not prose (code, a comment, a note's marker).
 */
export function wordInContext(view: EditorView, pos: number): WordInContext | null {
  const range = wordRange(view, pos)
  if (!range) return null
  const state = view.state
  const tree = fullTree(state)
  const doc = sourceText(state)
  const unit = proofUnits(tree, doc, standInsOf(state)).find(
    (u) => u.from <= range.from && range.to <= u.to,
  )
  if (!unit) return null
  let text = ''
  let source = unit.from
  let found: [number, number] | null = null
  for (const part of unit.annotation) {
    if ('text' in part) {
      if (source <= range.from && range.to <= source + part.text.length)
        found = [text.length + (range.from - source), text.length + (range.to - source)]
      text += part.text
      source += part.text.length
    } else {
      text += part.interpretAs ?? ''
      source += part.markup.length
    }
  }
  return found ? { ...range, text, textFrom: found[0], textTo: found[1] } : null
}

export type Synonyms = z.infer<typeof synonymResultSchema>

/**
 * Asks for the synonyms of the word in its paragraph, or of another word (`instead`) put in its
 * place, so the answers take the form the sentence needs there too. Null if the call failed.
 */
export async function findSynonyms(
  context: WordInContext,
  instead?: string,
): Promise<Synonyms | null> {
  const word = instead ?? context.text.slice(context.textFrom, context.textTo)
  const text = context.text.slice(0, context.textFrom) + word + context.text.slice(context.textTo)
  const from = context.textFrom
  const to = from + word.length
  // A very long paragraph is cut around the word: the sentence is what matters.
  const reach = 3000
  const cutFrom = Math.max(0, from - reach)
  const cutTo = Math.min(text.length, to + reach)
  const result = await window.api.thesaurus.synonyms({
    language: proof.settings.language,
    text: text.slice(cutFrom, cutTo),
    from: from - cutFrom,
    to: to - cutFrom,
  })
  return result.ok ? result.value : null
}

/** The article a noun of another gender takes, shown next to it. */
export const ARTICLE: Record<Gender, string> = { MAS: 'der', FEM: 'die', NEU: 'das' }
