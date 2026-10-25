import { describe, expect, it } from 'vitest'
import { parseTypst } from './parser'
import {
  captionEdit,
  cellSegments,
  cellEdit,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  newTable,
  parseGrid,
  pasteGrid,
  rewriteTable,
  scanTables,
  setAlign,
  setCaption,
  setHeader,
  tableAt,
  tableSource,
} from './tables'
import type { Table } from './tables'

const scan = (doc: string) => scanTables(parseTypst(doc), doc)
const apply = (doc: string, edit: { from: number; to: number; insert: string } | null): string =>
  edit ? doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to) : doc

const SAMPLE_TABLE = `#figure(
  table(
    columns: 3,
    align: (left, right, right),
    table.header[Gruppe][n][Anteil],
    [A], [12], [40 %],
    [B], [18], [60 %],
  ),
  caption: [Stichprobe nach Gruppe],
) <tbl-stichprobe>`

describe('scanTables', () => {
  it('reads a table in a figure: caption, label, alignment, header, and cells', () => {
    const doc = `Text.\n\n${SAMPLE_TABLE}\n\nMehr.`
    const [t] = scan(doc)
    expect(t).toMatchObject({
      kind: 'figure',
      columns: 3,
      align: ['left', 'right', 'right'],
      header: true,
      label: 'tbl-stichprobe',
      ragged: false,
    })
    expect(t!.caption!.text).toBe('Stichprobe nach Gruppe')
    expect(t!.rows.map((row) => row.map((c) => c.text))).toEqual([
      ['Gruppe', 'n', 'Anteil'],
      ['A', '12', '40 %'],
      ['B', '18', '60 %'],
    ])
    expect(doc.slice(t!.from, t!.end)).toBe(SAMPLE_TABLE)
    // A cell's range is the text between its brackets.
    const cell = t!.rows[1]![2]!
    expect(doc.slice(cell.from, cell.to)).toBe('40 %')
  })

  it('reads a bare table, a header written with parentheses, and a list of widths', () => {
    const [t] = scan('#table(columns: (auto, 1fr), table.header([A], [B]), [a], [b])')
    expect(t).toMatchObject({ kind: 'bare', columns: 2, header: true })
    expect(t!.model.widths).toEqual(['auto', '1fr'])
    expect(t!.caption).toBeNull()
  })

  it('reads a table without a header, and cells with markup and nested brackets', () => {
    const [t] = scan('#table(columns: 2, [_a_], [b #link("x")[c]], [*d*], [])')
    expect(t!.header).toBe(false)
    expect(t!.rows.map((r) => r.map((c) => c.text))).toEqual([
      ['_a_', 'b #link("x")[c]'],
      ['*d*', ''],
    ])
  })

  it('reads one alignment for all columns, and calls start and end left and right', () => {
    expect(scan('#table(columns: 3, align: center, [a], [b], [c])')[0]!.align).toEqual([
      'center',
      'center',
      'center',
    ])
    expect(scan('#table(columns: 2, align: (start, end), [a], [b])')[0]!.align).toEqual([
      'left',
      'right',
    ])
  })

  it('keeps arguments it does not know, in the table and in the figure', () => {
    const [t] = scan(
      '#figure(table(columns: 2, stroke: none, [a], [b]), placement: top, caption: [C]) <tbl-x>',
    )
    expect(t!.model.tableExtra).toEqual(['stroke: none'])
    expect(t!.model.figureExtra).toEqual(['placement: top'])
  })

  it('leaves a table with features it cannot hold as source', () => {
    for (const doc of [
      '#table(columns: 2, table.cell(colspan: 2)[a], [b])',
      '#table(columns: 2, [a], table.hline(), [b])',
      '#table(columns: 2, [a], [b], table.footer[x][y])',
      '#table(columns: 2, ..range(4).map(str))',
      '#table(columns: 3, table.header[A][B], [a], [b], [c])', // header of the wrong width
      '#table(columns: (1fr,) * 3, [a], [b], [c])',
      '#table(columns: 2)[a][b]', // content blocks after the call
      '#figure(image("a.png"), caption: [C])',
    ])
      expect(scan(doc), doc).toEqual([])
  })

  it('leaves out tables in footnotes, and finds the table around a position', () => {
    const doc = `A #footnote[Mit #table(columns: 1, [x]) darin.]\n\n${SAMPLE_TABLE}\n`
    const tables = scan(doc)
    expect(tables).toHaveLength(1)
    expect(tableAt(tables, doc.indexOf('[B]'))).toBe(tables[0])
    expect(tableAt(tables, 1)).toBeNull()
  })

  it('knows a table whose last row is not full', () => {
    const [t] = scan('#table(columns: 3, [a], [b], [c], [d])')
    expect(t!.ragged).toBe(true)
    expect(t!.model.rows).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ])
  })
})

