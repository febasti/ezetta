import { redo, undo } from '@codemirror/commands'
import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { WidgetType } from '@codemirror/view'
import { balanced } from '@core/typst/args'
import { updateFigure } from '@core/typst/figures'
import { icon } from './icons'
import { assetUrl, figureField } from './figureState'
import type { FigureConfig, FigureView } from './figureState'
import { el } from './dom'

/** The widths the tools over an image offer. */
export const WIDTHS = ['25%', '50%', '75%', '100%']

const LENGTH = /^\d+(\.\d+)?(%|pt|cm|mm|in|em)$/

/** A Typst length that CSS understands too (percent, points, centimeters, millimeters, inches, em). */
const cssLength = (value: string | null): string | null =>
  value && LENGTH.test(value) ? value : null

/** What the handlers of one drawn figure need, kept up to date when it is redrawn. */
interface Context {
  figure: FigureView
  config: FigureConfig
  view: EditorView
  readOnly: boolean
}
const contexts = new WeakMap<HTMLElement, Context>()

/** The figure that is at this element now (the document may have moved since it was drawn). */
function current(root: HTMLElement): FigureView | null {
  const ctx = contexts.get(root)
  if (!ctx) return null
  const at = ctx.view.posAtDOM(root)
  return ctx.view.state.field(figureField).find((f) => f.from <= at && f.end >= at) ?? ctx.figure
}

/** A box where an image cannot be drawn, with the way out: choose an image. */
function emptyBox(root: HTMLElement, text: string, button: string | null): HTMLElement {
  const box = el('div', 'cm-figure-empty')
  box.setAttribute('role', 'img')
  box.setAttribute('aria-label', text)
  box.append(icon('photo', 28, 'cm-figure-empty-icon'), el('span', 'cm-figure-empty-text', text))
  if (button !== null) {
    const choose = el('button', 'k-button cm-figure-choose')
    choose.type = 'button'
    choose.append(icon('photo', 16), document.createTextNode(button))
    choose.addEventListener('click', () => pick(root))
    box.append(choose)
  }
  return box
}

/** A box for an image in the text that cannot be drawn. */
function inlineBox(text: string): HTMLElement {
  const box = el('span', 'cm-figure-missing inline')
  box.setAttribute('role', 'img')
  box.setAttribute('aria-label', text)
  box.append(el('span', 'cm-figure-missing-text', text))
  return box
}

function pick(root: HTMLElement): void {
  const ctx = contexts.get(root)
  const figure = current(root)
  if (ctx && figure) ctx.config.pick(ctx.view, figure.from)
}

/** Selects the whole figure, as Backspace next to it does: it is drawn marked, and Delete removes it. */
function select(root: HTMLElement): void {
  const ctx = contexts.get(root)
  const figure = current(root)
  if (!ctx || !figure) return
  ctx.view.dispatch({ selection: EditorSelection.range(figure.from, figure.end) })
  ctx.view.focus()
}

/** Leaves the caption: the caret goes behind the figure, and the editor has the focus. */
function exit(root: HTMLElement): void {
  const ctx = contexts.get(root)
  const figure = current(root)
  if (!ctx || !figure) return
  ctx.view.dispatch({ selection: { anchor: figure.end }, scrollIntoView: true })
  ctx.view.focus()
}

/** Puts the focus in the caption of the figure that starts at `from`, to type it right away. */
export function focusFigureCaption(view: EditorView, from: number): void {
  for (const root of view.contentDOM.querySelectorAll<HTMLElement>('.cm-figure')) {
    if (view.posAtDOM(root) !== from) continue
    root.querySelector<HTMLInputElement>('.cm-figure-caption-input')?.focus()
    return
  }
}

/**
 * How a figure is built: what a change of it needs a redraw for. The size is not part of it: a new
 * width is put on the picture where it is, so the tools over it stay under the pointer.
 */
const shapeOf = (f: FigureView): string => [f.kind, f.path, f.empty, f.alt].join('\u0000')

/**
 * An image in the editor. A figure is the picture with its tools over it while it is chosen (width,
 * replace; Backspace removes it), and under it "Abbildung N:" and a caption field that is typed in directly, like a table's. A
 * figure without an image yet is an empty frame with a button that asks for the file. A bare image
 * has the tools but no caption, and an image in the text is small and opens its popover. Every
 * change goes into the sheet as a normal transaction (so undo works) and touches only the argument
 * that changed. The widget is atomic: a click on the picture selects it as a whole.
 */
export class FigureWidget extends WidgetType {
  private readonly key: string

  constructor(
    private readonly figure: FigureView,
    private readonly config: FigureConfig,
    private readonly block: boolean,
    private readonly selected: boolean,
  ) {
    super()
    const f = figure
    this.key = [
      shapeOf(f),
      f.width,
      f.height,
      f.caption?.text,
      f.caption ? f.caption.to - f.caption.from : '',
      f.number,
      block,
      selected,
      config.supplement,
      config.separator,
      config.labels,
      Boolean(config.onOpen),
    ]
      .map((part) => (typeof part === 'object' ? 'labels' : String(part)))
      .join('\u0000')
    this.labelsOf = config.labels
  }

