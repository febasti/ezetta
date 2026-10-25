import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { Formula } from '@core/typst/math'
import { drawEmpty, drawOutcome, drawSource } from './mathDraw'
import { createMathEditing } from './mathField'
import type { MathEditing } from './mathField'
import { openMath } from './mathState'
import type { MathConfig } from './mathState'

/** How long typing must pause before a changed formula is drawn again. */
const TYPING_PAUSE_MS = 120

const timers = new WeakMap<HTMLElement, number>()
const wanted = new WeakMap<HTMLElement, string>()
/** The editing field of a block formula that is open, by the widget's element. */
const editings = new WeakMap<HTMLElement, MathEditing>()

/** Fills the drawing element with the formula's drawing: at once if it is known, otherwise after the pause. */
function refresh(
  root: HTMLElement,
  drawing: HTMLElement,
  view: EditorView,
  formula: Formula,
  config: MathConfig,
  delay: number,
): void {
  const key = `${formula.display}\u0000${formula.source}`
  const inline = root.dataset['block'] !== 'true'
  wanted.set(drawing, key)
  window.clearTimeout(timers.get(drawing))
  root.setAttribute('aria-label', config.labels.aria(formula.source))
  if (formula.source === '') return drawEmpty(drawing, config.labels.empty)
  const { service } = config
  if (!service) return drawSource(drawing, formula.source)
  const options = { source: formula.source, inline }
  const known = service.peek(formula.source, formula.display)
  if (known) {
    drawOutcome(drawing, known, options)
    view.requestMeasure()
    return undefined
  }
  if (!drawing.firstChild) drawSource(drawing, formula.source)
  timers.set(
    drawing,
    window.setTimeout(() => {
      void service.get(formula.source, formula.display).then((outcome) => {
        if (wanted.get(drawing) !== key) return // the text moved on while this was being drawn
        drawOutcome(drawing, outcome, options)
        view.requestMeasure()
      })
    }, delay),
  )
  return undefined
}

/**
 * A formula in the editor: the drawing the Typst compiler makes of it. It only displays and is
 * atomic. A click opens it for editing: a block formula grows a field with its source under the
 * drawing, which follows the typing; any other opens a popover (`mathEditor.ts`). Its source can
 * otherwise only be edited with "Quelltext" on.
 */
export class MathWidget extends WidgetType {
  private readonly key: string

  constructor(
    private readonly formula: Formula,
    private readonly config: MathConfig,
    private readonly active: boolean,
    private readonly block: boolean,
    private readonly selected: boolean,
    private readonly selectAll = false,
  ) {
    super()
    this.key = [formula.source, formula.display, active, block, selected, active && selectAll].join(
      '\u0000',
    )
  }

  override eq(other: MathWidget): boolean {
    return other.key === this.key && other.config === this.config
  }

  override get estimatedHeight(): number {
    return this.block ? 64 : -1
  }

  private classes(): string {
    return (
      'cm-math-widget' +
      (this.block ? ' block' : '') +
      (this.formula.display ? ' display' : '') +
      (this.active ? ' active' : '') +
      (this.selected ? ' selected' : '')
    )
  }

  /** The editing field of an open block formula: made when it opens, taken away when it closes. */
  private syncEditing(root: HTMLElement, view: EditorView): void {
    if (!this.block) return
    let editing = editings.get(root)
    if (this.active) {
      if (!editing) {
        editing = createMathEditing(view)
        editings.set(root, editing)
        root.append(editing.dom)
        const fresh = editing
        // Once the editor has put the element in the page.
        queueMicrotask(() => fresh.focus(this.selectAll))
        view.requestMeasure()
      }
      editing.sync(this.formula)
    } else if (editing) {
      editing.dom.remove()
      editings.delete(root)
      view.requestMeasure()
    }
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement(this.block ? 'div' : 'span')
    root.className = this.classes()
    root.dataset['block'] = String(this.block)
    root.setAttribute('role', 'math')
    // A block formula draws in its own part, so the field under it is not drawn over.
    const drawing = this.block ? document.createElement('div') : root
    if (this.block) {
      drawing.className = 'cm-math-drawing'
      root.append(drawing)
    }
    // The click does not move the caret. The formula may have moved since this element was made,
    // so ask where it is now.
    drawing.addEventListener('mousedown', (event) => event.preventDefault())
    drawing.addEventListener('click', () => openMath(view, view.posAtDOM(root)))
    refresh(root, drawing, view, this.formula, this.config, 0)
    this.syncEditing(root, view)
    return root
  }

  /** Typing changes the source of one widget again and again: reuse its element, keep its drawing until the new one arrives. */
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    if (dom.dataset['block'] !== String(this.block)) return false
    const drawing = this.block ? dom.querySelector<HTMLElement>(':scope > .cm-math-drawing') : dom
    if (!drawing) return false
    const invalid = drawing.classList.contains('invalid')
    const unavailable = drawing.classList.contains('unavailable')
    dom.className = this.classes()
    if (this.block) {
      drawing.classList.toggle('invalid', invalid)
      drawing.classList.toggle('unavailable', unavailable)
    } else dom.className += (invalid ? ' invalid' : '') + (unavailable ? ' unavailable' : '')
    refresh(dom, drawing, view, this.formula, this.config, TYPING_PAUSE_MS)
    this.syncEditing(dom, view)
    return true
  }

  override ignoreEvent(): boolean {
    return true
  }
}
