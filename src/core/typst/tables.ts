import type { Tree } from '@lezer/common'
import { balanced, callIn, parseArgs, skipGroup } from './args'
import type { TextEdit } from './figures'
import { parseTypst } from './parser'

/**
 * Tables: `#figure(table(columns: 3, table.header[A][B][C], [a], [b], [c]),
 * caption: [Text]) <tbl-x>`, or a bare `#table(…)`. A table is drawn as a grid and edited cell by
 * cell. Only plain tables are read: a number of columns (or a list of widths), an alignment, a
 * header row, and cells that are content blocks. Anything else (merged cells, lines, code in
 * place of a cell, footers) stays visible as source and is never rewritten. Arguments the editor
 * has no field for (stroke, inset, …) are kept as written when the table is changed.
 */

export type Align = 'left' | 'center' | 'right' | 'auto'

/** A cell: where its text is in the document (between the brackets), and the text. */
export interface Cell {
  from: number
  to: number
  text: string
}

export interface Table {
  /** A figure around the table (numbered, with a caption), or a bare table. */
  kind: 'figure' | 'bare'
  /** The extent of the expression, and of the expression plus a `<label>` right after it. */
  from: number
  to: number
  end: number
  label: string | null
  /** The caption's text between its brackets, or null without one. */
  caption: { from: number; to: number; text: string } | null
  columns: number
  align: Align[] | null
  /** The first row is `table.header`. */
  header: boolean
  rows: Cell[][]
  /** The cells do not fill the last row: the next change rewrites the table. */
  ragged: boolean
  model: TableModel
}

/** The table as plain data, for writing it. */
export interface TableModel {
  kind: 'figure' | 'bare'
  /** The width of each column as written (`auto`, `1fr`), or null for a plain number of columns. */
  widths: string[] | null
  align: Align[] | null
  /** An `align:` that is not a list of left, center, right: kept as written. */
  alignRaw: string | null
  header: boolean
  rows: string[][]
  /** Arguments of `table(…)` and of `figure(…)` that are not understood, as written. */
  tableExtra: string[]
  figureExtra: string[]
  caption: string | null
  label: string | null
}

const LABEL = /^[ \t]*<([\p{L}\p{N}_:.-]+)>/u
const ALIGN = /^(left|center|right|auto|start|end)$/

/** True if the text can stand between the brackets of a cell or a caption. */
export const isCellText = balanced

// --- reading --------------------------------------------------------------------------------------

function contentCell(doc: string, from: number, to: number): Cell | null {
  if (doc[from] !== '[' || skipGroup(doc, from, to) !== to) return null
  return { from: from + 1, to: to - 1, text: doc.slice(from + 1, to - 1) }
}

/** `table.header[A][B][C]` or `table.header([A], [B], [C])`. */
function headerCells(doc: string, from: number, to: number): Cell[] | null {
  const name = 'table.header'
  if (!doc.startsWith(name, from)) return null
  let at = from + name.length
  if (doc[at] === '(') {
    const call = callIn(doc, from, to)
    if (!call) return null
    const cells: Cell[] = []
    for (const arg of parseArgs(doc, call.open, call.close)) {
      const cell = arg.name === null ? contentCell(doc, arg.valueFrom, arg.valueTo) : null
      if (!cell) return null
      cells.push(cell)
    }
    return cells
  }
  const cells: Cell[] = []
  while (at < to) {
    if (doc[at] !== '[') return null
    const end = skipGroup(doc, at, to)
    if (end < 0) return null
    cells.push({ from: at + 1, to: end - 1, text: doc.slice(at + 1, end - 1) })
    at = end
  }
  return cells.length > 0 ? cells : null
}

