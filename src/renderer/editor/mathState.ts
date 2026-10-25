import { syntaxTree } from '@codemirror/language'
import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { formulaAt, scanFormulas } from '@core/typst/math'
import type { Formula } from '@core/typst/math'
import type { MathProblem } from '@core/typst/mathError'
import { fullTree, sourceText } from './source'

/** A formula drawn by the Typst compiler, or the reason there is no drawing. */
export type MathOutcome =
  | { ok: true; svg: string; width: number; height: number; baseline: number | null }
  | { ok: false; reason: string; message: string; at?: number | null }

/** Draws formulas. Answers from a cache when it can, so the editor can show a result at once. */
export interface MathService {
  peek(source: string, display: boolean): MathOutcome | undefined
  get(source: string, display: boolean): Promise<MathOutcome>
}

export interface MathConfig {
  /** Without a service (the gallery, tests of the editor alone) a formula shows as its source. */
  service: MathService | null
  labels: {
    aria: (source: string) => string
    empty: string
    /** The popover's name. */
    editor: string
    /** The field with the Typst source. */
    source: string
    hint: string
    /** What to say about a formula that does not compile. */
    problem: {
      title: (problem: MathProblem) => string
      hint: (problem: MathProblem) => string
      place: (line: number, column: number) => string
      compiler: (message: string) => string
    }
  }
  /** Opens a formula for editing. By default the popover; the continuous view opens the sheet. */
  onOpen?: (view: EditorView, from: number) => void
}

const DEFAULT_CONFIG: MathConfig = {
  service: null,
  labels: {
    aria: (source) => source,
    empty: '',
    editor: '',
    source: '',
    hint: '',
    problem: { title: () => '', hint: () => '', place: () => '', compiler: (message) => message },
  },
}

export const mathConfig = Facet.define<Partial<MathConfig>, MathConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as MathConfig,
})

/**
 * True if the formula is drawn as a block of its own, with its editing field in it: a block formula
 * with nothing else before or after it on its lines. Any other (an inline one, or a block one that
 * shares its line with text) is drawn in the text and edited in a small popover.
 */
export function isBlockWidget(doc: Text, formula: Formula): boolean {
  const first = doc.lineAt(formula.from)
  const last = doc.lineAt(formula.end)
  return (
    formula.display &&
    doc.sliceString(first.from, formula.from).trim() === '' &&
    doc.sliceString(formula.end, last.to).trim() === ''
  )
}

function compute(state: EditorState): readonly Formula[] {
  const tree = fullTree(state)
  return scanFormulas(tree, sourceText(state))
}

/** The formulas of the document, rebuilt when the text or the syntax changes. */
export const mathField = StateField.define<readonly Formula[]>({
  create: (state) => compute(state),
  update: (value, tr) =>
    tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? compute(tr.state) : value,
})

/** `select`: the text field opens with its text selected, so typing replaces the starter text. */
export const openMathEffect = StateEffect.define<{ from: number; select: boolean }>()
export const closeMathEffect = StateEffect.define<null>()

export interface ActiveMath {
  from: number
  select: boolean
}

/** The formula being edited in the popover. Mapped through every change. */
export const activeMathField = StateField.define<ActiveMath | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(openMathEffect)) return effect.value
      if (effect.is(closeMathEffect)) return null
    }
    return value === null || !tr.docChanged
      ? value
      : { ...value, from: tr.changes.mapPos(value.from, 1) }
  },
})

export function activeFormula(state: EditorState): Formula | undefined {
  const active = state.field(activeMathField)
  return active === null
    ? undefined
    : state.field(mathField).find((formula) => formula.from === active.from)
}

/** Opens the formula at `pos` for editing (or whatever the configuration says to do instead). */
export function openMath(view: EditorView, pos: number, select = false): void {
  const formula = formulaAt(view.state.field(mathField), pos)
  if (!formula) return
  const { onOpen } = view.state.facet(mathConfig)
  if (onOpen) onOpen(view, formula.from)
  else view.dispatch({ effects: openMathEffect.of({ from: formula.from, select }) })
}

export function closeMath(view: EditorView): void {
  view.dispatch({ effects: closeMathEffect.of(null) })
}
