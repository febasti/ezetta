import { EditorSelection, Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { findMatches, replacementFor, replacementsFor } from '@core/search/search'
import type { SearchOptions, TextMatch } from '@core/search/search'
import { sourceText } from './source'

/**
 * Find and replace in the open sheet. The editor keeps the matches of the current query
 * and draws them; the bar around it (a Svelte component) only sets the query and asks for the next
 * match. Matches are found in the source text, so a match inside hidden syntax is selected like any
 * other, which reveals it.
 */

export interface SearchState {
  options: SearchOptions | null
  matches: readonly TextMatch[]
  /** Index of the match the bar points at, or -1. */
  current: number
  invalid: boolean
  truncated: boolean
}

const EMPTY: SearchState = {
  options: null,
  matches: [],
  current: -1,
  invalid: false,
  truncated: false,
}

/** Sets the query, or ends the search with null. */
const setSearch = StateEffect.define<SearchOptions | null>()
/** Points at the first match that starts at or after a position (wrapping around). */
const focusFrom = StateEffect.define<number>()
const focusIndex = StateEffect.define<number>()

function firstFrom(matches: readonly TextMatch[], pos: number): number {
  const at = matches.findIndex((m) => m.from >= pos)
  return at >= 0 ? at : matches.length > 0 ? 0 : -1
}

export const searchField = StateField.define<SearchState>({
  create: () => EMPTY,
  update(value, tr) {
    let options = value.options
    let anchor: number | null = null
    let index: number | null = null
    let recompute = tr.docChanged
    for (const effect of tr.effects) {
      if (effect.is(setSearch)) {
        options = effect.value
        recompute = true
        const before = value.matches[value.current]
        anchor = before ? tr.changes.mapPos(before.from, -1) : tr.state.selection.main.from
      } else if (effect.is(focusFrom)) anchor = effect.value
      else if (effect.is(focusIndex)) index = effect.value
    }
    if (!options) return value.options === null ? value : EMPTY
    let { matches, invalid, truncated } = value
    if (recompute) {
      const found = findMatches(sourceText(tr.state), options)
      matches = found.matches
      invalid = found.invalid
      truncated = found.truncated
      if (anchor === null) {
        const before = value.matches[value.current]
        anchor = before ? tr.changes.mapPos(before.from, -1) : tr.state.selection.main.from
      }
    }
    let current = value.current
    if (index !== null) current = Math.min(index, matches.length - 1)
    else if (anchor !== null) current = firstFrom(matches, anchor)
    if (matches === value.matches && current === value.current && options === value.options)
      return value
    return { options, matches, current, invalid, truncated }
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const { matches, current } = state.field(field)
      return Decoration.set(
        matches.map((m, i) =>
          Decoration.mark({
            class: i === current ? 'cm-search-match cm-search-current' : 'cm-search-match',
          }).range(m.from, m.to),
        ),
        true,
      )
    }),
})

export interface SearchConfig {
  /** Called with the new state whenever it changed, for the bar's counter. */
  onState: (state: SearchState) => void
}

const searchConfig = Facet.define<SearchConfig, SearchConfig>({
  combine: (values) => values[0] ?? { onState: () => {} },
})

const searchTheme = EditorView.baseTheme({
  '.cm-search-match': { backgroundColor: 'var(--color-selection)', borderRadius: 'var(--r-sm)' },
  '.cm-search-match.cm-search-current': {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
})

export function searchExtension(config: SearchConfig): Extension {
  return [
    searchConfig.of(config),
    searchField,
    searchTheme,
    EditorView.updateListener.of((update) => {
      const state = update.state.field(searchField)
      if (state !== update.startState.field(searchField)) config.onState(state)
    }),
  ]
}

// --- commands --------------------------------------------------------------------------------------------------

const stateOf = (view: EditorView): SearchState => view.state.field(searchField)

function scrollTo(match: TextMatch): StateEffect<unknown> {
  return EditorView.scrollIntoView(EditorSelection.range(match.from, match.to), { y: 'center' })
}

/** Sets the query. The first match from the caret on is pointed at and scrolled into view. */
export function setQuery(view: EditorView, options: SearchOptions | null): void {
  view.dispatch({ effects: setSearch.of(options) })
  const { matches, current } = stateOf(view)
  const match = matches[current]
  if (match) view.dispatch({ effects: scrollTo(match) })
}

/** Selects a match and scrolls to it. The text becomes the selection, so closing the bar leaves it there. */
function select(view: EditorView, index: number): void {
  const match = stateOf(view).matches[index]
  if (!match) return
  view.dispatch({
    selection: EditorSelection.range(match.from, match.to),
    effects: [focusIndex.of(index), scrollTo(match)],
    userEvent: 'select.search',
  })
}

/** Moves to the next or the previous match, starting from the current one and wrapping around. */
export function findNext(view: EditorView, forward: boolean): void {
  const { matches, current } = stateOf(view)
  if (matches.length === 0) return
  const sel = view.state.selection.main
  let index: number
  if (current >= 0 && matches[current]!.from === sel.from && matches[current]!.to === sel.to)
    index = (current + (forward ? 1 : -1) + matches.length) % matches.length
  else if (forward) index = firstFrom(matches, sel.to)
  else {
    index = matches.findLastIndex((m) => m.to <= sel.from)
    if (index < 0) index = matches.length - 1
  }
  select(view, index)
}

/** Replaces the current match and moves on to the next one. Returns false when there was none. */
export function replaceCurrent(view: EditorView, replacement: string): boolean {
  const { options, matches, current } = stateOf(view)
  const match = matches[current]
  if (!options || !match) return false
  const insert = replacementFor(view.state.doc.toString(), match, options, replacement)
  const end = match.from + insert.length
  view.dispatch({
    changes: { from: match.from, to: match.to, insert },
    selection: EditorSelection.cursor(end),
    effects: focusFrom.of(end),
    userEvent: 'input.replace',
  })
  const next = stateOf(view)
  if (next.current >= 0) select(view, next.current)
  return true
}

/** Replaces every match in one step (one undo). Returns how many were replaced. */
export function replaceAll(view: EditorView, replacement: string): number {
  const { options, matches } = stateOf(view)
  if (!options || matches.length === 0) return 0
  const changes = replacementsFor(view.state.doc.toString(), matches, options, replacement)
  view.dispatch({ changes, userEvent: 'input.replace' })
  return changes.length
}

/** Ends the search: the highlights go, and the current match stays selected. */
export function endSearch(view: EditorView): void {
  const { matches, current } = stateOf(view)
  const match = matches[current]
  view.dispatch({
    effects: setSearch.of(null),
    ...(match ? { selection: EditorSelection.range(match.from, match.to) } : {}),
  })
}

/** The text a new search starts with: the selection, when it is one line of text. */
export function selectedSearchText(state: EditorState): string {
  const { from, to } = state.selection.main
  const text = state.sliceDoc(from, to)
  return to - from > 0 && to - from <= 200 && !text.includes('\n') ? text : ''
}
