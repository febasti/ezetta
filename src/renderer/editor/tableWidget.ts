import { redo, undo } from '@codemirror/commands'
import { WidgetType } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { chipText } from '@core/bib/cite'
import { newId } from '@core/typst/ids'
import {
  captionEdit,
  cellEdit,
  cellSegments,
  insertRow,
  isCellText,
  pasteGrid,
  parseGrid,
  rewriteTable,
} from '@core/typst/tables'
import type { Align, CellSegment, TableModel } from '@core/typst/tables'
import { citeConfig } from './citeState'
import { activeTableField, setActiveTable, tableAtPos } from './tableState'
import type { TableConfig, TableView } from './tableState'
import { el } from './dom'
import { sameData } from './sameData'

/**
 * A table in the editor: drawn as a table with its number and caption, and edited in place. A click
 * on a cell turns it into a text field with the cell's source; what is typed goes into the sheet at
 * once, as a normal transaction (so undo works), and only the text of that cell changes. Changes of
 * structure (rows, columns, alignment) come from the toolbar above the table (`tableToolbar.ts`) and
 * rewrite the table. The widget is atomic like the others: the caret cannot enter it from the text.
 */

/** What the handlers of one drawn table need, kept up to date when it is redrawn. */
interface Context {
  table: TableView
  config: TableConfig
  view: EditorView
  readOnly: boolean
  /** The cell that is a text field right now. */
  active: { row: number; column: number } | null
}
const contexts = new WeakMap<HTMLElement, Context>()

const ALIGN_CLASS: Record<Align, string> = {
  auto: '',
  left: 'align-left',
  center: 'align-center',
  right: 'align-right',
}

/** The table that is at this element now (the document may have moved since it was drawn). */
function current(root: HTMLElement): TableView | null {
  const ctx = contexts.get(root)
  if (!ctx) return null
  return tableAtPos(ctx.view.state, ctx.view.posAtDOM(root)) ?? ctx.table
}

// --- drawing a cell -------------------------------------------------------------------------------

function drawSegments(parent: HTMLElement, segments: CellSegment[], view: EditorView): void {
  for (const segment of segments) {
    if (segment.kind === 'text') parent.append(document.createTextNode(segment.text))
    else if (segment.kind === 'cite') {
      const config = view.state.facet(citeConfig)
      const entry = config.lookup(segment.key)
      const chip = el('span', 'cm-cite' + (entry ? '' : ' missing'))
      chip.textContent = entry
        ? chipText(entry, { language: config.language, supplement: segment.supplement })
        : segment.key
      parent.append(chip)
    } else {
      const node = el(segment.kind === 'emphasis' ? 'em' : 'strong')
      drawSegments(node, segment.children, view)
      parent.append(node)
    }
  }
}

/** The cell as it is read: its source with the markup drawn. */
function drawCell(shown: HTMLElement, text: string, view: EditorView): void {
  shown.replaceChildren()
  drawSegments(shown, cellSegments(text), view)
  shown.classList.toggle('empty', text.trim() === '')
}

function autosize(field: HTMLTextAreaElement): void {
  field.style.height = 'auto'
  field.style.height = `${field.scrollHeight}px`
}

// --- building and updating the DOM ----------------------------------------------------------------

function buildTable(root: HTMLElement, table: TableView): HTMLTableElement {
  const ctx = contexts.get(root)!
  const element = el('table', 'cm-table')
  const head = table.header ? el('thead') : null
  const body = el('tbody')
  table.model.rows.forEach((row, r) => {
    const tr = el('tr')
    row.forEach((_, c) => {
      const cell = el(table.header && r === 0 ? 'th' : 'td')
      cell.dataset['row'] = String(r)
      cell.dataset['column'] = String(c)
      const shown = el('div', 'cm-table-shown')
      cell.append(shown)
      if (!ctx.readOnly) {
        const field = el('textarea', 'cm-table-field')
        field.rows = 1
        field.hidden = true
        field.spellcheck = false
        field.setAttribute('aria-label', ctx.config.labels.cell(r + 1, c + 1))
        cell.append(field)
        wireCell(root, cell, field, r, c)
      }
      tr.append(cell)
    })
    ;(head && r === 0 ? head : body).append(tr)
  })
  if (head) element.append(head)
  element.append(body)
  return element
}