describe('writing a table', () => {
  it('writes the canonical form, and reads it back the same', () => {
    const [t] = scan(SAMPLE_TABLE)
    expect(tableSource(t!.model)).toBe(SAMPLE_TABLE.replace(/ <tbl-stichprobe>$/, ''))
    const doc = apply(SAMPLE_TABLE, rewriteTable(t!, t!.model))
    expect(doc).toBe(SAMPLE_TABLE)
  })

  it('writes a bare table and a table with widths and extra arguments', () => {
    const [bare] = scan('#table(columns: (auto, 1fr), stroke: none, [a], [b])')
    expect(tableSource(bare!.model)).toBe(
      '#table(\n  columns: (auto, 1fr),\n  stroke: none,\n  [a], [b],\n)',
    )
  })

  it('is read back with the same cells, whatever was changed', () => {
    const [t] = scan(SAMPLE_TABLE)
    let model = insertColumn(t!.model, 1)
    model = insertRow(model, 2)
    const doc = apply(SAMPLE_TABLE, rewriteTable(t!, model))
    const [again] = scan(doc)
    expect(again!.model.rows).toEqual(model.rows)
    expect(again!.label).toBe('tbl-stichprobe')
    expect(again!.header).toBe(true)
  })
})

describe('changing cells and the caption', () => {
  const table = (): Table => scan(SAMPLE_TABLE)[0]!

  it('changes only the text of the cell', () => {
    expect(apply(SAMPLE_TABLE, cellEdit(table(), 2, 1, '19'))).toBe(
      SAMPLE_TABLE.replace('[18]', '[19]'),
    )
    expect(apply(SAMPLE_TABLE, cellEdit(table(), 1, 0, 'A _kursiv_'))).toContain('[A _kursiv_]')
  })

  it('refuses text whose brackets do not match, and does nothing when nothing changes', () => {
    expect(cellEdit(table(), 1, 0, 'a [ b')).toBeNull()
    expect(cellEdit(table(), 1, 0, 'A')).toBeNull()
    expect(apply(SAMPLE_TABLE, cellEdit(table(), 1, 0, 'a [b]'))).toContain('[a [b]]')
  })

  it('does not change a cell of a ragged table in place', () => {
    const [t] = scan('#table(columns: 2, [a], [b], [c])')
    expect(cellEdit(t!, 1, 1, 'x')).toBeNull()
  })

  it('changes the caption, and adds or takes it away by rewriting', () => {
    expect(apply(SAMPLE_TABLE, captionEdit(table(), 'Neu'))).toContain('caption: [Neu]')
    const without = apply(SAMPLE_TABLE, captionEdit(table(), ''))
    expect(without).not.toContain('caption')
    expect(without.endsWith('<tbl-stichprobe>')).toBe(true)
    const bare = '#table(columns: 1, [a])'
    const withCaption = apply(bare, captionEdit(scan(bare)[0]!, 'Titel'))
    expect(withCaption).toContain('#figure(')
    expect(withCaption).toContain('caption: [Titel]')
    expect(scan(withCaption)[0]!.kind).toBe('figure')
  })

  it('gives a bare table its id when it becomes a figure, and a figure keeps the one it has', () => {
    const bare = '#table(columns: 1, [a])'
    const numbered = apply(bare, captionEdit(scan(bare)[0]!, 'Titel', 'tbl-k4x9tm'))
    expect(numbered.endsWith(') <tbl-k4x9tm>')).toBe(true)
    expect(scan(numbered)[0]).toMatchObject({ kind: 'figure', label: 'tbl-k4x9tm' })
    // A table that already has a label keeps it, whatever id is offered.
    const again = apply(
      SAMPLE_TABLE,
      rewriteTable(table(), setCaption(table().model, 'Neu'), 'tbl-andere'),
    )
    expect(again).toContain('<tbl-stichprobe>')
    expect(again).not.toContain('tbl-andere')
    // Without an id nothing is added (as before).
    expect(apply(bare, captionEdit(scan(bare)[0]!, 'Titel'))).not.toContain('<')
  })
})

