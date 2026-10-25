import { Facet } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { showTooltip } from '@codemirror/view'
import type { EditorView, TooltipView } from '@codemirror/view'
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  setAlign,
  setHeader,
} from '@core/typst/tables'
import type { Align } from '@core/typst/tables'
import { icon } from '../../editor/icons'
import { centered } from '../../editor/popover'
import type { IconName } from '../../editor/icons'
import { applyModel } from '../../editor/tableWidget'
import { activeTable, activeTableField, setActiveTable, tableField } from '../../editor/tableState'

/** Labels of the toolbar above a table, supplied by the editor (it has the i18n layer). */
export interface TableToolbarLabels {
  toolbar: string
  rowAbove: string
  rowBelow: string
  columnLeft: string
  columnRight: string
  deleteRow: string
  deleteColumn: string
  /** The name of the group of the three alignments. */
  align: string
  alignLeft: string
  alignCenter: string
  alignRight: string
  header: string
  caption: string
  remove: string
}

export const tableLabelsFacet = Facet.define<TableToolbarLabels, TableToolbarLabels | undefined>({
  combine: (values) => values[0],
})

/** An icon button: the label is its tooltip and its name for screen readers. */
function button(
  name: IconName,
  text: string,
  onclick: () => void,
  className = '',
): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = `k-icon-button ${className}`.trim()
  node.append(icon(name, 16))
  node.title = text
  node.setAttribute('aria-label', text)
  // The focus stays in the cell that is being edited.
  node.addEventListener('mousedown', (event) => event.preventDefault())
  node.addEventListener('click', onclick)
  return node
}

/**
 * The toolbar above a table while one of its cells is being edited: rows, columns, alignment of the
 * column, the header row, a caption, and removing the table, as icons with the names as tooltips. Each change rewrites the table in the
 * sheet as one transaction, so undo takes it back.
 */
function createToolbar(view: EditorView): TooltipView {
  const labels = view.state.facet(tableLabelsFacet)!
  const dom = document.createElement('div')
  dom.className = 'cm-table-toolbar k-popover k-bar'
  dom.setAttribute('role', 'toolbar')
  dom.setAttribute('aria-label', labels.toolbar)

  const run = (
    change: (
      model: NonNullable<ReturnType<typeof activeTable>>['model'],
      row: number,
      column: number,
    ) => {
      model: NonNullable<ReturnType<typeof activeTable>>['model']
      row: number
      column: number
    } | null,
  ): void => {
    const table = activeTable(view.state)
    const at = view.state.field(activeTableField)
    if (!table || !at) return
    const result = change(table.model, at.row, at.column)
    if (result) applyModel(view, table, result.model, { row: result.row, column: result.column })
  }

  const group = (...items: HTMLElement[]): HTMLElement => {
    const box = document.createElement('div')
    box.className = 'k-bar-group'
    box.append(...items)
    return box
  }
  const alignGroup = (items: HTMLElement[]): HTMLElement => {
    const box = group(...items)
    box.setAttribute('role', 'radiogroup')
    box.setAttribute('aria-label', labels.align)
    return box
  }

  const aligns = new Map<Align, HTMLButtonElement>()
  for (const [align, text] of [
    ['left', labels.alignLeft],
    ['center', labels.alignCenter],
    ['right', labels.alignRight],
  ] as const) {
    const b = button(`align-${align}`, text, () =>
      run((model, row, column) =>
        // One of the three is chosen, as with radio buttons: the chosen one stays.
        model.align?.[column] === align
          ? null
          : { model: setAlign(model, column, align), row, column },
      ),
    )
    b.setAttribute('role', 'radio')
    aligns.set(align, b)
  }
  const header = button('table-row', labels.header, () =>
    run((model, row, column) => ({ model: setHeader(model, !model.header), row, column })),
  )
  const caption = button('text-caption', labels.caption, () =>
    run((model, row, column) => ({ model: { ...model, kind: 'figure' }, row, column })),
  )
  const remove = button(
    'trash',
    labels.remove,
    () => {
      const table = activeTable(view.state)
      if (!table) return
      view.dispatch({
        changes: { from: table.from, to: table.end, insert: '' },
        effects: setActiveTable.of(null),
        userEvent: 'delete',
      })
      view.focus()
    },
    'danger',
  )

  dom.append(
    group(
      button('row-insert-top', labels.rowAbove, () =>
        run((model, row, column) => {
          const at = Math.max(row, model.header ? 1 : 0)
          return { model: insertRow(model, at), row: at, column }
        }),
      ),
      button('row-insert-bottom', labels.rowBelow, () =>
        run((model, row, column) => ({ model: insertRow(model, row + 1), row: row + 1, column })),
      ),
      button(
        'row-remove',
        labels.deleteRow,
        () =>
          run((model, row, column) => {
            const next = deleteRow(model, row)
            return next ? { model: next, row: Math.min(row, next.rows.length - 1), column } : null
          }),
        'danger',
      ),
    ),
    group(
      button('column-insert-left', labels.columnLeft, () =>
        run((model, row, column) => ({ model: insertColumn(model, column), row, column })),
      ),
      button('column-insert-right', labels.columnRight, () =>
        run((model, row, column) => ({
          model: insertColumn(model, column + 1),
          row,
          column: column + 1,
        })),
      ),
      button(
        'column-remove',
        labels.deleteColumn,
        () =>
          run((model, row, column) => {
            const next = deleteColumn(model, column)
            return next
              ? { model: next, row, column: Math.min(column, (next.rows[0]?.length ?? 1) - 1) }
              : null
          }),
        'danger',
      ),
    ),
    alignGroup([...aligns.values()]),
    group(header, caption, remove),
  )

  const sync = (): void => {
    const table = activeTable(view.state)
    const at = view.state.field(activeTableField)
    if (!table || !at) return
    const align = table.model.align?.[at.column] ?? 'auto'
    for (const [name, b] of aligns) b.setAttribute('aria-checked', String(align === name))
    header.setAttribute('aria-pressed', String(table.model.header))
    caption.hidden = table.kind === 'figure'
  }
  sync()
  // Tables are centered in the text, and so is their toolbar above them.
  return centered(view, { dom, update: sync }, 'text')
}

/** The toolbar, shown while a cell of a table is being edited. */
export const tableToolbar: Extension = [
  activeTableField,
  showTooltip.compute([activeTableField, tableField], (state) => {
    const table = activeTable(state)
    return table ? { pos: table.from, above: true, arrow: false, create: createToolbar } : null
  }),
]