/** `3` or `(auto, 1fr, 1fr)`: the number of columns and, for a list, the widths. */
function readColumns(
  doc: string,
  from: number,
  to: number,
): { count: number; widths: string[] | null } | null {
  const text = doc.slice(from, to).trim()
  if (/^\d+$/.test(text)) {
    const count = Number(text)
    return count > 0 && count <= 60 ? { count, widths: null } : null
  }
  if (doc[from] !== '(' || skipGroup(doc, from, to) !== to) return null
  const args = parseArgs(doc, from, to - 1)
  if (args.length === 0 || args.length > 60 || args.some((a) => a.name !== null)) return null
  const widths = args.map((a) => doc.slice(a.valueFrom, a.valueTo).trim())
  return widths.every((w) => w !== '' && !/[()[\]{}"]/.test(w))
    ? { count: widths.length, widths }
    : null
}

function readAlign(doc: string, from: number, to: number, columns: number): Align[] | null {
  const text = doc.slice(from, to).trim()
  if (ALIGN.test(text)) return Array<Align>(columns).fill(normalize(text))
  if (doc[from] !== '(' || skipGroup(doc, from, to) !== to) return null
  const args = parseArgs(doc, from, to - 1)
  const tokens = args.map((a) => doc.slice(a.valueFrom, a.valueTo).trim())
  if (args.length === 0 || args.some((a) => a.name !== null) || !tokens.every((t) => ALIGN.test(t)))
    return null
  const out = tokens.map(normalize)
  while (out.length < columns) out.push('auto') // fewer entries than columns: the rest is automatic
  return out.slice(0, columns)
}

const normalize = (token: string): Align =>
  token === 'start' ? 'left' : token === 'end' ? 'right' : (token as Align)

interface ReadTable {
  columns: number
  widths: string[] | null
  align: Align[] | null
  alignRaw: string | null
  header: boolean
  rows: Cell[][]
  ragged: boolean
  tableExtra: string[]
}

/** Reads the `table(…)` call in `from`–`to` of the document. */
function readTable(doc: string, from: number, to: number): ReadTable | null {
  const call = callIn(doc, from, to)
  if (!call || call.name !== 'table') return null
  let columns = { count: 1, widths: null as string[] | null }
  let alignArg: { from: number; to: number } | null = null
  const tableExtra: string[] = []
  const items: { from: number; to: number }[] = []
  for (const arg of parseArgs(doc, call.open, call.close)) {
    if (arg.name === 'columns') {
      const read = readColumns(doc, arg.valueFrom, arg.valueTo)
      if (!read) return null
      columns = read
    } else if (arg.name === 'align') alignArg = { from: arg.valueFrom, to: arg.valueTo }
    else if (arg.name !== null) tableExtra.push(doc.slice(arg.from, arg.to))
    else items.push({ from: arg.valueFrom, to: arg.valueTo })
  }
  let header: Cell[] | null = null
  const cells: Cell[] = []
  for (const [index, item] of items.entries()) {
    const head = headerCells(doc, item.from, item.to)
    if (head) {
      if (index !== 0 || head.length !== columns.count) return null
      header = head
      continue
    }
    const cell = contentCell(doc, item.from, item.to)
    if (!cell) return null // table.cell, table.hline, code, a spread: not a plain table
    cells.push(cell)
  }
  const align = alignArg
    ? readAlign(doc, alignArg.from, alignArg.to, columns.count)
    : Array<Align>(columns.count).fill('auto')
  const rows: Cell[][] = header ? [header] : []
  for (let i = 0; i < cells.length; i += columns.count) rows.push(cells.slice(i, i + columns.count))
  if (rows.length === 0) return null
  const ragged = cells.length % columns.count !== 0
  return {
    columns: columns.count,
    widths: columns.widths,
    align,
    alignRaw: alignArg && !align ? doc.slice(alignArg.from, alignArg.to).trim() : null,
    header: header !== null,
    rows,
    ragged,
    tableExtra,
  }
}

function modelOf(
  kind: 'figure' | 'bare',
  read: ReadTable,
  caption: string | null,
  figureExtra: string[],
  label: string | null,
): TableModel {
  const rows = read.rows.map((row) => {
    const texts = row.map((c) => c.text)
    while (texts.length < read.columns) texts.push('')
    return texts
  })
  return {
    kind,
    widths: read.widths,
    align: read.align,
    alignRaw: read.alignRaw,
    header: read.header,
    rows,
    tableExtra: read.tableExtra,
    figureExtra,
    caption,
    label,
  }
}

export function scanTables(tree: Tree, doc: string): Table[] {
  const out: Table[] = []
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'Expression') return undefined
      const node = ref.node
      const nameNode = node.getChild('FuncName')
      const name = nameNode ? doc.slice(nameNode.from, nameNode.to) : ''
      if (name === 'footnote') return false
      const argsNode = node.getChild('Args')
      if (!argsNode || (name !== 'figure' && name !== 'table')) return undefined
      if (node.getChild('Content')) return false // trailing content blocks: not a plain table
      const label = name === 'figure' ? LABEL.exec(doc.slice(node.to, node.to + 120)) : null
      const end = node.to + (label ? label[0].length : 0)

      if (name === 'table') {
        const read = readTable(doc, node.from + 1, node.to)
        if (!read) return false
        const table = {
          kind: 'bare' as const,
          from: node.from,
          to: node.to,
          end: node.to,
          label: null,
          caption: null,
        }
        out.push({ ...table, ...read, model: modelOf('bare', read, null, [], null) })
        return false
      }
      // A figure around a table: the table, a caption, and arguments it does not know.
      let inner: ReadTable | null = null
      let caption: Table['caption'] = null
      const figureExtra: string[] = []
      for (const arg of parseArgs(doc, argsNode.from, argsNode.to - 1)) {
        if (arg.name === null) {
          const read: ReadTable | null = inner ? null : readTable(doc, arg.valueFrom, arg.valueTo)
          if (!read) return false // not a figure around a plain table (an image, say)
          inner = read
        } else if (
          arg.name === 'caption' &&
          doc[arg.valueFrom] === '[' &&
          doc[arg.valueTo - 1] === ']' &&
          skipGroup(doc, arg.valueFrom, arg.valueTo) === arg.valueTo
        ) {
          caption = {
            from: arg.valueFrom + 1,
            to: arg.valueTo - 1,
            text: doc.slice(arg.valueFrom + 1, arg.valueTo - 1),
          }
        } else figureExtra.push(doc.slice(arg.from, arg.to))
      }
      if (!inner) return false
      out.push({
        kind: 'figure',
        from: node.from,
        to: node.to,
        end,
        label: label ? label[1]! : null,
        caption,
        ...inner,
        model: modelOf(
          'figure',
          inner,
          caption?.text ?? null,
          figureExtra,
          label ? label[1]! : null,
        ),
      })
      return false
    },
  })
  return out
}