/** Fills the cells from the table: the drawn text, the alignment, and (unless being typed in) the field. */
function fillTable(root: HTMLElement, table: TableView): void {
  const ctx = contexts.get(root)!
  const align = table.model.align ?? []
  for (const cell of root.querySelectorAll<HTMLElement>('td, th')) {
    const r = Number(cell.dataset['row'])
    const c = Number(cell.dataset['column'])
    const text = table.model.rows[r]?.[c] ?? ''
    cell.className = ALIGN_CLASS[align[c] ?? 'auto']
    const shown = cell.querySelector<HTMLElement>('.cm-table-shown')!
    if (shown.dataset['text'] !== text) {
      drawCell(shown, text, ctx.view)
      shown.dataset['text'] = text
    }
    const field = cell.querySelector<HTMLTextAreaElement>('.cm-table-field')
    if (field) {
      field.classList.toggle('align-right', align[c] === 'right')
      field.classList.toggle('align-center', align[c] === 'center')
      // Undo or an outside change: the field shows the text of the document, unless it holds text
      // the document cannot (brackets that do not match yet).
      if (!field.hidden && field.value !== text && field.getAttribute('aria-invalid') !== 'true') {
        field.value = text
        autosize(field)
      }
    }
  }
}

function fillCaption(root: HTMLElement, table: TableView): void {
  const ctx = contexts.get(root)!
  const caption = root.querySelector<HTMLElement>('.cm-table-caption')
  if (!caption) return
  const number = caption.querySelector<HTMLElement>('.cm-table-number')!
  number.textContent =
    table.number !== null ? `${ctx.config.supplement} ${table.number}${ctx.config.separator}` : ''
  const field = caption.querySelector<HTMLInputElement>('input')
  if (field && document.activeElement !== field) field.value = table.caption?.text ?? ''
  else if (!field)
    caption.querySelector('.cm-table-caption-text')!.textContent = table.caption?.text ?? ''
}

function shapeOf(table: TableView): string {
  return `${table.kind}:${table.model.rows.length}x${table.model.rows[0]?.length ?? 0}:${table.header}`
}

function label(table: TableView, ctx: Context): string {
  return table.number !== null
    ? ctx.config.labels.aria(ctx.config.supplement, table.number, table.caption?.text ?? '')
    : ctx.config.labels.ariaPlain
}

// --- editing a cell -------------------------------------------------------------------------------

/** Makes a cell a text field, with the focus in it. */
function activate(
  root: HTMLElement,
  row: number,
  column: number,
  caret: 'start' | 'end' | 'all' = 'end',
): void {
  const ctx = contexts.get(root)
  const table = current(root)
  if (!ctx || !table || ctx.readOnly) return
  const cell = root.querySelector<HTMLElement>(`[data-row="${row}"][data-column="${column}"]`)
  const field = cell?.querySelector<HTMLTextAreaElement>('.cm-table-field')
  if (!cell || !field) return
  if (ctx.active && (ctx.active.row !== row || ctx.active.column !== column))
    deactivateCell(root, ctx.active.row, ctx.active.column)
  ctx.active = { row, column }
  const text = table.model.rows[row]?.[column] ?? ''
  field.hidden = false
  cell.querySelector<HTMLElement>('.cm-table-shown')!.hidden = true
  if (field.value !== text) field.value = text
  field.removeAttribute('aria-invalid')
  autosize(field)
  field.focus()
  const at = caret === 'start' ? 0 : field.value.length
  field.setSelectionRange(caret === 'all' ? 0 : at, at)
  cell.classList.add('editing')
  const marked = ctx.view.state.field(activeTableField)
  if (marked?.from !== table.from || marked.row !== row || marked.column !== column)
    ctx.view.dispatch({ effects: setActiveTable.of({ from: table.from, row, column }) })
  ctx.view.requestMeasure()
}

function deactivateCell(root: HTMLElement, row: number, column: number): void {
  const cell = root.querySelector<HTMLElement>(`[data-row="${row}"][data-column="${column}"]`)
  const field = cell?.querySelector<HTMLTextAreaElement>('.cm-table-field')
  if (!cell || !field) return
  field.hidden = true
  cell.querySelector<HTMLElement>('.cm-table-shown')!.hidden = false
  cell.classList.remove('editing')
}

function deactivateAll(root: HTMLElement): void {
  const ctx = contexts.get(root)
  if (!ctx?.active) return
  deactivateCell(root, ctx.active.row, ctx.active.column)
  ctx.active = null
  ctx.view.dispatch({ effects: setActiveTable.of(null) })
  ctx.view.requestMeasure()
}

/** Leaves the table: the caret goes behind it, and the editor has the focus. */
function exit(root: HTMLElement): void {
  const ctx = contexts.get(root)
  const table = current(root)
  if (!ctx || !table) return
  deactivateAll(root)
  ctx.view.dispatch({ selection: { anchor: table.end }, scrollIntoView: true })
  ctx.view.focus()
}

