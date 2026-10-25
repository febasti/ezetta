import { syntaxTree } from '@codemirror/language'
import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  crossRefAt,
  numberTargets,
  referenceText,
  replaceSheetTargets,
  scanCrossRefs,
  scanTargets,
  supplementsFor,
} from '@core/typst/targets'
import { DEFAULT_HEADING_NUMBERING } from '@core/export/numbering'
import type { HeadingNumbering } from '@core/export/numbering'
import type {
  CrossRef,
  NumberedTarget,
  SheetTargets,
  Supplements,
  Target,
} from '@core/typst/targets'
import { figureField } from './figureState'
import { mathField } from './mathState'
import { fullTree, sourceText } from './source'
import { tableField } from './tableState'

export interface RefConfig {
  /** The sheets of the project in export order, with what can be referenced in each. */
  sheets: readonly SheetTargets[]
  /** The sheet in this editor: its entry in `sheets` is replaced by what the text says right now.
   * Null where the text is not one sheet (the continuous view). */
  livePath: string | null
  /** The words before the number, in the language of the text. */
  supplements: Supplements
  /** How the export's template numbers headings, so a chip says what the PDF prints. */
  headingNumbering: HeadingNumbering
  /** The name of a sheet, for telling targets in other sheets apart. */
  sheetName: (path: string) => string
  labels: {
    aria: (text: string) => string
    /** The tooltip of a reference whose label no sheet has. */
    missing: (label: string) => string
    /** The tooltip of a reference to something in a sheet that is not in the export. */
    excluded: (label: string) => string
  }
  /** Opens a reference for editing. By default the popover; the continuous view opens the sheet. */
  onOpen?: (view: EditorView, from: number) => void
  /** Goes to a target: another sheet is opened at the place. */
  goTo: (view: EditorView, path: string, at: number) => void
  /**
   * Gives a target in another sheet its label, by changing that sheet's file. Null if it could not
   * be done (the sheet changed, or could not be written).
   */
  labelOther: (target: NumberedTarget, taken: ReadonlySet<string>) => Promise<string | null>
}

const DEFAULT_CONFIG: RefConfig = {
  sheets: [],
  livePath: null,
  supplements: supplementsFor('de'),
  headingNumbering: DEFAULT_HEADING_NUMBERING,
  sheetName: (path) => path,
  labels: { aria: (text) => text, missing: (label) => label, excluded: (label) => label },
  goTo: () => undefined,
  labelOther: () => Promise.resolve(null),
}

export const refConfig = Facet.define<Partial<RefConfig>, RefConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as RefConfig,
})

/** What the document and the project say about references. */
export interface RefIndex {
  refs: readonly CrossRef[]
  /** What can be referenced in this text, in text order. */
  own: readonly Target[]
  /** Everything in the project, numbered; this text's part is as it is now, not as last saved. */
  targets: readonly NumberedTarget[]
}

/**
 * The index of `state`. With `previous` (same configuration), the project's numbering is reused
 * when the text's own targets were only moved or retitled.
 */
function compute(state: EditorState, previous?: RefIndex): RefIndex {
  const config = state.facet(refConfig)
  const tree = fullTree(state)
  const doc = sourceText(state)
  // The figures, tables and formulas are the ones their own fields found in this text.
  const own = scanTargets(tree, doc, {
    figures: state.field(figureField, false),
    tables: state.field(tableField, false),
    formulas: state.field(mathField, false),
  })
  const refs = scanCrossRefs(tree, doc)
  if (config.livePath === null)
    return {
      refs,
      own,
      targets: previous?.targets ?? numberTargets(config.sheets, config.headingNumbering),
    }
  const kept = previous && replaceSheetTargets(previous.targets, config.livePath, previous.own, own)
  if (kept) return { refs, own, targets: kept }
  const sheets = config.sheets.map((sheet) =>
    sheet.path === config.livePath ? { ...sheet, targets: own } : sheet,
  )
  return { refs, own, targets: numberTargets(sheets, config.headingNumbering) }
}

/** The references and targets of the document, rebuilt when the text, the syntax, or the project changes. */
export const refField = StateField.define<RefIndex>({
  create: (state) => compute(state),
  update(value, tr) {
    if (tr.state.facet(refConfig) !== tr.startState.facet(refConfig)) return compute(tr.state)
    return tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? compute(tr.state, value)
      : value
  },
})

/** What a reference points at. */
export type Resolved =
  | { state: 'ok'; target: NumberedTarget }
  | { state: 'excluded'; target: NumberedTarget }
  | { state: 'missing' }

export function resolve(index: RefIndex, label: string): Resolved {
  const target = index.targets.find((t) => t.label === label)
  if (!target) return { state: 'missing' }
  return { state: target.inExport ? 'ok' : 'excluded', target }
}

/** The chip's text: what the PDF prints, or the supplement the writer gave. */
export function chipText(ref: CrossRef, resolved: Resolved, config: RefConfig): string {
  if (ref.supplement !== null && ref.supplement.trim() !== '') return ref.supplement.trim()
  if (resolved.state === 'missing') return ref.label
  if (resolved.state === 'excluded') return ref.label
  return referenceText(resolved.target, config.supplements)
}

export type ActiveRef = { kind: 'ref'; from: number } | { kind: 'new'; at: number }

/** Opens the picker on the reference that starts at `from`. */
export const openRefEffect = StateEffect.define<{ from: number }>()
/** Opens the picker for a reference that is not in the text yet, at `at`. */
export const openNewRefEffect = StateEffect.define<{ at: number }>()
export const closeRefEffect = StateEffect.define<null>()

/** What the picker is open on, mapped through every change. */
export const activeRefField = StateField.define<ActiveRef | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openRefEffect)) return { kind: 'ref', from: effect.value.from }
      if (effect.is(openNewRefEffect)) return { kind: 'new', at: effect.value.at }
      if (effect.is(closeRefEffect)) return null
    }
    if (value === null || !tr.docChanged) return value
    return value.kind === 'new'
      ? { kind: 'new', at: tr.changes.mapPos(value.at, 1) }
      : { kind: 'ref', from: tr.changes.mapPos(value.from, 1) }
  },
})

/** The reference being edited. */
export function activeCrossRef(state: EditorState): CrossRef | undefined {
  const active = state.field(activeRefField)
  return active?.kind === 'ref'
    ? state.field(refField).refs.find((r) => r.from === active.from)
    : undefined
}

export function activeNewRef(state: EditorState): number | null {
  const active = state.field(activeRefField)
  return active?.kind === 'new' ? active.at : null
}

/** Opens the reference at `pos` for editing (or whatever the configuration says to do instead). */
export function openRef(view: EditorView, pos: number): void {
  const ref = crossRefAt(view.state.field(refField).refs, pos)
  if (!ref) return
  const { onOpen } = view.state.facet(refConfig)
  if (onOpen) onOpen(view, ref.from)
  else view.dispatch({ effects: openRefEffect.of({ from: ref.from }) })
}

export function openNewRef(view: EditorView, at: number): void {
  view.dispatch({ effects: openNewRefEffect.of({ at }) })
}

export function closeRef(view: EditorView): void {
  view.dispatch({ effects: closeRefEffect.of(null) })
}
