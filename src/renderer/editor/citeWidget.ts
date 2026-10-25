import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { chipText, entryDetail, isParenthetical } from '@core/bib/cite'
import type { Citation, MissingCitation } from '@core/typst/citations'
import { attachChipTooltip, tipLine } from './chipTooltip'
import { openCite } from './citeState'
import { icon } from './icons'
import type { CiteConfig } from './citeState'
import { sameData } from './sameData'

/** The chip's text and whether the work is in the bibliography. */
export function chipFor(citation: Citation, config: CiteConfig): { text: string; found: boolean } {
  const entry = config.lookup(citation.key)
  if (!entry) {
    const page = citation.supplement?.trim()
    return { text: page ? `${citation.key}, ${page}` : citation.key, found: false }
  }
  return {
    text: chipText(entry, {
      language: config.language,
      form: citation.form,
      supplement: citation.supplement,
    }),
    found: true,
  }
}

/** A work of a chip, as its tooltip tells it. */
export interface ChipWork {
  key: string
  /** False for a key that is not in the bibliography: the other fields are empty. */
  found: boolean
  authors: string
  year: string
  title: string
  container: string
}

/** What one chip shows: a group of citations that print together. */
export interface GroupChip {
  /** The works side by side, with "; " between, as the PDF prints a group. */
  text: string
  /** Keys of the works that are not in the bibliography. */
  missing: string[]
  /** Every work prints nothing in the text (`form: none`). */
  unprinted: boolean
  /**
   * The citation is part of the sentence ("Meier (2015) zeigt", or the author alone): it is drawn
   * as text with a strong underline, not as a pill like the citations in brackets.
   */
  inSentence: boolean
  /** The check marks of the works, with their notes. */
  checks: (string | null)[]
  /** The works, in full, for the tooltip. */
  works: ChipWork[]
}

export function groupChipFor(group: readonly Citation[], config: CiteConfig): GroupChip {
  const parts = group.map((citation) => ({ citation, chip: chipFor(citation, config) }))
  // As in the PDF, a group in the normal form is in one pair of brackets: "(Smith 2020; Jones 2019)".
  const joined = parts.map((p) => p.chip.text).join('; ')
  const bracketed = group.every((c) => isParenthetical(c.form))
  return {
    text: bracketed ? `(${joined})` : joined,
    missing: parts.filter((p) => !p.chip.found).map((p) => p.citation.key),
    unprinted: group.every((c) => c.form === 'none'),
    inSentence: group.every((c) => c.form === 'prose' || c.form === 'author'),
    checks: group.flatMap((c) => (c.check ? [c.check.note] : [])),
    works: group.map((c): ChipWork => {
      const entry = config.lookup(c.key)
      return entry
        ? { key: c.key, found: true, ...entryDetail(entry, config.language) }
        : { key: c.key, found: false, authors: '', year: '', title: '', container: '' }
    }),
  }
}

/** The tooltip of a chip: each work with its whole title, then what is wrong or to do about it. */
function tooltipFor(chip: GroupChip, config: CiteConfig): HTMLElement {
  const root = document.createElement('div')
  root.className = 'cm-chip-tip-body'
  for (const work of chip.works) {
    const block = document.createElement('div')
    block.className = 'cm-chip-tip-work'
    if (!work.found) {
      block.append(tipLine('cm-chip-tip-note missing', config.labels.missing(work.key)))
    } else {
      block.append(tipLine('cm-chip-tip-title', work.title))
      const meta = [work.authors, work.year, work.container].filter(Boolean).join(' · ')
      if (meta) block.append(tipLine('cm-chip-tip-meta', meta))
    }
    root.append(block)
  }
  if (chip.unprinted) root.append(tipLine('cm-chip-tip-note', config.labels.unprinted))
  for (const note of chip.checks) {
    const line = tipLine('cm-chip-tip-note check', config.labels.check(note))
    line.prepend(icon('flag-filled', 11, 'cm-chip-tip-flag'))
    root.append(line)
  }
  return root
}

/** The element of a chip: its text, the flag of a check mark, and the notes as its tooltip. */
export function chipElement(
  chip: GroupChip,
  config: CiteConfig,
  flags: { active: boolean; selected: boolean },
): HTMLElement {
  const el = document.createElement('span')
  el.className =
    'cm-cite' +
    (chip.missing.length > 0 ? ' missing' : '') +
    (chip.unprinted ? ' unprinted' : '') +
    (chip.inSentence ? ' prose' : '') +
    (chip.checks.length > 0 ? ' check' : '') +
    (flags.active ? ' active' : '') +
    (flags.selected ? ' selected' : '')
  el.append(document.createTextNode(chip.text))
  if (chip.checks.length > 0) el.append(icon('flag-filled', 11, 'cm-cite-flag'))
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', config.labels.aria(chip.text))
  // Not while its editor is open: the editor says it all.
  attachChipTooltip(el, () => (el.classList.contains('active') ? null : tooltipFor(chip, config)))
  return el
}

/**
 * Citations that print together are one chip: "Smith 2020; Jones 2019, S. 4". It only displays and
 * is atomic: a click opens the editor popover for all of them, and its source can only be edited
 * with "Quelltext" on. A work that is not in the bibliography shows its key, marked. A small dot
 * marks a group with a work to check later, and a dashed outline one that prints nothing in the
 * text (`form: none`).
 */
export class CiteWidget extends WidgetType {
  constructor(
    private readonly chip: GroupChip,
    private readonly config: CiteConfig,
    private readonly flags: { active: boolean; selected: boolean },
  ) {
    super()
  }

  override eq(other: CiteWidget): boolean {
    return (
      sameData(other.chip, this.chip) &&
      other.flags.active === this.flags.active &&
      other.flags.selected === this.flags.selected &&
      other.config.labels === this.config.labels
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const el = chipElement(this.chip, this.config, this.flags)
    // The click does not move the caret. The citation may have moved since this element was made,
    // so ask where it is now.
    el.addEventListener('mousedown', (event) => event.preventDefault())
    el.addEventListener('click', () => openCite(view, view.posAtDOM(el)))
    return el
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** The mark of a place that still needs a citation: a chip that says so, with the note. */
export class NeededWidget extends WidgetType {
  constructor(
    private readonly marker: MissingCitation,
    private readonly config: CiteConfig,
    private readonly active: boolean,
    private readonly selected: boolean,
  ) {
    super()
  }

  override eq(other: NeededWidget): boolean {
    return (
      other.active === this.active &&
      other.selected === this.selected &&
      other.config.labels === this.config.labels
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const text = this.config.labels.needed
    const chip = document.createElement('span')
    chip.className =
      'cm-cite-needed' + (this.active ? ' active' : '') + (this.selected ? ' selected' : '')
    chip.textContent = text
    chip.setAttribute('role', 'button')
    chip.setAttribute('aria-label', text)
    chip.addEventListener('mousedown', (event) => event.preventDefault())
    chip.addEventListener('click', () => openCite(view, view.posAtDOM(chip)))
    return chip
  }

  override ignoreEvent(): boolean {
    return true
  }
}
