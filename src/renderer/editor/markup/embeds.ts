import type { Formula } from '@core/typst/math'
import type { SyntaxNode } from '@lezer/common'
import { figureConfig, figureField } from '../figureState'
import type { FigureConfig, FigureView } from '../figureState'
import { FigureWidget } from '../figureWidget'
import { activeNoteField, footnoteConfig, footnoteField } from '../footnoteState'
import type { FootnoteConfig, NoteView } from '../footnoteState'
import { activeMathField, isBlockWidget, mathConfig, mathField } from '../mathState'
import type { ActiveMath, MathConfig } from '../mathState'
import { MathWidget } from '../mathWidget'
import { tableConfig, tableField } from '../tableState'
import type { TableConfig, TableView } from '../tableState'
import { TableWidget } from '../tableWidget'
import { mark } from './builder'
import type { Builder, Call } from './builder'
import { FootnoteMarker } from './widgets'

/**
 * What is drawn as a widget in place of its source: formulas, tables, images, and footnote markers.
 * Only "Quelltext" shows their source. A widget that stands on lines of its own is a block; one with
 * other text on its lines stays in the line (a table then stays source).
 */
export class EmbedMarkup {
  private readonly mathSettings: MathConfig
  private readonly activeMath: ActiveMath | null
  private readonly formulasByStart: Map<number, Formula>
  private readonly tableSettings: TableConfig
  private readonly tablesByStart: Map<number, TableView>
  private readonly figureSettings: FigureConfig
  private readonly figuresByStart: Map<number, FigureView>
  private readonly noteSettings: FootnoteConfig
  private readonly activeNote: number | null
  private readonly notesByStart: Map<number, NoteView>

  constructor(private readonly b: Builder) {
    const { state } = b
    this.mathSettings = state.facet(mathConfig)
    this.activeMath = state.field(activeMathField, false) ?? null
    this.formulasByStart = byStart(state.field(mathField, false))
    this.tableSettings = state.facet(tableConfig)
    this.tablesByStart = byStart(state.field(tableField, false))
    this.figureSettings = state.facet(figureConfig)
    this.figuresByStart = byStart(state.field(figureField, false))
    this.noteSettings = state.facet(footnoteConfig)
    this.activeNote = state.field(activeNoteField, false) ?? null
    this.notesByStart = byStart(state.field(footnoteField, false))
  }

  /** A formula, in the text or as a block on lines of its own. */
  math(node: SyntaxNode): void {
    const { b } = this
    const formula = this.formulasByStart.get(node.from)
    if (!formula || b.showSource) {
      b.add(mark('cm-math'), node.from, node.to)
      return
    }
    const alone = isBlockWidget(b.doc, formula)
    const from = alone ? b.doc.lineAt(formula.from).from : formula.from
    const to = alone ? b.doc.lineAt(formula.end).to : formula.end
    b.addWidget(
      new MathWidget(
        formula,
        this.mathSettings,
        this.activeMath?.from === formula.from,
        alone,
        b.selected(from, to),
        this.activeMath?.select ?? false,
      ),
      from,
      to,
      { from, to, block: alone },
      alone,
    )
  }

  /** A table is drawn as a table and edited in place, if it is alone on its lines. */
  table({ node }: Call): boolean {
    const { b } = this
    const table = this.tablesByStart.get(node.from)
    if (!table || b.showSource || !b.aloneOnLines(table.from, table.end)) return false
    const from = b.doc.lineAt(table.from).from
    const to = b.doc.lineAt(table.end).to
    b.addWidget(
      new TableWidget(table, this.tableSettings, {
        selected: b.selected(from, to),
        readOnly: b.state.readOnly,
      }),
      from,
      to,
      { from, to, block: true },
      true,
    )
    return true
  }

  /** An image: a figure, a bare image, or an image in the text. */
  figure({ node }: Call): boolean {
    const { b } = this
    const figure = this.figuresByStart.get(node.from)
    if (!figure) return false
    if (b.showSource) {
      b.add(mark('cm-figure-source'), figure.from, figure.end)
      return false
    }
    const alone = figure.kind !== 'inline' && b.aloneOnLines(figure.from, figure.end)
    const from = alone ? b.doc.lineAt(figure.from).from : figure.from
    const to = alone ? b.doc.lineAt(figure.end).to : figure.end
    const widget = new FigureWidget(figure, this.figureSettings, alone, b.selected(from, to))
    b.addWidget(widget, from, to, { from, to, block: alone }, alone)
    return true
  }

  /**
   * A footnote is drawn as its marker, however the notes are shown (in the margin, below the text,
   * or in a card): where the note is shown and written is not up to the text. In "Quelltext" its
   * source stays, set apart.
   */
  footnote({ node, name, open, close }: Call): boolean {
    const { b } = this
    const note = name === 'footnote' ? this.notesByStart.get(node.from) : undefined
    if (!note || !open || !close) return false
    if (b.showSource) {
      b.add(mark('cm-footnote-source'), node.from, node.to)
      return false
    }
    const marker = new FootnoteMarker(
      note,
      this.noteSettings.labels.marker(note.number, note.text),
      this.activeNote === note.from,
      b.selected(node.from, node.to),
    )
    b.addWidget(marker, node.from, node.to, { from: node.from, to: node.to, block: false })
    return true
  }
}

function byStart<T extends { from: number }>(items: readonly T[] | undefined): Map<number, T> {
  return new Map((items ?? []).map((item) => [item.from, item]))
}