describe('structure', () => {
  const model = () => scan(SAMPLE_TABLE)[0]!.model

  it('inserts rows below the header and columns anywhere, with the alignment', () => {
    expect(insertRow(model(), 0).rows[1]).toEqual(['', '', '']) // not above the header
    expect(insertRow(model(), 99).rows).toHaveLength(4)
    const wider = insertColumn(model(), 1)
    expect(wider.rows[0]).toEqual(['Gruppe', '', 'n', 'Anteil'])
    expect(wider.align).toEqual(['left', 'auto', 'right', 'right'])
  })

  it('deletes rows and columns, but never the last one, and drops the header with its row', () => {
    expect(deleteRow(model(), 1)!.rows).toHaveLength(2)
    const noHeader = deleteRow(model(), 0)!
    expect(noHeader.header).toBe(false)
    expect(noHeader.rows).toHaveLength(2)
    expect(deleteRow({ ...model(), rows: [['a']] }, 0)).toBeNull()
    expect(deleteColumn(model(), 0)!.align).toEqual(['right', 'right'])
    expect(deleteColumn({ ...model(), rows: [['a'], ['b']] }, 0)).toBeNull()
  })

  it('keeps a list of widths in step with the columns', () => {
    const [t] = scan('#table(columns: (auto, 1fr, 2cm), [a], [b], [c])')
    expect(insertColumn(t!.model, 1).widths).toEqual(['auto', 'auto', '1fr', '2cm'])
    expect(deleteColumn(t!.model, 0)!.widths).toEqual(['1fr', '2cm'])
  })

  it('sets the alignment of a column, the header, and the caption', () => {
    expect(setAlign(model(), 0, 'center').align).toEqual(['center', 'right', 'right'])
    const aligned = apply(
      SAMPLE_TABLE,
      rewriteTable(scan(SAMPLE_TABLE)[0]!, setAlign(model(), 0, 'auto')),
    )
    expect(aligned).toContain('align: (auto, right, right)')
    const flat = setHeader(model(), false)
    expect(tableSource(flat)).not.toContain('table.header')
    expect(setCaption(model(), '  ').caption).toBeNull()
  })

  it('omits the alignment while every column is automatic, and keeps one it does not understand', () => {
    expect(tableSource(newTable(2, 2, 'tbl-x'))).not.toContain('align')
    const [t] = scan('#table(columns: 2, align: (x, y) => center, [a], [b])')
    expect(t!.align).toBeNull() // not a list of left, center, right
    expect(t!.model.alignRaw).toBe('(x, y) => center')
    expect(tableSource(setHeader(t!.model, false))).toContain('align: (x, y) => center,')
  })
})

describe('pasting from a spreadsheet', () => {
  it('reads lines and tabs, and nothing for a single piece of text', () => {
    expect(parseGrid('a\tb\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseGrid('a\tb')).toEqual([['a', 'b']])
    expect(parseGrid('one\ntwo')).toEqual([['one'], ['two']])
    expect(parseGrid('just text')).toBeNull()
  })

  it('fills the cells from where it is put, and grows the table', () => {
    const model = pasteGrid(newTable(2, 2, 'tbl-x'), 1, 1, [
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(model.rows).toEqual([
      ['', '', ''],
      ['', 'a', 'b'],
      ['', 'c', 'd'],
    ])
    expect(model.align).toHaveLength(3)
  })
})

describe('a new table', () => {
  it('is a figure with a header row and empty cells', () => {
    const source = tableSource(newTable(3, 2, 'tbl-tabelle'))
    expect(source).toBe(
      '#figure(\n  table(\n    columns: 2,\n    table.header[][],\n    [], [],\n    [], [],\n  ),\n)',
    )
    expect(scan(source)[0]).toMatchObject({ columns: 2, header: true })
  })

  it('is given a label by whoever places it: its id', () => {
    expect(newTable(2, 2, 'tbl-k4x9tm').label).toBe('tbl-k4x9tm')
  })
})

describe('cellSegments', () => {
  it('splits plain text, emphasis, strong, and citations', () => {
    expect(cellSegments('a _b_ *c* @k[S. 1] d')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'emphasis', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'c' }] },
      { kind: 'text', text: ' ' },
      { kind: 'cite', key: 'k', supplement: 'S. 1' },
      { kind: 'text', text: ' d' },
    ])
  })

  it('nests emphasis in strong, and shows everything else as written', () => {
    expect(cellSegments('*a _b_*')).toEqual([
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'a ' },
          { kind: 'emphasis', children: [{ kind: 'text', text: 'b' }] },
        ],
      },
    ])
    expect(cellSegments('$x^2$ und #link("u")[t] @fig-a')).toEqual([
      { kind: 'text', text: '$x^2$ und #link("u")[t] @fig-a' },
    ])
  })

  it('shows an escaped character without its backslash, and an empty cell as nothing', () => {
    expect(cellSegments('50 \\% und \\_')).toEqual([{ kind: 'text', text: '50 % und _' }])
    expect(cellSegments('')).toEqual([])
  })
})
