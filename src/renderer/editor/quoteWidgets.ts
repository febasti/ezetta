import { redo, undo } from '@codemirror/commands'
import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { balanced } from '@core/typst/args'
import { quoteToBlock, setAttribution } from '@core/typst/quotes'
import { chipElement } from './citeWidget'
import type { GroupChip } from './citeWidget'
import { citeField, openCite, openNewCite } from './citeState'
import type { CiteConfig } from './citeState'
import { epigraphEndingAt, quoteClosingAt, quoteField } from './quoteState'
import type { QuoteConfig } from './quoteState'
import { sameData } from './sameData'

/**
 * How a quote's marks stand out: in the accent while the caret is in the quote (`current`), on the
 * selection's ground once a press next to them has marked the quote for removal (`armed`).
 */
export type QuoteEmphasis = 'current' | 'armed' | null

/**
 * A quotation mark drawn in place of `#quote[` or `]`. It is decoration: the file holds none.
 * `ground` is the faint ground of an inline quote (the marks belong to it): 1 for a quote, 2 for one
 * inside another, 0 for the marks of a block quote, which has no ground of its own.
 */
export class QuoteMark extends WidgetType {
  constructor(
    private readonly glyph: string,
    private readonly side: 'open' | 'close',
    private readonly label: string,
    private readonly ground: 0 | 1 | 2 = 0,
    private readonly emphasis: QuoteEmphasis = null,
  ) {
    super()
  }

  override eq(other: QuoteMark): boolean {
    return (
      other.glyph === this.glyph &&
      other.side === this.side &&
      other.label === this.label &&
      other.ground === this.ground &&
      other.emphasis === this.emphasis
    )
  }