  private readonly labelsOf: FigureConfig['labels']

  override eq(other: FigureWidget): boolean {
    return other.key === this.key && other.labelsOf === this.labelsOf
  }

  override get estimatedHeight(): number {
    return this.block ? (this.figure.empty ? 260 : 300) : -1
  }

  private get inline(): boolean {
    return this.figure.kind === 'inline' || !this.block
  }

  private get readOnly(): boolean {
    return Boolean(this.config.onOpen)
  }

  /** The text that names the figure for screen readers. */
  private ariaLabel(): string {
    const { figure, config } = this
    const caption = figure.caption?.text ?? ''
    return figure.number !== null
      ? config.labels.aria(config.supplement, figure.number, caption)
      : config.labels.ariaPlain(caption || figure.alt || figure.path)
  }

  /** The state that follows the document without a redraw: marks, number, caption field, widths. */
  private paint(root: HTMLElement, view: EditorView): void {
    const { figure, config } = this
    root.classList.toggle('selected', this.selected)
    root.setAttribute('aria-label', this.ariaLabel())
    const number = root.querySelector<HTMLElement>('.cm-figure-number')
    if (number)
      number.textContent =
        figure.number !== null ? `${config.supplement} ${figure.number}${config.separator}` : ''
    const input = root.querySelector<HTMLInputElement>('.cm-figure-caption-input')
    const source = figure.caption ? view.state.sliceDoc(figure.caption.from, figure.caption.to) : ''
    // What is being typed is not overwritten, unless it is brackets that cannot be in the text yet.
    if (input && document.activeElement !== input && input.value !== source) {
      input.value = source
      input.removeAttribute('aria-invalid')
    }
    const text = root.querySelector<HTMLElement>('.cm-figure-text')
    if (text) text.textContent = figure.caption?.text ?? ''
    // The size belongs to the box around the picture, so the mark of a chosen figure follows the
    // picture and not the width of the text: the picture fills its box.
    const holder = root.querySelector<HTMLElement>('.cm-figure-holder')
    if (holder) holder.style.width = cssLength(figure.width) ?? ''
    for (const img of root.querySelectorAll<HTMLElement>('.cm-figure-image')) {
      img.style.width = cssLength(figure.width) ? '100%' : ''
      img.style.height = cssLength(figure.height) ?? ''
    }
    for (const img of root.querySelectorAll<HTMLElement>('.cm-inline-image'))
      img.style.height = cssLength(figure.height) ?? '1em'
    for (const button of root.querySelectorAll<HTMLElement>('.cm-figure-width'))
      button.setAttribute('aria-checked', String(button.dataset['width'] === figure.width))
  }

