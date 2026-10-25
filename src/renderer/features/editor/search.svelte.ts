import type { SearchOptions } from '@core/search/search'
import {
  endSearch,
  findNext,
  replaceAll,
  replaceCurrent,
  selectedSearchText,
  setQuery,
} from '../../editor/search'
import type { SearchState } from '../../editor/search'
import { i18n } from '../../i18n/i18n.svelte'
import { notify } from '../../lib/ui.svelte'
import { editor } from './editorSession.svelte'

/** The find and replace bar for the open sheet. The editor holds the matches. */
class SearchStore {
  open = $state(false)
  /** The replace row is showing. */
  replaceOpen = $state(false)
  query = $state('')
  replacement = $state('')
  caseSensitive = $state(false)
  wholeWord = $state(false)
  regexp = $state(false)
  /** Counts up each time the bar asks for the query field, so it can take the focus. */
  focusTick = $state(0)

  count = $state(0)
  /** Position of the current match, 1 and up, or 0. */
  position = $state(0)
  invalid = $state(false)
  truncated = $state(false)

  constructor() {
    // A sheet that opens while the bar is open is searched for the same query.
    editor.onAttach(() => {
      if (this.open) this.apply()
    })
  }

  private get options(): SearchOptions {
    return {
      query: this.query,
      caseSensitive: this.caseSensitive,
      wholeWord: this.wholeWord,
      regexp: this.regexp,
    }
  }

  /** The editor tells the bar what it found. */
  receive(state: SearchState): void {
    this.count = state.matches.length
    this.position = state.current >= 0 ? state.current + 1 : 0
    this.invalid = state.invalid
    this.truncated = state.truncated
  }

  /** Opens the bar. A selected line of text becomes the query. */
  show(replace = false): void {
    const view = editor.view
    if (!view) return
    const selected = selectedSearchText(view.state)
    if (selected) this.query = selected
    this.open = true
    if (replace) this.replaceOpen = true
    this.focusTick += 1
    this.apply()
  }

  close(): void {
    if (!this.open) return
    this.open = false
    const view = editor.view
    if (view) endSearch(view)
    this.count = 0
    this.position = 0
    editor.focus()
  }

  /** Sends the query to the editor (after the query or an option changed). */
  apply(): void {
    const view = editor.view
    if (view) setQuery(view, this.query === '' ? null : this.options)
    if (this.query === '')
      this.receive({ options: null, matches: [], current: -1, invalid: false, truncated: false })
  }

  next(forward = true): void {
    if (!this.open) return this.show()
    const view = editor.view
    if (view) findNext(view, forward)
  }

  replaceOne(): void {
    const view = editor.view
    if (view) replaceCurrent(view, this.replacement)
  }

  replaceEverything(): void {
    const view = editor.view
    if (!view) return
    const count = replaceAll(view, this.replacement)
    if (count > 0) notify('info', i18n.t('search.replaced', { count }))
  }
}

export const search = new SearchStore()