export function tableAt(tables: readonly Table[], from: number, to = from): Table | null {
  return tables.find((t) => t.from <= from && t.end >= to) ?? null
}

// --- writing --------------------------------------------------------------------------------------

/** The source of a table, one row to a line. */
export function tableSource(model: TableModel): string {
  const columns = model.rows[0]?.length ?? 1
  const figure = model.kind === 'figure'
  const pad = figure ? '    ' : '  '
  const lines: string[] = []
  lines.push(
    model.widths
      ? `columns: (${model.widths.slice(0, columns).join(', ')}),`
      : `columns: ${columns},`,
  )
  if (model.alignRaw) lines.push(`align: ${model.alignRaw},`)
  else if (model.align && model.align.some((a) => a !== 'auto'))
    lines.push(`align: (${model.align.join(', ')}),`)
  for (const extra of model.tableExtra) lines.push(`${extra},`)
  model.rows.forEach((row, index) => {
    const cells = row.map((text) => `[${text}]`)
    lines.push(
      model.header && index === 0 ? `table.header${cells.join('')},` : `${cells.join(', ')},`,
    )
  })
  const body = lines.map((l) => `${pad}${l}`).join('\n')
  if (!figure) return `#table(\n${body}\n)`
  const parts = [`  table(\n${body}\n  ),`]
  if (model.caption) parts.push(`  caption: [${model.caption}],`)
  for (const extra of model.figureExtra) parts.push(`  ${extra},`)
  return `#figure(\n${parts.join('\n')}\n)`
}

/**
 * The edit that writes a changed model in place of the table (its label stays where it is). A bare
 * table that becomes a figure, and so a numbered table, is given `id` as its label, when there is
 * one: that is when a table becomes something a cross-reference can point at.
 */
export function rewriteTable(table: Table, model: TableModel, id?: string): TextEdit {
  const label = model.kind === 'figure' && table.label === null && id ? ` <${id}>` : ''
  return { from: table.from, to: table.to, insert: tableSource(model) + label }
}

const copy = (model: TableModel): TableModel => ({
  ...model,
  widths: model.widths ? [...model.widths] : null,
  align: model.align ? [...model.align] : null,
  rows: model.rows.map((row) => [...row]),
  tableExtra: [...model.tableExtra],
  figureExtra: [...model.figureExtra],
})

const columnsOf = (model: TableModel): number => model.rows[0]?.length ?? 1

/** A new, empty row or column at `index` (0 is before the first). */
export function insertRow(model: TableModel, index: number): TableModel {
  const next = copy(model)
  const at = Math.max(model.header ? 1 : 0, Math.min(index, next.rows.length))
  next.rows.splice(at, 0, Array<string>(columnsOf(model)).fill(''))
  return next
}

export function insertColumn(model: TableModel, index: number): TableModel {
  const next = copy(model)
  const at = Math.max(0, Math.min(index, columnsOf(model)))
  for (const row of next.rows) row.splice(at, 0, '')
  next.widths?.splice(at, 0, 'auto')
  next.align?.splice(at, 0, 'auto')
  return next
}

/** Null when it would leave nothing (the last row or column). */
export function deleteRow(model: TableModel, index: number): TableModel | null {
  if (model.rows.length <= 1) return null
  const next = copy(model)
  next.rows.splice(index, 1)
  if (index === 0 && next.header) next.header = false // the header row is gone
  return next
}

export function deleteColumn(model: TableModel, index: number): TableModel | null {
  if (columnsOf(model) <= 1) return null
  const next = copy(model)
  for (const row of next.rows) row.splice(index, 1)
  next.widths?.splice(index, 1)
  next.align?.splice(index, 1)
  return next
}

