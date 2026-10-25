import { syntaxTree } from '@codemirror/language'
import { redo, undo } from '@codemirror/commands'
import { Facet } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { showTooltip } from '@codemirror/view'
import type { EditorView, TooltipView } from '@codemirror/view'
import type { BibEntry } from '@core/bib/bibtex'
import { chipText, entryLine, matchesQuery } from '@core/bib/cite'
import {
  addToCitation,
  groupForm,
  insertCitations,
  insertMissing,
  isCitableKey,
  removeFromGroup,
  removeMissing,
  resolveMissing,
  setCheck,
  unifyGroup,
  updateCitation,
} from '@core/typst/citations'
import type { Citation, MissingCitation } from '@core/typst/citations'
import type { TextEdit } from '@core/typst/figures'
import { addSourceCitations, setAttribution } from '@core/typst/quotes'
import {
  activeCiteField,
  activeGroup,
  activeMissing,
  activeNew,
  activeNewSource,
  citeConfig,
  citeField,
  closeCite,
  closeCiteEffect,
  missingField,
  openCiteEffect,
  openNewCiteEffect,
} from '../../editor/citeState'
import { icon } from '../../editor/icons'
import { quoteField } from '../../editor/quoteState'
import { centered } from '../../editor/popover'
import { el } from '../../editor/dom'

/** Labels of the citation editor, supplied by the editor (it has the i18n layer). */
export interface CiteEditorLabels {
  editor: string
  search: string
  searchMore: string
  searchReplace: string
  notFound: string
  missingRow: string
  missingRowDetail: string
  resultsEmpty: string
  resultsNone: string
  supplement: string
  supplementPlaceholder: string
  supplementInvalid: string
  check: string
  checkNote: string
  checkNotePlaceholder: string
  form: string
  /** The form's label for a group of several works, for their number (the noun in the right form). */
  formGroup: (count: number) => string
  forms: Record<'normal' | 'prose' | 'year' | 'author' | 'none', string>
  remove: string
  /** The remove button of one work in a group of several. */
  removeWork: string
  /** The remove button on a chip; `{work}` is its text. */
  removeChip: string
  hintSelect: string
  /** The chip of a place that still needs a citation. */
  needed: string
  /** How many entries could not be read. */
  problems: (count: number) => string
}

export const citeLabelsFacet = Facet.define<CiteEditorLabels, CiteEditorLabels | undefined>({
  combine: (values) => values[0],
})

const FORMS = ['normal', 'prose', 'year', 'author', 'none'] as const
const MAX_RESULTS = 60

type Model =
  | { kind: 'new'; at: number; attributionOf?: number }
  | { kind: 'group'; members: Citation[] }
  | { kind: 'marker'; marker: MissingCitation }

type Row = { kind: 'missing' } | { kind: 'work'; entry: BibEntry }

/**
 * The citation editor: one place to choose works and to edit them, for a citation that is not in
 * the text yet and for one that is.
 *
 * A field holds the works as chips, with a search after them. Typing searches the bibliography;
 * Enter or a click adds the work (the first one inserts the citation, so its chip appears in the
 * text at once), Backspace in the empty search selects and then removes the last chip. Clicking a
 * chip selects it: a row below shows its page reference and a flag to check it later, and the next
 * work chosen replaces it. The form is the group's, in a dropdown in front of the field; chosen
 * before the first work, it is the new citation's. Every change goes into the sheet at once as a
 * normal transaction, so undo works.
 */
