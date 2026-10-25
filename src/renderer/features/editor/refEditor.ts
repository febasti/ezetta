import { Facet } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorSelection } from '@codemirror/state'
import { showTooltip } from '@codemirror/view'
import type { EditorView, TooltipView } from '@codemirror/view'
import type { TextEdit } from '@core/typst/figures'
import {
  TARGET_KINDS,
  crossRefSource,
  labelEdit,
  labelsIn,
  newLabel,
  referenceText,
} from '@core/typst/targets'
import type { NumberedTarget, TargetKind } from '@core/typst/targets'
import {
  activeCrossRef,
  activeNewRef,
  activeRefField,
  closeRef,
  refConfig,
  refField,
  resolve,
} from '../../editor/refState'
import { TARGET_ICONS, icon } from '../../editor/icons'
import { centered } from '../../editor/popover'
import { el } from '../../editor/dom'

/** Labels of the picker, supplied by the editor (it has the i18n layer). */
export interface RefEditorLabels {
  editor: string
  search: string
  /** Nothing in the project can be referenced yet. */
  empty: string
  none: string
  /** The dropdown in front of the field: everything, or one kind of target. */
  kind: string
  kinds: Record<'all' | TargetKind, string>
  goTo: string
  remove: string
  /** `{label}`: the reference points at something that no sheet has. */
  missing: string
  /** `{label}`: it points into a sheet outside the export. */
  excluded: string
  /** The reference could not be set up because the other sheet changed or could not be written. */
  failed: string
}

export const refLabelsFacet = Facet.define<RefEditorLabels, RefEditorLabels | undefined>({
  combine: (values) => values[0],
})

const MAX_RESULTS = 80

/** Every label of the project and of the text, so a new one is free. */
export function takenLabels(view: EditorView): Set<string> {
  const taken = labelsIn(view.state.doc.toString())
  for (const target of view.state.field(refField).targets) if (target.label) taken.add(target.label)
  return taken
}

/**
 * Makes a reference to a target: gives the target its label if it has none, and returns the label
 * and the edit that writes the label (null if it has one already or lies in another sheet, which
 * is written to its file first). Null when the label could not be made.
 */
export async function labelFor(
  view: EditorView,
  target: NumberedTarget,
): Promise<{ label: string; edit: TextEdit | null } | null> {
  if (target.label !== null) return { label: target.label, edit: null }
  const config = view.state.facet(refConfig)
  const taken = takenLabels(view)
  if (target.path === config.livePath) {
    const label = newLabel(target.kind, target.title, taken)
    return { label, edit: labelEdit(target, label) }
  }
  const label = await config.labelOther(target, taken)
  return label === null ? null : { label, edit: null }
}

