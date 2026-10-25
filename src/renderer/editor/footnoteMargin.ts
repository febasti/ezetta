import { Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import type { PluginValue, ViewUpdate } from '@codemirror/view'
import { activeNoteField, footnoteConfig, footnoteField, openNote } from './footnoteState'
import type { NoteEditorHandle, NoteView, NotesLayout } from './footnoteState'

/** Size of the margin column. The text column gives way for it, down to `MIN_TEXT` wide. Below
 * that there is no room, and the notes panel takes over. */
/** Space kept free at both sides of the text and margin columns. */
const EDGE = 12
const CARD_WIDTH = 240
const GAP = 24
/** The widest the text column gets: the writer's `--measure-writing`. */
const DEFAULT_MAX_TEXT = 760
const maxText = (): number =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--measure-writing')) ||
  DEFAULT_MAX_TEXT
const MIN_TEXT = 440
const MIN_ROOM = MIN_TEXT + GAP + CARD_WIDTH + 2 * EDGE
/** Once the margin is shown it stays until the room is this much below the minimum, so a scrollbar
 * appearing or disappearing does not flip the layout back and forth. */
const HYSTERESIS = 32
const CARD_GAP = 8
const GUESS_HEIGHT = 56

/**
 * CodeMirror measures the heights of the lines again when the editor gets wider or narrower, or
 * its content taller or shorter, but not when a plugin narrows the text: the text of a short sheet
 * fills the editor, so its height stays the same. Its line heights would stay those of the old
 * width, and clicks would land on the wrong line. A change of theme makes it measure again, so
 * the plugin switches between two empty ones whenever it changes the width of the text.
 */
const remeasure = new Compartment()
const THEMES = [EditorView.theme({}), EditorView.theme({})] as const

interface Measure {
  layout: NotesLayout
  textWidth: number
  left: number
  items: { note: NoteView; index: number; wanted: number; height: number }[]
  active: number | null
}

/**
 * The margin column: one card per footnote to the right of the text, level with its
 * marker. Positions come from the marker's coordinates and are recalculated in CodeMirror's
 * measure cycle. Cards that would overlap are pushed down. When there are notes, the text column
 * moves left and narrows to make room; when there is not enough room, nothing is drawn and the
 * layout is reported as `panel`, so the notes panel can show the notes instead.
 */
class MarginPlugin implements PluginValue {
  private readonly container = document.createElement('div')
  /** Cards by the note's order in the document, so typing above a note does not remake them. */
  private readonly cards = new Map<number, HTMLElement>()
  /** The note editors in cards: the open note is written in its card. */
  private readonly editors = new Map<number, { host: HTMLElement; handle: NoteEditorHandle }>()
  /** The drawn words of the notes, by the same order. */
  private readonly texts = new Map<number, { destroy(): void; update(source: string): boolean }>()
  private layout: NotesLayout = 'none'
  private left = 0
  private textWidth = 0
  private needsHeights = false
  private otherTheme = false
  private destroyed = false

  private readonly request = {
    read: (view: EditorView): Measure => this.read(view),
    write: (measure: Measure, view: EditorView): void => this.write(measure, view),
  }

  constructor(private readonly view: EditorView) {
    this.container.className = 'cm-notes-margin'
    view.scrollDOM.append(this.container)
    view.requestMeasure(this.request)
  }

  update(update: ViewUpdate): void {
    const { state, startState } = update
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      state.field(footnoteField) !== startState.field(footnoteField) ||
      state.field(activeNoteField) !== startState.field(activeNoteField) ||
      state.facet(footnoteConfig) !== startState.facet(footnoteConfig)
    ) {
      update.view.requestMeasure(this.request)
    }
  }

  destroy(): void {
    this.destroyed = true
    for (const index of [...this.editors.keys()]) this.unmount(index)
    for (const text of this.texts.values()) text.destroy()
    this.texts.clear()
    this.container.remove()
    this.restoreText()
  }

  private read(view: EditorView): Measure {
    const notes = view.state.field(footnoteField)
    const config = view.state.facet(footnoteConfig)
    const scroller = view.scrollDOM
    const room = scroller.clientWidth
    let layout: NotesLayout = 'none'
    const needed = this.layout === 'margin' ? MIN_ROOM - HYSTERESIS : MIN_ROOM
    if (notes.length > 0 && config.mode === 'margin') layout = room >= needed ? 'margin' : 'panel'

    const usable = room - 2 * EDGE
    const textWidth = Math.max(MIN_TEXT, Math.min(maxText(), usable - GAP - CARD_WIDTH))
    const left = EDGE + Math.max(0, (usable - (textWidth + GAP + CARD_WIDTH)) / 2)

    const items: Measure['items'] = []
    if (layout === 'margin') {
      const origin = scroller.getBoundingClientRect().top - scroller.scrollTop
      for (const [index, note] of notes.entries()) {
        if (note.from < view.viewport.from || note.from > view.viewport.to) continue
        const coords = view.coordsAtPos(note.from)
        if (!coords) continue
        items.push({
          note,
          index,
          wanted: coords.top - origin,
          height: this.cards.get(index)?.offsetHeight || GUESS_HEIGHT,
        })
      }
    }
    return { layout, textWidth, left, items, active: view.state.field(activeNoteField) }
  }

  private write(measure: Measure, view: EditorView): void {
    const config = view.state.facet(footnoteConfig)
    const layoutChanged =
      measure.layout !== this.layout ||
      (measure.layout === 'margin' &&
        (measure.left !== this.left || measure.textWidth !== this.textWidth))
    this.layout = measure.layout
    this.left = measure.left
    this.textWidth = measure.textWidth

    // The text column makes room for the cards.
    if (measure.layout === 'margin') {
      const content = view.contentDOM
      content.style.maxWidth = `${measure.textWidth}px`
      content.style.marginLeft = `${measure.left}px`
      content.style.marginRight = '0'
    } else this.restoreText()
    this.container.style.display = measure.layout === 'margin' ? '' : 'none'

    if (layoutChanged) {
      // Not during this update: CodeMirror takes no transaction while it is measuring.
      queueMicrotask(() => {
        if (this.destroyed) return
        this.otherTheme = !this.otherTheme
        view.dispatch({ effects: remeasure.reconfigure(this.otherTheme ? THEMES[1] : THEMES[0]) })
      })
      config.onLayout?.({ layout: measure.layout, left: measure.left, width: measure.textWidth })
      // The text moved, so the markers did too. Place the cards on the next pass.
      if (measure.layout === 'margin') {
        view.requestMeasure(this.request)
        return
      }
    }
    if (measure.layout !== 'margin') {
      this.prune(new Set())
      return
    }

    const cardLeft = measure.left + measure.textWidth + GAP
    const seen = new Set<number>()
    let bottom = -Infinity
    for (const item of [...measure.items].sort((a, b) => a.wanted - b.wanted)) {
      const card = this.card(view, item.note, item.index)
      seen.add(item.index)
      const top = Math.max(item.wanted, bottom + CARD_GAP)
      card.style.top = `${top}px`
      card.style.left = `${cardLeft}px`
      card.style.width = `${CARD_WIDTH}px`
      const active = measure.active === item.note.from
      card.classList.toggle('active', active)
      this.edit(view, card, item.index, active)
      bottom = top + item.height
    }
    this.prune(seen)
    // Cards just made or changed have a new height, so settle once more.
    if (this.needsHeights) {
      this.needsHeights = false
      view.requestMeasure(this.request)
    }
  }

  private restoreText(): void {
    const content = this.view.contentDOM
    content.style.removeProperty('max-width')
    content.style.removeProperty('margin-left')
    content.style.removeProperty('margin-right')
  }

  /** The card of a note: made when first needed, and kept up to date. */
  private card(view: EditorView, note: NoteView, index: number): HTMLElement {
    const config = view.state.facet(footnoteConfig)
    let card = this.cards.get(index)
    if (!card) {
      card = document.createElement('div')
      card.className = 'cm-note-card'
      card.tabIndex = 0
      card.setAttribute('role', 'button')
      const number = document.createElement('span')
      number.className = 'cm-note-number'
      const text = document.createElement('span')
      text.className = 'cm-note-text'
      card.append(number, text)
      // The card opens the note that has its place in the document order right now.
      const open = (): void => {
        const target = view.state.field(footnoteField)[index]
        if (target) openNote(view, target.from)
      }
      card.addEventListener('mousedown', (event) => {
        if (!(event.target as HTMLElement).closest('.cm-note-edit')) event.preventDefault()
      })
      card.addEventListener('click', (event) => {
        // A click inside the editor of the open note is for the editor.
        if ((event.target as HTMLElement).closest('.cm-note-edit')) return
        open()
      })
      card.addEventListener('keydown', (event) => {
        if ((event.target as HTMLElement).closest('.cm-note-edit')) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      })
      this.container.append(card)
      this.cards.set(index, card)
      this.needsHeights = true
    }
    const numberEl = card.firstElementChild as HTMLElement
    const textEl = card.querySelector('.cm-note-text') as HTMLElement
    if (numberEl.textContent !== String(note.number)) {
      numberEl.textContent = String(note.number)
      this.needsHeights = true
    }
    const text = this.texts.get(index)
    if (note.text === '') {
      // Nothing to draw: the word for an empty note.
      if (text) {
        text.destroy()
        this.texts.delete(index)
      }
      if (textEl.textContent !== config.labels.empty) {
        textEl.textContent = config.labels.empty
        this.needsHeights = true
      }
    } else {
      // The words are drawn with the markup of the text (the factory is the editor's).
      const source = view.state.sliceDoc(note.contentFrom, note.contentTo)
      if (text) {
        if (text.update(source)) this.needsHeights = true
      } else if (config.drawText) {
        textEl.textContent = ''
        this.texts.set(
          index,
          config.drawText(view, textEl, source, true, () => {
            this.needsHeights = true
            view.requestMeasure(this.request)
          }),
        )
        this.needsHeights = true
      } else if (textEl.textContent !== note.text) {
        textEl.textContent = note.text
        this.needsHeights = true
      }
    }
    textEl.classList.toggle('empty', note.text === '')
    card.setAttribute('aria-label', config.labels.edit(note.number))
    return card
  }

  /** The open note is written in its card: a small editor takes the place of the text. */
  private edit(view: EditorView, card: HTMLElement, index: number, active: boolean): void {
    const open = this.editors.get(index)
    const { mountEditor } = view.state.facet(footnoteConfig)
    if (!active || !mountEditor) {
      if (open) this.unmount(index)
      card.classList.remove('editing')
      return
    }
    if (open) return
    const host = document.createElement('div')
    host.className = 'cm-note-edit'
    card.append(host)
    card.classList.add('editing')
    this.editors.set(index, { host, handle: mountEditor(host, view) })
    this.editors.get(index)!.handle.focus()
    this.needsHeights = true
  }

  private unmount(index: number): void {
    const open = this.editors.get(index)
    if (!open) return
    this.editors.delete(index)
    open.handle.destroy()
    open.host.remove()
    this.needsHeights = true
  }

  private prune(keep: Set<number>): void {
    for (const [index, card] of this.cards) {
      if (!keep.has(index)) {
        this.unmount(index)
        this.texts.get(index)?.destroy()
        this.texts.delete(index)
        card.remove()
        this.cards.delete(index)
      }
    }
  }
}

export const footnoteMargin: Extension = [
  ViewPlugin.fromClass(MarginPlugin),
  remeasure.of(THEMES[0]),
]