function createCiteEditor(view: EditorView): TooltipView {
  const labels = view.state.facet(citeLabelsFacet)!
  const config = () => view.state.facet(citeConfig)

  const dom = el('div', 'cm-cite-editor k-popover')
  dom.setAttribute('role', 'dialog')
  dom.setAttribute('aria-label', labels.editor)

  // --- the field: chips and the search
  const field = el('div', 'cm-cite-field')
  const tokens = el('span', 'cm-cite-tokens')
  const search = el('input', 'cm-cite-search')
  search.type = 'text'
  search.setAttribute('role', 'combobox')
  search.setAttribute('aria-expanded', 'true')
  search.setAttribute('aria-controls', 'cm-cite-results')
  search.setAttribute('autocomplete', 'off')
  search.setAttribute('aria-label', labels.search)
  search.spellcheck = false
  field.append(tokens, search)

  // --- the form, for the whole group: a dropdown in front of the field
  const formSelect = el('select', 'cm-cite-form')
  for (const form of FORMS) {
    const option = el('option', '', labels.forms[form])
    option.value = form
    formSelect.append(option)
  }
  /** Shows a form the editor has no name for (written by hand), so it is not taken for another. */
  const otherForm = el('option')
  otherForm.disabled = true
  otherForm.hidden = true
  formSelect.append(otherForm)
  const formBox = el('span', 'cm-cite-formbox')
  formBox.append(formSelect, icon('chevron-down', 14, 'cm-cite-form-chevron'))
  const top = el('div', 'cm-cite-top')
  top.append(formBox, field)

  const results = el('ul', 'cm-cite-results')
  results.id = 'cm-cite-results'
  results.setAttribute('role', 'listbox')

  // --- the row of the selected work (built once, so typing in it is not interrupted)
  const detail = el('div', 'cm-cite-detail')
  const hint = el('div', 'cm-cite-hint', labels.hintSelect)
  const selectedWork = el('div', 'cm-cite-work')
  const supplement = el('input', 'k-field')
  supplement.type = 'text'
  supplement.placeholder = labels.supplementPlaceholder
  supplement.setAttribute('autocomplete', 'off')
  supplement.spellcheck = false
  const invalid = el('div', 'cm-cite-error', labels.supplementInvalid)
  invalid.hidden = true
  const check = el('button', 'k-icon-button cm-cite-check')
  check.type = 'button'
  check.title = labels.check
  check.setAttribute('aria-label', labels.check)
  check.append(icon('flag', 16, 'off'), icon('flag-filled', 16, 'on'))
  const removeWork = el('button', 'k-icon-button cm-cite-remove')
  removeWork.type = 'button'
  removeWork.append(icon('trash', 16))
  const memberRow = el('div', 'cm-cite-member-row')
  memberRow.append(supplement, check, removeWork)
  const note = el('input', 'k-field cm-cite-note')
  note.type = 'text'
  note.placeholder = labels.checkNotePlaceholder
  note.setAttribute('autocomplete', 'off')
  note.setAttribute('aria-label', labels.checkNote)
  const selectedBox = el('div', 'cm-cite-member')
  selectedBox.append(selectedWork, memberRow, invalid, note)
  detail.append(hint, selectedBox)

  // --- entries of the bibliography that could not be read: works may be missing from the results
  const problems = el('div', 'cm-cite-problems')

  dom.append(top, results, detail, problems)

  // --- state of this editor
  let query = ''
  let active = 0
  /** Index of the selected work in the group. */
  let selected: number | null = null
  /** The next work chosen replaces the selected one: the writer selected it to change it. */
  let replacing = false
  /** Select the work just inserted, once the text shows it. */
  let selectInserted = false
  let rows: Row[] = []
  let resultsKey = ''
  /** The form chosen before the first work: the new citation is written with it. */
  let pendingForm: (typeof FORMS)[number] = 'normal'

  function current(): Model {
    const at = activeNew(view.state)
    if (at !== null) {
      const attributionOf = activeNewSource(view.state)
      return attributionOf === null ? { kind: 'new', at } : { kind: 'new', at, attributionOf }
    }
    const members = activeGroup(view.state)
    if (members && members.length > 0) return { kind: 'group', members }
    const marker = activeMissing(view.state)
    return marker ? { kind: 'marker', marker } : { kind: 'new', at: view.state.selection.main.to }
  }

  const doc = (): string => view.state.doc.toString()
  const input = (from: number, to = from) => ({
    doc: doc(),
    tree: syntaxTree(view.state),
    from,
    to,
  })
  const dispatchEdit = (change: TextEdit | TextEdit[]): void =>
    view.dispatch({ changes: change, userEvent: 'input.type' })

  // --- choosing a work
  function choose(row: Row | undefined): void {
    if (!row) return
    const model = current()
    if (row.kind === 'missing') {
      if (model.kind !== 'new') return
      const result = insertMissing(input(model.at))
      if (result.changes.length > 0) view.dispatch({ changes: result.changes, userEvent: 'input' })
      closeCite(view)
      view.focus()
      return
    }
    const key = row.entry.key
    query = ''
    search.value = ''
    if (model.kind === 'new' && model.attributionOf !== undefined) {
      // A block quote's source: written in its attribution, not in the quoted text.
      const quote = view.state.field(quoteField).find((q) => q.from === model.attributionOf)
      const added = quote && addSourceCitations(doc(), quote, { keys: [key], form: pendingForm })
      if (!added) return
      selectInserted = true
      view.dispatch({
        changes: added.edit,
        effects: openCiteEffect.of({ from: added.start, focusAt: added.start }),
        userEvent: 'input',
      })
    } else if (model.kind === 'new') {
      const result = insertCitations(input(model.at), { keys: [key], form: pendingForm })
      const change = result.changes[0]
      if (!change) return
      // The citation is in the text and the editor goes on with it, in one step: with the text
      // changed first, the editor would briefly have nothing to show, and close.
      const start = change.from + (change.insert.startsWith(' ') ? 1 : 0)
      selectInserted = true
      view.dispatch({
        changes: result.changes,
        effects: openCiteEffect.of({ from: start, focusAt: start }),
        userEvent: 'input',
      })
    } else if (model.kind === 'marker') {
      const edit = resolveMissing(doc(), model.marker, { keys: [key], form: pendingForm })
      const start = edit.from + (edit.insert.startsWith(' ') ? 1 : 0)
      selectInserted = true
      view.dispatch({
        changes: edit,
        effects: openCiteEffect.of({ from: start, focusAt: start }),
        userEvent: 'input',
      })
    } else if (selected !== null && replacing) {
      // The selected work is replaced: its page reference and check mark stay.
      replacing = false
      const edit = updateCitation(doc(), model.members[selected]!, { key })
      if (edit) dispatchEdit(edit)
    } else {
      const last = model.members[model.members.length - 1]!
      dispatchEdit(addToCitation(doc(), last, { keys: [key] }))
    }
    sync()
  }

  // --- taking works out
  function removeAt(index: number): void {
    const model = current()
    if (model.kind === 'marker') {
      view.dispatch({ changes: removeMissing(model.marker), effects: closeCiteEffect.of(null) })
      view.focus()
      return
    }
    if (model.kind !== 'group' || !model.members[index]) return
    const change = removeFromGroup(doc(), model.members, index)
    selected = null
    replacing = false
    if (model.members.length === 1) {
      // The last work: the citation is gone, and the editor stays for a new one at its place.
      const only = model.members[0]!
      const quote =
        only.attributionOf === undefined
          ? undefined
          : view.state.field(quoteField).find((q) => q.from === only.attributionOf)
      // A source with nothing left in it goes too, so no empty `attribution: []` stays behind.
      const emptied =
        quote?.attribution &&
        (
          doc().slice(quote.attribution.innerFrom, only.from) +
          doc().slice(only.end, quote.attribution.innerTo)
        ).trim() === ''
      const clear = quote && emptied ? setAttribution(doc(), quote, null) : null
      view.dispatch({
        changes: clear ?? change,
        effects: openNewCiteEffect.of(
          quote ? { at: only.from, attributionOf: quote.from } : { at: only.from },
        ),
        userEvent: 'input.type',
      })
    } else dispatchEdit(change)
    search.focus()
  }

  // --- drawing
  function renderTokens(model: Model): void {
    const out: HTMLElement[] = []
    const token = (text: string, missing: boolean, index: number, onRemove: () => void) => {
      const chip = el('span', 'cm-cite-token' + (missing ? ' missing' : ''))
      chip.setAttribute('role', 'button')
      chip.setAttribute('aria-pressed', String(selected === index))
      if (selected === index) chip.classList.add('selected')
      chip.append(el('span', 'cm-cite-token-text', text))
      const x = el('button', 'cm-cite-token-remove', '×')
      x.type = 'button'
      x.tabIndex = -1
      x.setAttribute('aria-label', labels.removeChip.replace('{work}', text))
      x.addEventListener('mousedown', (event) => event.preventDefault())
      x.addEventListener('click', (event) => {
        event.stopPropagation()
        onRemove()
      })
      chip.append(x)
      // The click selects the work; the search keeps the focus, so typing replaces it.
      chip.addEventListener('mousedown', (event) => event.preventDefault())
      chip.addEventListener('click', () => {
        selected = selected === index ? null : index
        replacing = selected !== null
        search.focus()
        sync()
      })
      out.push(chip)
    }
    if (model.kind === 'group') {
      const cfg = config()
      model.members.forEach((citation, index) => {
        const entry = cfg.lookup(citation.key)
        const text = entry
          ? chipText(entry, { language: cfg.language, supplement: citation.supplement })
          : citation.key
        token(text, !entry, index, () => removeAt(index))
      })
    } else if (model.kind === 'marker') {
      token(labels.needed, true, 0, () => removeAt(0))
    }
    tokens.replaceChildren(...out)
  }

  function computeRows(model: Model): Row[] {
    const out: Row[] = []
    if (model.kind === 'new') out.push({ kind: 'missing' })
    const taken = new Set(model.kind === 'group' ? model.members.map((c) => c.key) : [])
    const found = config()
      .all()
      .filter((e) => isCitableKey(e.key) && !taken.has(e.key) && matchesQuery(e, query))
      .slice(0, MAX_RESULTS)
    for (const entry of found) out.push({ kind: 'work', entry })
    return out
  }

  function renderResults(model: Model): void {
    const cfg = config()
    const members = model.kind === 'group' ? model.members.map((c) => c.key).join(',') : model.kind
    const key = `${query}|${members}|${cfg.all().length}|${cfg.language}`
    if (key !== resultsKey) {
      resultsKey = key
      rows = computeRows(model)
      active = Math.min(
        model.kind === 'new' && rows.length > 1 ? 1 : 0,
        Math.max(rows.length - 1, 0),
      )
    }
    const items = rows.map((row, index) => {
      const li = el('li', 'k-row')
      li.id = `cm-cite-row-${index}`
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', String(index === active))
      if (index === active) li.classList.add('active')
      if (row.kind === 'missing') {
        li.classList.add('missing')
        li.append(
          el('span', 'label', labels.missingRow),
          el('span', 'detail', labels.missingRowDetail),
        )
      } else {
        li.append(
          el('span', 'label', chipText(row.entry, { language: cfg.language })),
          el('span', 'detail', row.entry.title ?? ''),
          el('kbd', '', row.entry.key),
        )
      }
      li.addEventListener('mousedown', (event) => event.preventDefault())
      li.addEventListener('pointermove', () => {
        if (active === index) return
        active = index
        renderResults(current())
      })
      li.addEventListener('click', () => choose(row))
      return li
    })
    if (rows.filter((r) => r.kind === 'work').length === 0) {
      const none = el(
        'li',
        'k-row none',
        cfg.all().length === 0 ? labels.resultsEmpty : query.trim() ? labels.resultsNone : '',
      )
      if (none.textContent) items.push(none)
    }
    results.replaceChildren(...items)
    search.setAttribute('aria-activedescendant', rows[active] ? `cm-cite-row-${active}` : '')
    results.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' })
  }

  function renderDetail(model: Model): void {
    const member = model.kind === 'group' && selected !== null ? model.members[selected] : undefined
    hint.hidden = !(model.kind === 'group' && !member)
    selectedBox.hidden = !member
    if (!member || model.kind !== 'group') return
    const cfg = config()
    const entry = cfg.lookup(member.key)
    selectedWork.textContent = entry
      ? entryLine(entry, cfg.language)
      : labels.notFound.replace('{key}', member.key)
    selectedWork.title = selectedWork.textContent
    selectedWork.classList.toggle('missing', !entry)
    const removeLabel = model.members.length > 1 ? labels.removeWork : labels.remove
    removeWork.title = removeLabel
    removeWork.setAttribute('aria-label', removeLabel)
    check.setAttribute('aria-pressed', String(member.check !== null))
    note.hidden = member.check === null
    supplement.setAttribute('aria-label', `${labels.supplement}: ${member.key}`)
    // Do not overwrite what the writer is typing in.
    if (document.activeElement !== supplement) supplement.value = member.supplement ?? ''
    if (document.activeElement !== note) note.value = member.check?.note ?? ''
  }

  function renderForm(model: Model): void {
    if (model.kind !== 'group') {
      formSelect.value = pendingForm
      formSelect.setAttribute('aria-label', labels.form)
      formSelect.title = labels.form
      return
    }
    pendingForm = 'normal'
    const form = groupForm(model.members) ?? 'normal'
    const known = form in labels.forms
    otherForm.textContent = known ? '' : form
    otherForm.hidden = known
    if (known) formSelect.value = form
    else formSelect.selectedIndex = FORMS.length
    // With several works it says that the choice is for all of them, also as the tooltip.
    const name = model.members.length > 1 ? labels.formGroup(model.members.length) : labels.form
    formSelect.setAttribute('aria-label', name)
    formSelect.title = name
  }

  function renderProblems(): void {
    const found = config().problems()
    problems.hidden = found.length === 0
    problems.textContent = labels.problems(found.length)
    problems.title = found.join('\n')
  }

  function sync(): void {
    const model = current()
    if (model.kind !== 'group') selected = null
    else if (selectInserted) {
      const at = view.state.field(activeCiteField)
      const index =
        at?.kind === 'group' ? model.members.findIndex((c) => c.from === at.focusAt) : -1
      selected = index >= 0 ? index : null
      selectInserted = false
    } else if (selected !== null && selected >= model.members.length) selected = null
    search.placeholder =
      selected !== null && replacing
        ? labels.searchReplace
        : model.kind === 'group' || model.kind === 'marker'
          ? labels.searchMore
          : labels.search
    renderTokens(model)
    renderResults(model)
    renderDetail(model)
    renderForm(model)
    renderProblems()
  }

  // --- events
  search.addEventListener('input', () => {
    query = search.value
    sync()
  })
  search.addEventListener('keydown', (event) => {
    const model = current()
    const members = model.kind === 'group' ? model.members.length : 0
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      active = Math.max(0, Math.min(rows.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)))
      renderResults(model)
    } else if (event.key === 'Enter') {
      choose(rows[active])
    } else if (event.key === 'Backspace' && search.value === '' && members > 0) {
      // The first press selects the last work, the second takes it out.
      if (selected === null) {
        selected = members - 1
        replacing = true
        sync()
      } else removeAt(selected)
    } else if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      search.value === '' &&
      members > 0
    ) {
      if (event.key === 'ArrowLeft')
        selected = selected === null ? members - 1 : Math.max(0, selected - 1)
      else selected = selected === null || selected >= members - 1 ? null : selected + 1
      replacing = selected !== null
      sync()
    } else if (event.key === 'Escape' && selected !== null && replacing) {
      selected = null
      replacing = false
      sync()
    } else return
    event.preventDefault()
    event.stopPropagation()
  })

  formSelect.addEventListener('change', () => {
    const form = formSelect.value as (typeof FORMS)[number]
    const model = current()
    if (model.kind !== 'group') {
      pendingForm = form
      search.focus()
      return
    }
    const edits = unifyGroup(doc(), model.members, form === 'normal' ? null : form)
    if (edits.length > 0) dispatchEdit(edits)
  })
  supplement.addEventListener('input', () => {
    const model = current()
    if (model.kind !== 'group' || selected === null) return
    const result = updateCitation(doc(), model.members[selected]!, {
      supplement: supplement.value,
    })
    if (result) dispatchEdit(result)
    const ok =
      result !== null || supplement.value.trim() === (model.members[selected]!.supplement ?? '')
    supplement.setAttribute('aria-invalid', String(!ok))
    invalid.hidden = ok
    view.requestMeasure()
  })
  check.addEventListener('click', () => {
    const model = current()
    if (model.kind !== 'group' || selected === null) return
    const member = model.members[selected]!
    const marked = member.check !== null
    const edit = setCheck(doc(), member, marked ? false : {})
    if (edit) dispatchEdit(edit)
    if (!marked) queueMicrotask(() => note.focus())
  })
  note.addEventListener('input', () => {
    const model = current()
    if (model.kind !== 'group' || selected === null) return
    const edit = setCheck(doc(), model.members[selected]!, { note: note.value })
    if (edit) dispatchEdit(edit)
  })
  removeWork.addEventListener('click', () => {
    if (selected !== null) removeAt(selected)
  })

  // Escape closes the editor, Enter in a field of the row finishes; one undo history.
  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && event.target !== search)) {
      event.preventDefault()
      closeCite(view)
      view.focus()
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo(view)
      else undo(view)
    }
  })
  dom.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null
    if (next && dom.contains(next)) return
    queueMicrotask(() => {
      if (view.state.field(activeCiteField) !== null && !dom.contains(document.activeElement))
        closeCite(view)
    })
  })

  sync()
  return centered(view, {
    dom,
    mount() {
      search.focus()
    },
    update() {
      sync()
    },
  })
}

/** The editor, shown while a citation or a marker is open, or a new citation is being chosen. */
export const citeEditor: Extension = [
  activeCiteField,
  showTooltip.compute([activeCiteField, citeField, missingField], (state) => {
    const at = activeNew(state)
    if (at !== null) return { pos: at, above: false, arrow: false, create: createCiteEditor }
    const group = activeGroup(state)
    if (group) return { pos: group[0]!.from, above: false, arrow: false, create: createCiteEditor }
    const marker = activeMissing(state)
    return marker
      ? { pos: marker.from, above: false, arrow: false, create: createCiteEditor }
      : null
  }),
]
