import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { icon } from '../icons'
import { openNote } from '../footnoteState'
import type { NoteView } from '../footnoteState'

/** The small widgets of the simple markup. The widgets of citations, quotes, images and the like have files of their own. */

// --- widgets -----------------------------------------------------------------------------------------

/** A comment, shown as a small dashed pill. A click puts the caret next to it, which reveals the source. */
export class CommentPill extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly label: string,
  ) {
    super()
  }

  override eq(other: CommentPill): boolean {
    return other.text === this.text && other.label === this.label
  }

  override toDOM(): HTMLElement {
    const pill = document.createElement('span')
    pill.className = 'cm-comment-pill'
    pill.setAttribute('role', 'note')
    pill.setAttribute('aria-label', this.label)
    pill.title = this.text
    const text = document.createElement('span')
    text.className = 'cm-comment-pill-text'
    text.textContent = this.text.length > 40 ? `${this.text.slice(0, 40)}…` : this.text
    pill.append(icon('message', 12), text)
    return pill
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/** Three dots in the words, drawn as the single character the PDF prints. */
export class Ellipsis extends WidgetType {
  override eq(): boolean {
    return true
  }

  override toDOM(): HTMLElement {
    const ellipsis = document.createElement('span')
    ellipsis.textContent = '…'
    return ellipsis
  }
}

/** A footnote's marker: a small superscript number. A click opens the note. */
export class FootnoteMarker extends WidgetType {
  constructor(
    private readonly note: NoteView,
    private readonly label: string,
    private readonly active: boolean,
    private readonly selected: boolean,
  ) {
    super()
  }

  override eq(other: FootnoteMarker): boolean {
    return (
      other.note.number === this.note.number &&
      other.label === this.label &&
      other.active === this.active &&
      other.selected === this.selected
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const marker = document.createElement('sup')
    marker.className =
      'cm-footnote-marker' + (this.active ? ' active' : '') + (this.selected ? ' selected' : '')
    marker.textContent = String(this.note.number)
    marker.setAttribute('role', 'button')
    marker.setAttribute('aria-label', this.label)
    marker.title = this.note.text
    // Keep the selection where it is: the note opens in its own editor.
    marker.addEventListener('mousedown', (event) => event.preventDefault())
    // The note may have moved since this element was made, so ask where the marker is now.
    marker.addEventListener('click', () => openNote(view, view.posAtDOM(marker)))
    return marker
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** A list item's bullet or number, drawn in place of its `-` or `+`. */
export class ListMarker extends WidgetType {
  constructor(private readonly label: string) {
    super()
  }

  override eq(other: ListMarker): boolean {
    return other.label === this.label
  }

  override toDOM(): HTMLElement {
    const marker = document.createElement('span')
    marker.className = 'cm-list-marker'
    marker.textContent = this.label
    return marker
  }

  override ignoreEvent(): boolean {
    return false
  }
}
