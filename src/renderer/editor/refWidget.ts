import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { TargetKind } from '@core/typst/targets'
import { attachChipTooltip, tipLine } from './chipTooltip'
import { TARGET_ICONS, icon } from './icons'
import { openRef } from './refState'
import type { RefConfig } from './refState'
import { sameData } from './sameData'

export type RefChipState = 'ok' | 'missing' | 'excluded'

/** What a reference points at, for its tooltip. */
export interface RefInfo {
  kind: TargetKind
  /** What the PDF prints: "Abschnitt 2.1". */
  text: string
  /** The heading's text, the caption, or the formula. */
  title: string
  /** The sheet it is in, when that is not the open one. */
  sheet: string | null
}
/**
 * A cross-reference as a chip: "Abbildung 3", "Abschnitt 2.1". It only displays and is atomic: a
 * click opens the picker. A reference whose label no sheet has is marked (dashed, in the danger
 * colour), and so is one that points into a sheet outside the export, because the PDF would not
 * compile either way.
 */
export class RefWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly state: RefChipState,
    private readonly label: string,
    private readonly config: RefConfig,
    private readonly flags: { active: boolean; selected: boolean },
    private readonly info: RefInfo | null = null,
  ) {
    super()
  }

  override eq(other: RefWidget): boolean {
    return (
      other.text === this.text &&
      other.state === this.state &&
      other.label === this.label &&
      sameData(other.info, this.info) &&
      other.flags.active === this.flags.active &&
      other.flags.selected === this.flags.selected &&
      other.config.labels === this.config.labels
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('span')
    el.className =
      'cm-xref' +
      (this.state === 'ok' ? '' : ` ${this.state}`) +
      (this.flags.active ? ' active' : '') +
      (this.flags.selected ? ' selected' : '')
    el.textContent = this.text
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', this.config.labels.aria(this.text))
    attachChipTooltip(el, () => (el.classList.contains('active') ? null : this.tooltip()))
    // The click does not move the caret. The reference may have moved since this element was made,
    // so ask where it is now.
    el.addEventListener('mousedown', (event) => event.preventDefault())
    el.addEventListener('click', () => openRef(view, view.posAtDOM(el)))
    return el
  }

  /** The target: the kind's icon and what the PDF prints, then the heading or caption in full. */
  private tooltip(): HTMLElement | null {
    const root = document.createElement('div')
    root.className = 'cm-chip-tip-body'
    if (this.info) {
      const head = tipLine('cm-chip-tip-ref', this.info.text)
      head.prepend(icon(TARGET_ICONS[this.info.kind], 14, 'cm-chip-tip-icon'))
      root.append(head)
      if (this.info.title) root.append(tipLine('cm-chip-tip-title', this.info.title))
      if (this.info.sheet) root.append(tipLine('cm-chip-tip-meta', this.info.sheet))
    }
    if (this.state === 'missing')
      root.append(tipLine('cm-chip-tip-note missing', this.config.labels.missing(this.label)))
    else if (this.state === 'excluded')
      root.append(tipLine('cm-chip-tip-note missing', this.config.labels.excluded(this.label)))
    return root.childElementCount > 0 ? root : null
  }

  override ignoreEvent(): boolean {
    return true
  }
}
