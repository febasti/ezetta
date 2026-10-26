import type { SyntaxNode } from '@lezer/common'
import { Decoration } from '@codemirror/view'
import type { Builder } from './builder'
import { Ellipsis } from './widgets'

/**
 * `...` in the writer's words, drawn as the ellipsis the PDF prints (Typst turns every three dots in
 * markup into one). The file keeps the dots. The source shows while the caret touches it, like a
 * highlight's marks, so a dot can be typed or deleted as it is written.
 */

/** Syntax whose text is not prose: there `...` stays three dots (Typst reads it as code, math or a name). */
const NOT_PROSE = new Set([
  'Math',
  'Raw',
  'Url',
  'LineComment',
  'BlockComment',
  'Escape',
  'Label',
  'Ref',
  'Args',
  'Hash',
  'FuncName',
  'CodeLine',
  'CodeBlock',
])

const ellipsis = Decoration.replace({ widget: new Ellipsis() })

export class EllipsisMarkup {
  /** Where `...` is not drawn as an ellipsis: not prose, or already replaced by something else. */
  private readonly skipped: { from: number; to: number }[] = []

  constructor(private readonly b: Builder) {}

  /** Called for every node of the tree: notes where it is not prose. */
  note(node: SyntaxNode): void {
    if (NOT_PROSE.has(node.name)) this.skipped.push({ from: node.from, to: node.to })
  }

  /** Draws the ellipses; called after every other part has drawn, so it can leave what they replaced. */
  draw(): void {
    const { b } = this
    if (b.showSource) return
    const { doc } = b
    const zones = [...this.skipped]
    for (const { from, to, value } of b.ranges)
      if (value.point && to > from) zones.push({ from, to })
    zones.sort((x, y) => x.from - y.from)
    let at = 0
    const stretch = (to: number): void => {
      if (to <= at) return
      const text = doc.sliceString(at, to)
      for (const run of text.matchAll(/\.{3,}/g)) {
        // Every three dots are one ellipsis, as in Typst; one or two left over stay dots.
        for (let k = 0; k + 3 <= run[0].length; k += 3) {
          const from = at + run.index + k
          if (!b.touches(from, from + 3) && !b.revealed(from, from + 3))
            b.ranges.push(ellipsis.range(from, from + 3))
        }
      }
    }
    for (const zone of zones) {
      stretch(zone.from)
      at = Math.max(at, zone.to)
    }
    stretch(doc.length)
  }
}