export function setAlign(model: TableModel, column: number, align: Align): TableModel {
  const next = copy(model)
  const list = next.align ?? Array<Align>(columnsOf(model)).fill('auto')
  list[column] = align
  next.align = list
  next.alignRaw = null
  return next
}

export function setHeader(model: TableModel, header: boolean): TableModel {
  return { ...copy(model), header }
}

export function setCaption(model: TableModel, caption: string | null): TableModel {
  const next = copy(model)
  next.caption = caption && caption.trim() !== '' ? caption : null
  // A caption makes a bare table a figure, so that it is numbered.
  if (next.caption && next.kind === 'bare') next.kind = 'figure'
  return next
}

/** Puts a block of text (rows of cells, as copied from a spreadsheet) in at a cell, growing the table. */
export function pasteGrid(
  model: TableModel,
  row: number,
  column: number,
  data: readonly (readonly string[])[],
): TableModel {
  let next = copy(model)
  data.forEach((line, dr) => {
    while (row + dr >= next.rows.length) next = insertRow(next, next.rows.length)
    line.forEach((text, dc) => {
      while (column + dc >= columnsOf(next)) next = insertColumn(next, columnsOf(next))
      next.rows[row + dr]![column + dc] = text
    })
  })
  return next
}

/** Rows of cells from copied text: lines, and tab-separated cells. Null for a single piece of text. */
export function parseGrid(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  if (lines.length === 1 && !lines[0]!.includes('\t')) return null
  return lines.map((line) => line.split('\t').map((cell) => cell.trim()))
}

/**
 * The edit for a cell's text: only the text between the brackets changes. Null for text with
 * brackets that do not match, or for a cell that is not in the text (the table is ragged).
 */
export function cellEdit(table: Table, row: number, column: number, text: string): TextEdit | null {
  const cell = table.rows[row]?.[column]
  if (!cell || !balanced(text) || table.ragged) return null
  return cell.text === text ? null : { from: cell.from, to: cell.to, insert: text }
}

export function captionEdit(table: Table, text: string, id?: string): TextEdit | null {
  if (!balanced(text)) return null
  if (table.caption && text.trim() !== '')
    return table.caption.text === text
      ? null
      : { from: table.caption.from, to: table.caption.to, insert: text }
  const model = setCaption(table.model, text)
  return model.caption === table.model.caption && model.kind === table.model.kind
    ? null
    : rewriteTable(table, model, id)
}

/** A new table of empty cells, with a header row. */
export function newTable(rows: number, columns: number, label: string): TableModel {
  return {
    kind: 'figure',
    widths: null,
    align: Array<Align>(columns).fill('auto'),
    alignRaw: null,
    header: true,
    rows: Array.from({ length: rows }, () => Array<string>(columns).fill('')),
    tableExtra: [],
    figureExtra: [],
    caption: null,
    label,
  }
}

// --- what a cell shows ----------------------------------------------------------------------------

/** The text of a cell as the table draws it: plain text, emphasis, strong, and citations. */
export type CellSegment =
  | { kind: 'text'; text: string }
  | { kind: 'emphasis' | 'strong'; children: CellSegment[] }
  | { kind: 'cite'; key: string; supplement: string | null }

/**
 * Splits the source of a cell into what is drawn. Everything that is not emphasis, strong, or a
 * citation (formulas, links, code) is shown as written, so nothing is hidden that cannot be edited.
 */
export function cellSegments(text: string, depth = 0): CellSegment[] {
  const out: CellSegment[] = []
  const push = (segment: CellSegment): void => {
    const last = out[out.length - 1]
    if (segment.kind === 'text' && last?.kind === 'text') last.text += segment.text
    else out.push(segment)
  }
  const tree = parseTypst(text)
  let at = 0
  const top = tree.topNode
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (node.from > at) push({ kind: 'text', text: text.slice(at, node.from) })
    const raw = text.slice(node.from, node.to)
    if ((node.name === 'Emphasis' || node.name === 'Strong') && depth < 3 && raw.length > 2) {
      push({
        kind: node.name === 'Emphasis' ? 'emphasis' : 'strong',
        children: cellSegments(raw.slice(1, -1), depth + 1),
      })
    } else if (node.name === 'Ref') {
      const supplement = node.getChild('Supplement')
      const key = text.slice(node.from + 1, supplement ? supplement.from : node.to)
      if (/^(?:fig|tbl|eq|sec)-/.test(key)) push({ kind: 'text', text: raw })
      else
        push({
          kind: 'cite',
          key,
          supplement: supplement ? text.slice(supplement.from + 1, supplement.to - 1) : null,
        })
    } else push({ kind: 'text', text: node.name === 'Escape' ? raw.slice(1) : raw })
    at = node.to
  }
  if (at < text.length) push({ kind: 'text', text: text.slice(at) })
  return out
}
