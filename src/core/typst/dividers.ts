import type { SyntaxNode, Tree } from '@lezer/common'

/**
 * A divider: `#divider()` on a line of its own, a break in the text between two passages (the
 * three asterisks or the short rule of a book). It is not one of Typst's own functions: the export
 * makes it a marker that the template draws (`templates/engine.typ`), and the editor draws it as a
 * rule. A call with arguments or content is not a divider and stays source.
 */

/** What the editor writes for a divider. */
export const DIVIDER_SOURCE = '#divider()'

/** The marker the export writes in its place: invisible by itself, drawn by the template's show rule. */
export const DIVIDER_MARKER = '#metadata("divider")<divider>'

/**
 * Whether a node is a divider: an `Expression` that calls `divider` with empty parentheses and
 * nothing else. `read` gives the text of a range (of a string, or of the editor's document).
 */
export function isDivider(node: SyntaxNode, read: (from: number, to: number) => string): boolean {
  if (node.name !== 'Expression') return false
  const name = node.getChild('FuncName')
  if (!name || read(name.from, name.to) !== 'divider') return false
  if (node.getChild('Content')) return false
  const args = node.getChild('Args')
  return args !== null && args.to === node.to && /^\([ \t]*\)$/.test(read(args.from, args.to))
}

/** The dividers of a text, in order. */
export function scanDividers(tree: Tree, doc: string): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = []
  tree.iterate({
    enter: (ref) => {
      if (ref.name !== 'Expression') return undefined
      if (isDivider(ref.node, (from, to) => doc.slice(from, to)))
        found.push({ from: ref.from, to: ref.to })
      return undefined
    },
  })
  return found
}
