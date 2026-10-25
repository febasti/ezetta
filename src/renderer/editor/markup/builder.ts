import type { EditorState, Range, SelectionRange, Text } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import type { WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { AtomicUnit } from '../atomicKeys'
import { searchField } from '../search'
import { showSourceFacet } from './facets'

export const mark = (className: string): Decoration => Decoration.mark({ class: className })
export const hidden = Decoration.replace({})
const atomicMark = (unit: AtomicUnit): Decoration => Decoration.mark({ unit })

/** A function call such as `#quote(block: true)[…]`, with the parts every kind of call looks at. */
export interface Call {
  node: SyntaxNode
  /** The name of the function (`quote`), or '' when it has none. */
  name: string
  nameNode: SyntaxNode | null
  args: SyntaxNode | null
  /** The brackets of its content: both, or neither. */
  open: SyntaxNode | undefined
  close: SyntaxNode | undefined
}

export function readCall(node: SyntaxNode, doc: Text): Call {
  const nameNode = node.getChild('FuncName')
  const marks = node.getChild('Content')?.getChildren('ContentMark') ?? []
  const close = marks.length > 1 ? marks[marks.length - 1] : undefined
  return {
    node,
    name: nameNode ? doc.sliceString(nameNode.from, nameNode.to) : '',
    nameNode,
    args: node.getChild('Args'),
    open: close ? marks[0] : undefined,
    close,
  }
}

/**
 * Collects the decorations of one pass over the text, and answers what every kind of element asks
 * about the selection: whether it touches a range (the syntax there is shown), covers it (a widget is
 * drawn selected), or the search bar points into it (its source is shown, so the match can be seen).
 */
export class Builder {
  readonly doc: Text
  readonly showSource: boolean
  readonly caret: SelectionRange
  readonly ranges: Range<Decoration>[] = []
  readonly atomic: Range<Decoration>[] = []
  /** The lines of headings and of block quotes, by number: the space between lines depends on them. */
  readonly headingLines = new Set<number>()
  readonly quoteLines = new Set<number>()
  /** The match the search bar points at. */
  private readonly found: { from: number; to: number } | undefined

  constructor(readonly state: EditorState) {
    this.doc = state.doc
    this.showSource = state.facet(showSourceFacet)
    this.caret = state.selection.main
    const search = state.field(searchField, false)
    this.found = search?.matches[search.current]
  }

  /** A widget is drawn selected while the selection covers all of it. */
  selected(from: number, to: number): boolean {
    return this.state.selection.ranges.some((r) => r.to > r.from && r.from <= from && r.to >= to)
  }

  touches(from: number, to: number): boolean {
    return this.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
  }

  /** A widget or hidden syntax around the current search match shows its source instead. */
  revealed(from: number, to: number): boolean {
    return this.found !== undefined && this.found.from < to && this.found.to > from
  }

  add(decoration: Decoration, from: number, to: number): void {
    if (to > from) this.ranges.push(decoration.range(from, to))
  }

  /** Dims syntax that stays visible, such as the brackets of a call. */
  marker(from: number, to: number): void {
    this.add(mark('cm-marker'), from, to)
  }

  /** Replaces a range with a widget that the caret cannot enter. */
  addWidget(widget: WidgetType, from: number, to: number, unit: AtomicUnit, block = false): void {
    if (this.revealed(from, to)) return
    this.ranges.push(Decoration.replace({ widget, block }).range(from, to))
    this.atomic.push(atomicMark(unit).range(from, to))
  }

  /** Hides syntax that the caret cannot enter and that never shows by touch. */
  addHidden(from: number, to: number, unit: AtomicUnit): void {
    if (this.revealed(from, to)) return
    this.ranges.push(hidden.range(from, to))
    this.atomic.push(atomicMark(unit).range(from, to))
  }

  /** Gives every line from `from` to `to` the class. */
  addLine(className: string, from: number, to: number): void {
    const { doc } = this
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n += 1) {
      this.ranges.push(Decoration.line({ class: className }).range(doc.line(n).from))
      if (className.startsWith('cm-heading')) this.headingLines.add(n)
      else if (className === 'cm-quote') this.quoteLines.add(n)
    }
  }

  /** True if nothing but spaces stands before `from` on its line and after `to` on its line. */
  aloneOnLines(from: number, to: number): boolean {
    const { doc } = this
    return (
      doc.sliceString(doc.lineAt(from).from, from).trim() === '' &&
      doc.sliceString(to, doc.lineAt(to).to).trim() === ''
    )
  }
}