function move(
  root: HTMLElement,
  row: number,
  column: number,
  caret: 'start' | 'end' | 'all' = 'all',
): void {
  const table = current(root)
  if (!table) return
  const rows = table.model.rows.length
  const columns = table.model.rows[0]?.length ?? 1
  if (row < 0 || column < 0) return
  if (column >= columns) {
    row += 1
    column = 0
  }
  if (row >= rows) return exit(root)
  activate(root, row, column, caret)
}

/** Writes a changed structure into the sheet, then puts the focus back in the cell. */
export function applyModel(
  view: EditorView,
  table: TableView,
  model: TableModel,
  focus?: { row: number; column: number },
): void {
  // A bare table that becomes a figure is numbered, so it gets its id (a label) now.
  const id = newId('tbl', view.state.doc.toString())
  view.dispatch({ changes: rewriteTable(table, model, id), userEvent: 'input.type' })
  if (focus) focusTableCell(view, table.from, focus.row, focus.column)
}

/** Puts the editing in a cell of the table that starts at `from`. */
export function focusTableCell(view: EditorView, from: number, row: number, column: number): void {
  for (const root of view.contentDOM.querySelectorAll<HTMLElement>('.cm-table-block')) {
    if (view.posAtDOM(root) === from) {
      activate(root, row, column, 'all')
      return
    }
  }
}

function wireCell(
  root: HTMLElement,
  cell: HTMLElement,
  field: HTMLTextAreaElement,
  row: number,
  column: number,
): void {
  const ctxOf = () => contexts.get(root)!
  // The click does not move the caret of the text: the cell takes the editing.
  cell.addEventListener('mousedown', (event) => {
    if (event.target === field) return
    event.preventDefault()
    activate(root, row, column)
  })

  field.addEventListener('input', () => {
    const ctx = ctxOf()
    const table = current(root)
    if (!table) return
    autosize(field)
    if (!isCellText(field.value)) {
      field.setAttribute('aria-invalid', 'true')
      field.title = ctx.config.labels.invalid
      return
    }
    field.removeAttribute('aria-invalid')
    field.removeAttribute('title')
    const edit = cellEdit(table, row, column, field.value)
    if (edit) ctx.view.dispatch({ changes: edit, userEvent: 'input.type' })
    else if (table.ragged || table.model.rows[row]?.[column] !== field.value) {
      // A cell that is not in the text yet: the table is written out in full.
      const model = { ...table.model, rows: table.model.rows.map((r) => [...r]) }
      model.rows[row]![column] = field.value
      applyModel(ctx.view, table, model, { row, column })
    }
    ctx.view.requestMeasure()
  })

  field.addEventListener('keydown', (event) => {
    const ctx = ctxOf()
    const table = current(root)
    if (!table) return
    const mod = event.metaKey || event.ctrlKey
    const atStart = field.selectionStart === 0 && field.selectionEnd === 0
    const atEnd =
      field.selectionStart === field.value.length && field.selectionEnd === field.value.length
    const firstLine = !field.value.slice(0, field.selectionStart).includes('\n')
    const lastLine = !field.value.slice(field.selectionEnd).includes('\n')
    const columns = table.model.rows[0]?.length ?? 1
    if (mod && event.key.toLowerCase() === 'z') {
      // One undo history: the sheet's, not the field's own.
      event.preventDefault()
      if (event.shiftKey) redo(ctx.view)
      else undo(ctx.view)
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redo(ctx.view)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) {
        if (column > 0) move(root, row, column - 1)
        else if (row > 0) move(root, row - 1, columns - 1)
        else exit(root)
      } else move(root, row, column + 1)
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (row === table.model.rows.length - 1) {
        // Enter in the last row adds a row: typing a table in goes on without the mouse.
        const model = insertRow(table.model, table.model.rows.length)
        applyModel(ctx.view, table, model, { row: row + 1, column })
      } else move(root, row + 1, column)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      exit(root)
    } else if (event.key === 'ArrowUp' && firstLine && !event.shiftKey) {
      if (row > 0) {
        event.preventDefault()
        move(root, row - 1, column)
      }
    } else if (event.key === 'ArrowDown' && lastLine && !event.shiftKey) {
      if (row < table.model.rows.length - 1) {
        event.preventDefault()
        move(root, row + 1, column)
      }
    } else if (event.key === 'ArrowLeft' && atStart && !mod && !event.shiftKey) {
      if (column > 0) {
        event.preventDefault()
        move(root, row, column - 1, 'end')
      }
    } else if (event.key === 'ArrowRight' && atEnd && !mod && !event.shiftKey) {
      if (column < columns - 1) {
        event.preventDefault()
        move(root, row, column + 1, 'start')
      }
    }
  })

  // Several cells copied from a spreadsheet fill the table from here, which grows if it must.
  field.addEventListener('paste', (event) => {
    const grid = parseGrid(event.clipboardData?.getData('text/plain') ?? '')
    const table = current(root)
    if (!grid || !table) return
    event.preventDefault()
    applyModel(ctxOf().view, table, pasteGrid(table.model, row, column, grid), { row, column })
  })

  field.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null
    if (next && (root.contains(next) || (next as HTMLElement).closest?.('.cm-table-toolbar')))
      return
    queueMicrotask(() => {
      const ctx = contexts.get(root)
      if (!ctx?.active) return
      const focus = document.activeElement
      if (focus && (root.contains(focus) || focus.closest('.cm-table-toolbar'))) return
      deactivateAll(root)
    })
  })
}

