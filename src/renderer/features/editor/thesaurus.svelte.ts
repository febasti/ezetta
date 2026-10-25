import type { EditorView } from '@codemirror/view'
import { findSynonyms } from './synonyms'
import type { Synonyms, WordInContext } from './synonyms'

/**
 * The synonyms dialog: opened from the context menu for one word. It looks up the word,
 * or any word typed into its search, in the word's sentence, so every answer has the form that fits
 * there; a choice replaces the word. The first lookup starts the helper (Java and LanguageTool), which
 * takes a few seconds, so this happens here and the context menu itself never waits.
 */
class SynonymDialog {
  /** Whether the dialog is shown. */
  shown = $state(false)
  /** The word in the text, as it was when the dialog opened. */
  word = $state('')
  /** What is looked up now: the word, or what the writer typed. */
  query = $state('')
  busy = $state(false)
  /** The answer for `query`; null before the first answer, or when the lookup failed. */
  result = $state<Synonyms | null>(null)
  failed = $state(false)

  private view: EditorView | null = null
  private context: WordInContext | null = null
  private asked = 0

  /** Opens the dialog for a word and looks it up. */
  open(view: EditorView, context: WordInContext): void {
    this.view = view
    this.context = context
    this.word = context.text.slice(context.textFrom, context.textTo)
    this.result = null
    this.failed = false
    this.shown = true
    void this.search(this.word)
  }

  close(): void {
    this.shown = false
    this.view?.focus()
  }

  /** Looks up a word in the sentence of the word in the text. A later search wins over an earlier one. */
  async search(query: string): Promise<void> {
    const word = query.trim()
    this.query = word
    if (!this.context || !/^\p{L}[\p{L}\p{M}'’-]*$/u.test(word)) {
      this.result = word === '' ? null : { ok: false, reason: 'no_word' }
      return
    }
    const asked = ++this.asked
    this.busy = true
    const result = await findSynonyms(this.context, word).catch(() => null)
    if (asked !== this.asked) return
    this.busy = false
    this.failed = result === null
    this.result = result
  }

  /** Puts a synonym in place of the word, if the word is still where it was, and closes. */
  choose(text: string): void {
    const view = this.view
    const context = this.context
    if (view && context && view.state.sliceDoc(context.from, context.to) === this.word)
      view.dispatch({
        changes: { from: context.from, to: context.to, insert: text },
        selection: { anchor: context.from + text.length },
        scrollIntoView: true,
        userEvent: 'input.complete',
      })
    this.close()
  }
}

export const synonymDialog = new SynonymDialog()
