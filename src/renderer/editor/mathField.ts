import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { updateFormula } from '@core/typst/math'
import type { Formula } from '@core/typst/math'
import { classifyMathError, excerptAt } from '@core/typst/mathError'
import { activeFormula, activeMathField, closeMath, mathConfig } from './mathState'
import type { MathOutcome } from './mathState'
import { el } from './dom'

/** The part of a formula's editor that is the same wherever it is shown. */
export interface MathEditing {
  dom: HTMLElement
  /** Shows the formula's source, unless the field is being typed in. */
  sync(formula: Formula): void
  /** Puts the caret in the field; `selectAll` for a formula that was just inserted (its starter is replaced by typing). */
  focus(selectAll: boolean): void
}

/**
 * The editing field of a formula: the Typst source and a hint. The kind of the formula, in the text
 * or a block, is what it was made as and is not changed here. The drawing is not part of it: the
 * formula in the text is its preview. A block formula has this
 * field inside its own widget, so it opens in place; any other has it in a small popover. Every
 * change goes into the sheet at once as a normal transaction, so undo works, and the formula
 * follows along. The field closes when the focus leaves it, or with Escape or Cmd+Enter.
 */
export function createMathEditing(view: EditorView): MathEditing {
  const { labels } = view.state.facet(mathConfig)
  const current = () => activeFormula(view.state)

  const dom = el('div', 'cm-math-edit')

  const field = el('textarea', 'k-field k-field-multiline cm-math-source-field')
  field.rows = 1
  field.spellcheck = false
  field.autocapitalize = 'off'
  field.setAttribute('autocomplete', 'off')
  field.setAttribute('aria-label', labels.source)
  const hint = el('div', 'cm-math-hint', labels.hint)
  // What is wrong with the formula, once the writer pauses: the problem in words, the place in the
  // source with the character at fault marked, and the compiler's own message.
  const problem = el('div', 'cm-math-problem')
  problem.hidden = true
  problem.id = `cm-math-problem-${Math.random().toString(36).slice(2, 8)}`

  dom.append(field, problem, hint)

  /** Pause after typing before the formula is checked and a problem shown. */
  const CHECK_PAUSE_MS = 800
  let checking: ReturnType<typeof setTimeout> | undefined
  let asked = 0

  const showProblem = (outcome: MathOutcome | null, source: string): void => {
    if (!outcome || outcome.ok || outcome.reason !== 'invalid') {
      problem.hidden = true
      problem.replaceChildren()
      field.removeAttribute('aria-invalid')
      field.removeAttribute('aria-describedby')
      return
    }
    const at = outcome.at ?? null
    const found = classifyMathError({ message: outcome.message, at }, source)
    const words = labels.problem
    const title = el('div', 'cm-math-problem-title', words.title(found))
    const how = el('div', 'cm-math-problem-hint', words.hint(found))
    problem.replaceChildren(title, how)
    const place = excerptAt(source, at)
    if (place) {
      const code = el('code', 'cm-math-excerpt')
      code.append(place.before)
      code.append(el('mark', place.mark === '' ? 'cm-math-excerpt-end' : '', place.mark))
      code.append(place.after)
      const where = el('div', 'cm-math-problem-place')
      where.append(code, el('span', '', words.place(place.line, place.column)))
      problem.append(where)
    }
    problem.append(el('div', 'cm-math-problem-compiler', words.compiler(outcome.message)))
    problem.hidden = false
    field.setAttribute('aria-invalid', 'true')
    field.setAttribute('aria-describedby', problem.id)
  }

  /** Asks the compiler (through the same service, and its memory, as the drawing in the text) about this source. */
  const check = (formula: Formula): void => {
    const { service } = view.state.facet(mathConfig)
    clearTimeout(checking)
    asked += 1
    const mine = asked
    if (!service || formula.source.trim() === '') return showProblem(null, formula.source)
    const known = service.peek(formula.source, formula.display)
    if (known) return showProblem(known, formula.source)
    checking = setTimeout(() => {
      void service.get(formula.source, formula.display).then((outcome) => {
        if (mine === asked) showProblem(outcome, formula.source)
      })
    }, CHECK_PAUSE_MS)
  }

  const fit = (): void => {
    // A new line is a line break in the formula, which the field shows as typed.
    field.rows = Math.min(8, Math.max(1, field.value.split('\n').length))
  }

  field.addEventListener('input', () => {
    fit()
    const formula = current()
    // An empty block formula would read as an inline one (in Typst too): the last source stays
    // until something is typed, and the field shows it again when it is left.
    if (!formula || (formula.display && field.value.trim() === '')) return
    const edit = updateFormula(view.state.doc.toString(), formula, field.value)
    if (edit) view.dispatch({ changes: edit, userEvent: 'input.type' })
  })

  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
      event.preventDefault()
      closeMath(view)
      view.focus()
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      // One undo history: the sheet's, not the text field's own.
      event.preventDefault()
      if (event.shiftKey) redo(view)
      else undo(view)
    }
  })
  dom.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null
    if (next && dom.contains(next)) return
    queueMicrotask(() => {
      // A field that is being taken out of the page (the formula became another kind of widget, which
      // opens its own field) is not the writer leaving it.
      if (!dom.isConnected) return
      if (view.state.field(activeMathField) !== null && !dom.contains(document.activeElement))
        closeMath(view)
    })
  })

  return {
    dom,
    sync(formula) {
      // Do not overwrite what the writer is typing in: the field keeps its own spaces.
      if (document.activeElement !== field) field.value = formula.source
      fit()
      check(formula)
    },
    focus(selectAll) {
      field.focus()
      if (selectAll) field.select()
      else field.setSelectionRange(field.value.length, field.value.length)
    },
  }
}