  override toDOM(): HTMLElement {
    const mark = document.createElement('span')
    mark.className =
      `cm-quote-mark ${this.side}` +
      (this.ground > 0 ? ' ground' : '') +
      (this.ground > 1 ? ' inner' : '') +
      (this.emphasis ? ` ${this.emphasis}` : '')
    mark.textContent = this.glyph
    // The bundled Libertinus faces have an empty glyph for „ (U+201E): it takes room and shows
    // nothing, and no other face is tried for it. This mark is set in a serif face of the system.
    if (this.glyph === '„') mark.classList.add('low-base')
    if (this.label) mark.setAttribute('aria-label', this.label)
    return mark
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * Offered after a long inline quote while the caret is in it: one click makes it a block quote.
 * Only a hint, so nothing changes without the click.
 */
export class QuoteHint extends WidgetType {
  constructor(
    private readonly words: number,
    private readonly text: string,
  ) {
    super()
  }

  override eq(other: QuoteHint): boolean {
    return other.words === this.words && other.text === this.text
  }

  override toDOM(view: EditorView): HTMLElement {
    const hint = document.createElement('button')
    hint.type = 'button'
    hint.className = 'cm-quote-hint'
    hint.textContent = this.text
    // Keep the caret where it is: this is a button, not text.
    hint.addEventListener('mousedown', (event) => event.preventDefault())
    hint.addEventListener('click', () => {
      // The quote may have changed since this element was made: find the one that ends here now.
      const at = view.posAtDOM(hint)
      const quote = view.state.field(quoteField).find((q) => !q.block && q.to === at)
      const result = quote
        ? quoteToBlock(view.state.doc.toString(), quote, view.state.field(citeField))
        : null
      if (!result) return
      view.dispatch({
        changes: result.edit,
        selection: { anchor: result.caret },
        scrollIntoView: true,
        userEvent: 'input.format',
      })
    })
    return hint
  }

  override ignoreEvent(): boolean {
    return true
  }
}

// --- the source of a block quote ------------------------------------------------------------------

/** What the source line of a block quote shows: the words in it, and the works as chips. */
export type SourcePart =
  { kind: 'text'; text: string } | { kind: 'chip'; chip: GroupChip; from: number; active: boolean }

/**
 * The source of a block quote, drawn at the end of its text: its citations as chips, as everywhere,
 * and any words that are with them ("vgl."). The source is written in the quote's `attribution`,
 * which the editor hides, so it is never inside the quoted text; a click opens the citation editor.
 */
export class QuoteSource extends WidgetType {
  constructor(
    private readonly parts: readonly SourcePart[],
    private readonly config: CiteConfig,
  ) {
    super()
  }

  override eq(other: QuoteSource): boolean {
    return other.config.labels === this.config.labels && sameData(other.parts, this.parts)
  }

  override toDOM(view: EditorView): HTMLElement {
    const source = document.createElement('span')
    source.className = 'cm-quote-source'
    for (const part of this.parts) {
      if (part.kind === 'text') {
        const text = document.createElement('span')
        text.className = 'cm-quote-source-text'
        text.textContent = part.text
        source.append(text)
        continue
      }
      const chip = chipElement(part.chip, this.config, { active: part.active, selected: false })
      chip.addEventListener('mousedown', (event) => event.preventDefault())
      chip.addEventListener('click', () => openCite(view, part.from))
      source.append(chip)
    }
    return source
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** Offered at the end of a block quote that has no source yet, while the caret is in it. */
export class QuoteSourceAdd extends WidgetType {
  constructor(private readonly text: string) {
    super()
  }

  override eq(other: QuoteSourceAdd): boolean {
    return other.text === this.text
  }

  override toDOM(view: EditorView): HTMLElement {
    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'cm-quote-source-add'
    add.textContent = `+ ${this.text}`
    add.addEventListener('mousedown', (event) => event.preventDefault())
    add.addEventListener('click', () => {
      // The quote may have moved since this element was made: find the one that ends here now.
      const quote = quoteClosingAt(view.state, view.posAtDOM(add))
      if (quote) openNewCite(view, quote.closeFrom, quote.from)
    })
    return add
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/**
 * The source of an epigraph, a line under the quote: a dash and a field for free text (the author,
 * the work), typed in place like the caption of a figure. It is the quote's `attribution`; what is
 * typed goes into the sheet at once as a normal transaction, and brackets that do not match would
 * swallow the text after the quote, so they are not written.
 */
export class EpigraphSource extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly labels: QuoteConfig['labels'],
    private readonly readOnly: boolean,
  ) {
    super()
  }

  override eq(other: EpigraphSource): boolean {
    return (
      other.text === this.text && other.labels === this.labels && other.readOnly === this.readOnly
    )
  }

  override get estimatedHeight(): number {
    return 28
  }

  override toDOM(view: EditorView): HTMLElement {
    const line = document.createElement('div')
    line.className = 'cm-epigraph-source'
    const dash = document.createElement('span')
    dash.className = 'cm-epigraph-dash'
    dash.textContent = '—'
    line.append(dash)
    if (this.readOnly) {
      const text = document.createElement('span')
      text.className = 'cm-epigraph-source-text'
      text.textContent = this.text
      line.append(text)
      return line
    }
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'cm-epigraph-source-input'
    input.placeholder = this.labels.source
    input.setAttribute('aria-label', this.labels.source)
    input.setAttribute('autocomplete', 'off')
    input.value = this.text
    const quote = () => epigraphEndingAt(view.state, view.posAtDOM(line))
    input.addEventListener('input', () => {
      const found = quote()
      if (!found) return
      if (!balanced(input.value)) {
        input.setAttribute('aria-invalid', 'true')
        input.title = this.labels.sourceInvalid
        return
      }
      input.removeAttribute('aria-invalid')
      input.removeAttribute('title')
      const edit = setAttribution(view.state.doc.toString(), found, input.value)
      if (edit) view.dispatch({ changes: edit, userEvent: 'input.type' })
    })
    input.addEventListener('keydown', (event) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        // One undo history: the sheet's, not the field's own.
        event.preventDefault()
        if (event.shiftKey) redo(view)
        else undo(view)
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo(view)
      } else if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        const found = quote()
        if (found) view.dispatch({ selection: { anchor: found.end }, scrollIntoView: true })
        view.focus()
      }
    })
    line.append(input)
    return line
  }

  /** What is being typed stays; the field follows the sheet otherwise (undo, an outside change). */
  override updateDOM(dom: HTMLElement): boolean {
    const input = dom.querySelector<HTMLInputElement>('.cm-epigraph-source-input')
    if (!input) return false
    if (document.activeElement !== input && input.value !== this.text) {
      input.value = this.text
      input.removeAttribute('aria-invalid')
    }
    return true
  }

  override ignoreEvent(): boolean {
    return true
  }
}