/** The space a reference needs before it, after a word or a closing mark. */
const spaceBefore = (doc: string, at: number): string => {
  const before = doc[at - 1]
  return before !== undefined && !/[\s([{"„“‚‘-]/.test(before) ? ' ' : ''
}

/**
 * Writes the reference to a target into the text, as one step that undo takes back: at `at` for a
 * new one, in place of the old one when `replace` names it. The target's label is written too when
 * it had none.
 */
export async function writeReference(
  view: EditorView,
  target: NumberedTarget,
  where: { kind: 'new'; at: number } | { kind: 'replace'; from: number; to: number },
  failed: () => void,
): Promise<boolean> {
  const made = await labelFor(view, target)
  if (!made) {
    failed()
    return false
  }
  const doc = view.state.doc.toString()
  // The text may have changed while another sheet was written: the place moves with it.
  const state = view.state
  const changes: TextEdit[] = []
  let end: number
  if (where.kind === 'new') {
    const insert = spaceBefore(doc, where.at) + crossRefSource(made.label, doc.slice(where.at))
    changes.push({ from: where.at, to: where.at, insert })
    end = where.at
  } else {
    const old = activeCrossRef(state)
    const supplement = old && old.from === where.from ? old.supplement : null
    const insert =
      supplement !== null
        ? `@${made.label}[${supplement}]`
        : crossRefSource(made.label, doc.slice(where.to))
    changes.push({ from: where.from, to: where.to, insert })
    end = where.to
  }
  if (made.edit) changes.push(made.edit)
  const mapped = state.changes(changes)
  view.dispatch({
    changes: mapped,
    selection: EditorSelection.cursor(mapped.mapPos(end, 1)),
    scrollIntoView: true,
    userEvent: 'input',
  })
  return true
}

type Model = { kind: 'new'; at: number } | { kind: 'ref'; from: number; to: number; label: string }

/**
 * The picker for cross-references: a search field and the list of everything in the project that a
 * reference can point at (headings, figures, tables, and block formulas), with the number each one
 * prints. Enter or a click writes the reference, at the caret for a new one and in place of the old
 * one for a reference that is open. A target without a label gets one at that moment.
 */
function createRefEditor(view: EditorView): TooltipView {
  const labels = view.state.facet(refLabelsFacet)!
  const config = () => view.state.facet(refConfig)

  const dom = el('div', 'cm-ref-editor k-popover')
  dom.setAttribute('role', 'dialog')
  dom.setAttribute('aria-label', labels.editor)

  const note = el('div', 'cm-ref-note')
  const kindSelect = el('select', 'cm-ref-kind')
  kindSelect.setAttribute('aria-label', labels.kind)
  for (const kind of ['all', ...TARGET_KINDS] as const) {
    const option = el('option', '', labels.kinds[kind])
    option.value = kind
    kindSelect.append(option)
  }
  const kindBox = el('span', 'cm-ref-kindbox')
  kindBox.append(kindSelect, icon('chevron-down', 14, 'cm-ref-kind-chevron'))
  const search = el('input', 'cm-ref-search')
  search.type = 'text'
  search.setAttribute('role', 'combobox')
  search.setAttribute('aria-expanded', 'true')
  search.setAttribute('aria-controls', 'cm-ref-results')
  search.setAttribute('autocomplete', 'off')
  search.setAttribute('aria-label', labels.search)
  search.placeholder = labels.search
  search.spellcheck = false

  const results = el('ul', 'cm-ref-results')
  results.id = 'cm-ref-results'
  results.setAttribute('role', 'listbox')

  const footer = el('div', 'cm-ref-footer')
  const goTo = el('button', 'k-button', labels.goTo)
  goTo.type = 'button'
  const remove = el('button', 'k-button k-button-danger cm-ref-remove', labels.remove)
  remove.type = 'button'
  footer.append(goTo, remove)

  // The kind and the field are one control, as in the citation editor.
  const top = el('div', 'cm-ref-top')
  top.append(kindBox, search)

  dom.append(top, note, results, footer)

  let query = ''
  let kind: 'all' | TargetKind = 'all'
  let active = 0
  let rows: NumberedTarget[] = []
  let busy = false

  function current(): Model {
    const ref = activeCrossRef(view.state)
    if (ref) return { kind: 'ref', from: ref.from, to: ref.to, label: ref.label }
    return { kind: 'new', at: activeNewRef(view.state) ?? view.state.selection.main.to }
  }

  function listed(): NumberedTarget[] {
    const supplements = config().supplements
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const sheets = config().sheetName
    const kindOrder = (kind: NumberedTarget['kind']): number => TARGET_KINDS.indexOf(kind)
    return view.state
      .field(refField)
      .targets.filter((t) => t.inExport)
      .filter((t) => kind === 'all' || t.kind === kind)
      .filter((t) => {
        if (words.length === 0) return true
        const haystack =
          `${referenceText(t, supplements)} ${t.title} ${t.label ?? ''} ${sheets(t.path)}`.toLowerCase()
        return words.every((word) => haystack.includes(word))
      })
      .map((t, i) => ({ t, i }))
      .sort((a, b) => kindOrder(a.t.kind) - kindOrder(b.t.kind) || a.i - b.i)
      .map(({ t }) => t)
      .slice(0, MAX_RESULTS)
  }

  async function choose(target: NumberedTarget | undefined): Promise<void> {
    if (!target || busy) return
    busy = true
    try {
      const model = current()
      const where =
        model.kind === 'new'
          ? ({ kind: 'new', at: model.at } as const)
          : ({ kind: 'replace', from: model.from, to: model.to } as const)
      const done = await writeReference(view, target, where, () => {
        note.textContent = labels.failed
        note.hidden = false
      })
      if (done) {
        closeRef(view)
        view.focus()
      }
    } finally {
      busy = false
    }
  }

  function draw(): void {
    const model = current()
    rows = listed()
    const supplements = config().supplements
    const index = view.state.field(refField)
    const currentLabel = model.kind === 'ref' ? model.label : null
    if (active >= rows.length) active = Math.max(0, rows.length - 1)
    results.replaceChildren()
    if (rows.length === 0) {
      const none = el(
        'li',
        'k-row none',
        index.targets.some((t) => t.inExport) ? labels.none : labels.empty,
      )
      none.setAttribute('role', 'option')
      none.setAttribute('aria-disabled', 'true')
      results.append(none)
    }
    rows.forEach((target, i) => {
      const item = el('li', 'k-row')
      item.setAttribute('role', 'option')
      const isActive = i === active
      item.setAttribute('aria-selected', String(isActive))
      if (isActive) item.classList.add('active')
      if (currentLabel !== null && target.label === currentLabel) item.classList.add('current')
      item.append(icon(TARGET_ICONS[target.kind], 16, 'kind-icon'))
      item.append(el('span', 'label', referenceText(target, supplements)))
      item.append(el('span', 'detail', target.title))
      if (target.path !== config().livePath)
        item.append(el('span', 'where', config().sheetName(target.path)))
      item.addEventListener('mousedown', (event) => event.preventDefault())
      item.addEventListener('click', () => void choose(target))
      item.addEventListener('mousemove', () => {
        if (active !== i) {
          active = i
          draw()
        }
      })
      results.append(item)
    })
    results.querySelector('.active')?.scrollIntoView({ block: 'nearest' })

    // A reference in the text: what it points at, and the buttons for it.
    footer.hidden = model.kind !== 'ref'
    if (model.kind === 'ref') {
      const resolved = resolve(index, model.label)
      goTo.hidden = resolved.state === 'missing'
      note.hidden = resolved.state === 'ok'
      if (resolved.state === 'missing')
        note.textContent = labels.missing.replace('{label}', model.label)
      else if (resolved.state === 'excluded')
        note.textContent = labels.excluded.replace('{label}', model.label)
    } else if (!busy) note.hidden = true
    view.requestMeasure()
  }

  search.addEventListener('input', () => {
    query = search.value
    active = 0
    draw()
  })
  kindSelect.addEventListener('change', () => {
    kind = kindSelect.value as typeof kind
    active = 0
    draw()
    search.focus()
  })

  goTo.addEventListener('click', () => {
    const model = current()
    if (model.kind !== 'ref') return
    const resolved = resolve(view.state.field(refField), model.label)
    if (resolved.state === 'missing') return
    closeRef(view)
    config().goTo(view, resolved.target.path, resolved.target.at)
  })
  remove.addEventListener('click', () => {
    const model = current()
    if (model.kind !== 'ref') return
    view.dispatch({
      changes: { from: model.from, to: model.to, insert: '' },
      userEvent: 'delete',
    })
    closeRef(view)
    view.focus()
  })

  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeRef(view)
      view.focus()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (event.target === kindSelect) return // the dropdown keeps its own arrow keys
      event.preventDefault()
      if (rows.length === 0) return
      active = (active + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length
      draw()
    } else if (event.key === 'Enter' && event.target === search) {
      event.preventDefault()
      void choose(rows[active])
    }
  })
  dom.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null
    if (next && dom.contains(next)) return
    queueMicrotask(() => {
      if (view.state.field(activeRefField) !== null && !dom.contains(document.activeElement))
        closeRef(view)
    })
  })

  // The target the reference has now is where the list starts.
  const model = current()
  if (model.kind === 'ref') {
    const at = listed().findIndex((t) => t.label === model.label)
    if (at >= 0) active = at
  }
  draw()
  return centered(view, {
    dom,
    mount() {
      search.focus()
    },
    update() {
      draw()
    },
  })
}

/** The picker, shown while a reference is open or a new one is being chosen. */
export const refEditor: Extension = [
  activeRefField,
  showTooltip.compute([activeRefField, refField], (state) => {
    const at = activeNewRef(state)
    if (at !== null) return { pos: at, above: false, arrow: false, create: createRefEditor }
    const ref = activeCrossRef(state)
    return ref ? { pos: ref.from, above: false, arrow: false, create: createRefEditor } : null
  }),
]
