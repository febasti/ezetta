import { syntaxTree } from '@codemirror/language'
import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { BibEntry } from '@core/bib/bibtex'
import {
  citationAt,
  groupOf,
  missingAt,
  scanCitations,
  scanMissingCitations,
} from '@core/typst/citations'
import type { Citation, MissingCitation } from '@core/typst/citations'
import { fullTree, sourceText } from './source'

export interface CiteConfig {
  /** The works of the bibliography, by key. */
  lookup: (key: string) => BibEntry | undefined
  /** All of them, for the `@` menu. */
  all: () => readonly BibEntry[]
  /** The language of the text: it decides "und" or "and", "o. J." or "n.d.". */
  language: string
  labels: {
    aria: (text: string) => string
    missing: (key: string) => string
    /** The chip of a place that still needs a citation. */
    needed: string
    /** The tooltip of a citation marked for checking. */
    check: (note: string | null) => string
    /** The tooltip of a citation that prints nothing in the text. */
    unprinted: string
  }
  /** Entries of the bibliography file that could not be read: the editor warns that works may be missing. */
  problems: () => readonly string[]
  /** Opens a citation for editing. By default the popover; the continuous view opens the sheet. */
  onOpen?: (view: EditorView, from: number) => void
}

const DEFAULT_CONFIG: CiteConfig = {
  lookup: () => undefined,
  all: () => [],
  language: 'de',
  problems: () => [],
  labels: {
    aria: (text) => text,
    missing: (key) => key,
    needed: '',
    check: (note) => note ?? '',
    unprinted: '',
  },
}

export const citeConfig = Facet.define<Partial<CiteConfig>, CiteConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as CiteConfig,
})

function compute(state: EditorState): readonly Citation[] {
  const tree = fullTree(state)
  return scanCitations(tree, sourceText(state))
}

/** The citations of the document, rebuilt when the text or the syntax changes. */
export const citeField = StateField.define<readonly Citation[]>({
  create: (state) => compute(state),
  update: (value, tr) =>
    tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? compute(tr.state) : value,
})

function computeMissing(state: EditorState): readonly MissingCitation[] {
  const tree = fullTree(state)
  return scanMissingCitations(tree, sourceText(state))
}

/** The places that still need a citation, rebuilt when the text or the syntax changes. */
export const missingField = StateField.define<readonly MissingCitation[]>({
  create: (state) => computeMissing(state),
  update: (value, tr) =>
    tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? computeMissing(tr.state)
      : value,
})

/** Opens the editor on the group of citations (or the marker) that starts at `from`. */
export const openCiteEffect = StateEffect.define<{ from: number; focusAt: number }>()
/** Opens the editor for a citation that is not in the text yet, at `at`. */
export const openNewCiteEffect = StateEffect.define<{ at: number; attributionOf?: number }>()
export const closeCiteEffect = StateEffect.define<null>()

export type ActiveCite =
  | { kind: 'group'; from: number; focusAt: number }
  | { kind: 'new'; at: number; attributionOf?: number }

/**
 * What the citation editor is open on: a group of citations (or a marker) in the text, or a place
 * where the first work will be inserted. Mapped through every change.
 */
export const activeCiteField = StateField.define<ActiveCite | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openCiteEffect)) return { kind: 'group', ...effect.value }
      if (effect.is(openNewCiteEffect)) return { kind: 'new', ...effect.value }
      if (effect.is(closeCiteEffect)) return null
    }
    if (value === null || !tr.docChanged) return value
    return value.kind === 'new'
      ? {
          kind: 'new',
          at: tr.changes.mapPos(value.at, 1),
          ...(value.attributionOf === undefined
            ? {}
            : { attributionOf: tr.changes.mapPos(value.attributionOf, 1) }),
        }
      : {
          kind: 'group',
          from: tr.changes.mapPos(value.from, 1),
          focusAt: tr.changes.mapPos(value.focusAt, 1),
        }
  },
})

/** The place a new citation will go, while the editor is open for one. */
export function activeNew(state: EditorState): number | null {
  const active = state.field(activeCiteField)
  return active?.kind === 'new' ? active.at : null
}

/** Where the block quote starts whose source is being chosen, while the editor is open for one. */
export function activeNewSource(state: EditorState): number | null {
  const active = state.field(activeCiteField)
  return active?.kind === 'new' ? (active.attributionOf ?? null) : null
}

export function activeMissing(state: EditorState): MissingCitation | undefined {
  const active = state.field(activeCiteField)
  return active?.kind !== 'group'
    ? undefined
    : state.field(missingField).find((marker) => marker.from === active.from)
}

/** The group of citations being edited: all that print together, the first one at `from`. */
export function activeGroup(state: EditorState): Citation[] | undefined {
  const active = state.field(activeCiteField)
  if (active?.kind !== 'group') return undefined
  const first = state.field(citeField).find((citation) => citation.from === active.from)
  return first ? groupOf(state.field(citeField), (a, b) => state.sliceDoc(a, b), first) : undefined
}

/** Opens the citation at `pos` for editing (or whatever the configuration says to do instead). */
export function openCite(view: EditorView, pos: number): void {
  // A citation, or the marker of a place that still needs one: both open in a popover.
  const citation = citationAt(view.state.field(citeField), pos)
  const marker = citation ? null : missingAt(view.state.field(missingField), pos)
  if (!citation && !marker) return
  // Citations that print together are one chip and open together, from the start of the group.
  const start = citation
    ? groupOf(view.state.field(citeField), (a, b) => view.state.sliceDoc(a, b), citation)[0]!.from
    : marker!.from
  const { onOpen } = view.state.facet(citeConfig)
  if (onOpen) onOpen(view, start)
  else
    view.dispatch({
      effects: openCiteEffect.of({ from: start, focusAt: citation?.from ?? start }),
    })
}

/**
 * Opens the editor for a citation that is not in the text yet, at the caret. With `attributionOf`
 * (where a block quote starts) it is the source of that quote: the first work chosen makes its
 * attribution, and the next ones are added to it.
 */
export function openNewCite(view: EditorView, at: number, attributionOf?: number): void {
  view.dispatch({
    effects: openNewCiteEffect.of(attributionOf === undefined ? { at } : { at, attributionOf }),
  })
}

export function closeCite(view: EditorView): void {
  view.dispatch({ effects: closeCiteEffect.of(null) })
}
