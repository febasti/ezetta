import { syntaxTree } from '@codemirror/language'
import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { scanTables, tableAt } from '@core/typst/tables'
import type { Table } from '@core/typst/tables'
import { fullTree, sourceText } from './source'

export interface TableConfig {
  /** Numbered tables in the sheets before this one, so numbering runs on across the project. */
  offset: number
  /** The word before the number ("Tabelle", "Table"): the language of the text, not of the UI. */
  supplement: string
  /** The mark after the number of the caption: ":" in "Tabelle 1:". */
  separator: string
  labels: {
    aria: (supplement: string, number: number, caption: string) => string
    ariaPlain: string
    captionPlaceholder: string
    cell: (row: number, column: number) => string
    invalid: string
  }
  /** Opens a table. Without it a table is edited in place; the continuous view opens the sheet. */
  onOpen?: (view: EditorView, from: number) => void
}

const DEFAULT_CONFIG: TableConfig = {
  offset: 0,
  supplement: 'Tabelle',
  separator: ':',
  labels: {
    aria: (supplement, number, caption) => `${supplement} ${number}: ${caption}`,
    ariaPlain: 'Table',
    captionPlaceholder: '',
    cell: (row, column) => `${row},${column}`,
    invalid: '',
  },
}

export const tableConfig = Facet.define<Partial<TableConfig>, TableConfig>({
  combine: (values) => Object.assign({}, DEFAULT_CONFIG, ...values) as TableConfig,
})

/** A table of the sheet, with the number it shows (only a table in a figure is numbered). */
export interface TableView extends Table {
  number: number | null
}

function compute(state: EditorState): readonly TableView[] {
  const tree = fullTree(state)
  const { offset } = state.facet(tableConfig)
  let count = offset
  return scanTables(tree, sourceText(state)).map((table) => ({
    ...table,
    number: table.kind === 'figure' ? ++count : null,
  }))
}

/** The tables of the document, rebuilt when the text, the syntax, or the numbering changes. */
export const tableField = StateField.define<readonly TableView[]>({
  create: (state) => compute(state),
  update(value, tr) {
    const changed =
      tr.docChanged ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.state.facet(tableConfig) !== tr.startState.facet(tableConfig)
    return changed ? compute(tr.state) : value
  },
})

/** The cell being edited: which table (where it starts), and the row and column in it. */
export interface ActiveTable {
  from: number
  row: number
  column: number
}

export const setActiveTable = StateEffect.define<ActiveTable | null>()

/** Where the editing is, for the toolbar above the table. Mapped through every change. */
export const activeTableField = StateField.define<ActiveTable | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setActiveTable)) return effect.value
    return value === null || !tr.docChanged
      ? value
      : { ...value, from: tr.changes.mapPos(value.from, -1) }
  },
})

export function activeTable(state: EditorState): TableView | undefined {
  const active = state.field(activeTableField)
  return active === null ? undefined : state.field(tableField).find((t) => t.from === active.from)
}

/** The table at a position of the document. */
export function tableAtPos(state: EditorState, pos: number): TableView | null {
  return tableAt(state.field(tableField), pos) as TableView | null
}