  override toDOM(view: EditorView): HTMLElement {
    const { figure, config } = this
    const readOnly = this.readOnly
    const inline = this.inline
    const root = el(inline ? 'span' : 'figure', 'cm-figure' + (inline ? ' inline' : ''))
    root.setAttribute('role', 'group')
    root.title = figure.path
    contexts.set(root, { figure, config, view, readOnly })

    if (inline) this.drawInline(root, view)
    else this.drawBlock(root, view)

    // The click does not move the caret. The figure may have moved since this element was made, so
    // ask where it is now.
    if (readOnly) {
      root.addEventListener('click', () => {
        const f = current(root)
        if (f) config.onOpen?.(view, f.from)
      })
    } else {
      root.addEventListener('mousedown', (event) => {
        const target = event.target as HTMLElement
        if (target.closest('input, button')) return // typing and the tools take their own events
        event.preventDefault()
        select(root)
      })
    }
    this.paint(root, view)
    return root
  }

  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const ctx = contexts.get(dom)
    if (!ctx || shapeOf(ctx.figure) !== shapeOf(this.figure)) return false
    if (ctx.readOnly !== this.readOnly || ctx.config.labels !== this.config.labels) return false
    if (dom.classList.contains('inline') !== this.inline) return false
    ctx.figure = this.figure
    ctx.config = this.config
    ctx.view = view
    this.paint(dom, view)
    view.requestMeasure()
    return true
  }

  // --- an image in the text ---------------------------------------------------------------------

  private drawInline(root: HTMLElement, view: EditorView): void {
    const { figure, config } = this
    const caption = figure.caption?.text ?? ''
    const frame = el('span', 'cm-figure-frame')
    const url = assetUrl(figure.path)
    const show = (node: HTMLElement): void => {
      frame.replaceChildren(node)
      view.requestMeasure()
    }
    if (!url) frame.append(inlineBox(config.labels.invalid(figure.path)))
    else {
      const img = document.createElement('img')
      img.className = 'cm-inline-image'
      img.src = url
      img.alt = figure.alt ?? (caption || figure.path)
      img.draggable = false
      const height = cssLength(figure.height)
      img.style.height = height ?? '1em'
      img.addEventListener('load', () => view.requestMeasure())
      img.addEventListener('error', () => show(inlineBox(config.labels.missing(figure.path))))
      frame.append(img)
    }
    root.append(frame)
  }

  // --- a figure or a bare image -------------------------------------------------------------------

  private drawBlock(root: HTMLElement, view: EditorView): void {
    const { figure, config } = this
    const { labels } = config
    const readOnly = this.readOnly
    const caption = figure.caption?.text ?? ''

    const frame = el('div', 'cm-figure-frame')
    const holder = el('div', 'cm-figure-holder')
    const show = (node: HTMLElement): void => {
      holder.replaceChildren(node)
      view.requestMeasure()
    }
    if (figure.empty)
      holder.append(emptyBox(root, labels.empty, readOnly ? null : labels.chooseImage))
    else {
      const url = assetUrl(figure.path)
      if (!url)
        holder.append(
          emptyBox(root, labels.invalid(figure.path), readOnly ? null : labels.replaceImage),
        )
      else {
        const img = document.createElement('img')
        img.className = 'cm-figure-image'
        img.src = url
        img.alt = figure.alt ?? (caption || figure.path)
        img.draggable = false
        // Sizes are set through the style object (not an attribute), which the CSP allows. The
        // width is on the box around the picture (see `paint`).
        img.addEventListener('load', () => view.requestMeasure())
        // A file that is not there is an empty frame too, with the way to choose another one.
        img.addEventListener('error', () =>
          show(emptyBox(root, labels.missing(figure.path), readOnly ? null : labels.replaceImage)),
        )
        holder.append(img)
      }
    }
    // Over a picture the tools set the width and replace it, while it is chosen. A frame without
    // one has its own button to choose a file. Removing is Backspace on the chosen figure.
    if (!readOnly && holder.querySelector('img')) holder.append(this.tools(root))
    frame.append(holder)
    root.append(frame)

    if (figure.kind === 'figure') root.append(this.captionRow(root))
  }

  /** The tools over the image: its width, and another image. */
  private tools(root: HTMLElement): HTMLElement {
    const { labels } = this.config
    const bar = el('div', 'cm-figure-tools k-popover k-bar')
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', labels.tools)
    // Pressing a tool does not take the focus or the selection from the text.
    bar.addEventListener('mousedown', (event) => event.preventDefault())

    const sizes = el('div', 'cm-figure-widths k-segmented k-segmented-sm')
    sizes.setAttribute('role', 'radiogroup')
    sizes.setAttribute('aria-label', labels.width)
    for (const value of WIDTHS) {
      const button = el('button', 'cm-figure-width', value.replace('%', ''))
      button.type = 'button'
      button.dataset['width'] = value
      button.setAttribute('role', 'radio')
      button.title = labels.widthOf(value)
      button.setAttribute('aria-label', labels.widthOf(value))
      button.addEventListener('click', () => this.patch(root, { width: value }))
      sizes.append(button)
    }
    const replace = el('button', 'k-icon-button k-icon-button-sm cm-figure-tool')
    replace.type = 'button'
    replace.title = labels.replaceImage
    replace.setAttribute('aria-label', labels.replaceImage)
    replace.append(icon('replace', 16))
    replace.addEventListener('click', () => pick(root))
    bar.append(sizes, replace)
    return bar
  }

  private patch(root: HTMLElement, change: { width: string | null }): void {
    const ctx = contexts.get(root)
    const figure = current(root)
    if (!ctx || !figure) return
    const edit = updateFigure(ctx.view.state.doc.toString(), figure, change)
    if (edit) ctx.view.dispatch({ changes: edit, userEvent: 'input.type' })
  }

  /** "Abbildung N:" and the caption: a field to type in, or plain text in the read-only view. */
  private captionRow(root: HTMLElement): HTMLElement {
    const { labels } = this.config
    const bar = el('figcaption', 'cm-figure-caption')
    bar.append(el('span', 'cm-figure-number'))
    if (this.readOnly) {
      bar.append(el('span', 'cm-figure-text'))
      return bar
    }
    const input = el('input', 'cm-figure-caption-input')
    input.type = 'text'
    input.placeholder = labels.captionPlaceholder
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('aria-label', labels.captionPlaceholder)
    input.addEventListener('input', () => {
      const ctx = contexts.get(root)
      const figure = current(root)
      if (!ctx || !figure) return
      // Brackets that do not match would swallow the text after the figure: they are not written.
      if (!balanced(input.value)) {
        input.setAttribute('aria-invalid', 'true')
        input.title = labels.captionInvalid
        return
      }
      input.removeAttribute('aria-invalid')
      input.removeAttribute('title')
      const edit = updateFigure(ctx.view.state.doc.toString(), figure, { caption: input.value })
      if (edit) ctx.view.dispatch({ changes: edit, userEvent: 'input.type' })
    })
    input.addEventListener('keydown', (event) => {
      const ctx = contexts.get(root)
      if (!ctx) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        // One undo history: the sheet's, not the field's own.
        event.preventDefault()
        if (event.shiftKey) redo(ctx.view)
        else undo(ctx.view)
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo(ctx.view)
      } else if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        exit(root)
      }
    })
    bar.append(input)
    return bar
  }

  override ignoreEvent(): boolean {
    return true
  }

  override destroy(dom: HTMLElement): void {
    contexts.delete(dom)
  }
}