// --- the widget -----------------------------------------------------------------------------------

export class TableWidget extends WidgetType {
  constructor(
    private readonly table: TableView,
    private readonly config: TableConfig,
    private readonly flags: { selected: boolean; readOnly: boolean },
  ) {
    super()
  }

  override eq(other: TableWidget): boolean {
    const a = this.table
    const b = other.table
    return (
      a.number === b.number &&
      sameData(a.header, b.header) &&
      sameData(a.model, b.model) &&
      other.flags.selected === this.flags.selected &&
      other.config.labels === this.config.labels &&
      other.config.supplement === this.config.supplement &&
      other.config.separator === this.config.separator
    )
  }

  override get estimatedHeight(): number {
    return 40 + this.table.model.rows.length * 34
  }

  private paint(root: HTMLElement): void {
    const { table, flags } = this
    root.classList.toggle('selected', flags.selected)
    root.setAttribute('aria-label', label(table, contexts.get(root)!))
    fillTable(root, table)
    fillCaption(root, table)
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = el('figure', 'cm-table-block')
    root.dataset['shape'] = shapeOf(this.table)
    root.setAttribute('role', 'group')
    contexts.set(root, {
      table: this.table,
      config: this.config,
      view,
      readOnly: this.flags.readOnly,
      active: null,
    })
    const scroll = el('div', 'cm-table-scroll')
    scroll.append(buildTable(root, this.table))
    root.append(scroll)
    if (this.table.kind === 'figure') {
      const caption = el('figcaption', 'cm-table-caption')
      caption.append(el('span', 'cm-table-number'))
      if (this.flags.readOnly) caption.append(el('span', 'cm-table-caption-text'))
      else {
        const input = el('input', 'cm-table-caption-input')
        input.type = 'text'
        input.placeholder = this.config.labels.captionPlaceholder
        input.setAttribute('autocomplete', 'off')
        input.addEventListener('input', () => {
          const t = current(root)
          if (!t || !isCellText(input.value)) return
          const edit = captionEdit(t, input.value, newId('tbl', view.state.doc.toString()))
          if (edit) contexts.get(root)!.view.dispatch({ changes: edit, userEvent: 'input.type' })
        })
        input.addEventListener('keydown', (event) => {
          const v = contexts.get(root)!.view
          const mod = event.metaKey || event.ctrlKey
          if (mod && event.key.toLowerCase() === 'z') {
            event.preventDefault()
            if (event.shiftKey) redo(v)
            else undo(v)
          } else if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault()
            exit(root)
          }
        })
        caption.append(input)
      }
      root.append(caption)
    }
    if (this.flags.readOnly) {
      root.addEventListener('click', () => {
        const t = current(root)
        if (t) this.config.onOpen?.(view, t.from)
      })
    }
    this.paint(root)
    return root
  }

  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const ctx = contexts.get(dom)
    if (!ctx || dom.dataset['shape']?.split(':')[0] !== this.table.kind) return false
    ctx.table = this.table
    ctx.config = this.config
    ctx.view = view
    ctx.readOnly = this.flags.readOnly
    const shape = shapeOf(this.table)
    if (dom.dataset['shape'] !== shape) {
      // Rows or columns came or went: the grid is drawn again, and the editing goes on in the
      // same cell (or the last one that is left).
      dom.dataset['shape'] = shape
      const active = ctx.active
      const old = dom.querySelector('table')!
      old.replaceWith(buildTable(dom, this.table))
      ctx.active = null
      this.paint(dom)
      if (active) {
        const rows = this.table.model.rows.length
        const columns = this.table.model.rows[0]?.length ?? 1
        activate(dom, Math.min(active.row, rows - 1), Math.min(active.column, columns - 1), 'all')
      }
    } else this.paint(dom)
    view.requestMeasure()
    return true
  }

  override ignoreEvent(): boolean {
    return true
  }

  override destroy(dom: HTMLElement): void {
    contexts.delete(dom)
  }
}
