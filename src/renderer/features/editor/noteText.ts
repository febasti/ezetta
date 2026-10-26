import type { Tree } from '@lezer/common'
import type { SyntaxNode } from '@lezer/common'
import type { EditorView } from '@codemirror/view'
import { citationGroups, scanCitations } from '@core/typst/citations'
import type { Citation } from '@core/typst/citations'
import { parseTypst } from '@core/typst/parser'
import { chipElement, groupChipFor } from '../../editor/citeWidget'
import { citeConfig } from '../../editor/citeState'
import { quoteConfig } from '../../editor/quoteState'

/** A note's words as the card or the row shows them: set like the text, not as plain characters. */
export interface NoteText {
  /** Shows other source; true when that changed what is drawn. */
  update(source: string): boolean
  destroy(): void
}

/** The functions whose words are drawn in an element of their own. */
const WRAPPERS: Record<string, { tag: string; className?: string }> = {
  emph: { tag: 'em' },
  strong: { tag: 'strong' },
  highlight: { tag: 'span', className: 'cm-highlight' },
  link: { tag: 'span', className: 'cm-link' },
  sub: { tag: 'sub' },
  super: { tag: 'sup' },
  smallcaps: { tag: 'span', className: 'cm-smallcaps' },
}

/** The functions that draw nothing in a note's words (a note inside a note, a line break). */
const SKIPPED = new Set(['footnote', 'parbreak', 'linebreak', 'label'])

/**
 * Draws the source of a note into `host` the way the text shows it: citations as chips, highlights,
 * emphasis, links, quotes. Plain DOM, not an editor: a card for every note of a long sheet stays
 * light, and what is clicked is the card, which opens the note for writing (the note's own editor
 * is `mountNoteEditor`). `view` is the sheet's editor, whose bibliography and quotation marks it uses.
 */
export function drawNote(host: HTMLElement, source: string, view: EditorView): void {
  const tree: Tree = parseTypst(source)
  const cite = view.state.facet(citeConfig)
  const marks = view.state.facet(quoteConfig).marks
  const groups = citationGroups(scanCitations(tree, source), source)
  const starts = new Map<number, Citation[]>(groups.map((group) => [group[0]!.from, group]))
  const inside = (pos: number): Citation[] | undefined =>
    groups.find((group) => group[0]!.from <= pos && pos < group.at(-1)!.end)

  /** Words into `parent`; in prose every three dots are the ellipsis the PDF prints. */
  const text = (parent: Node, from: number, to: number, prose = false): void => {
    if (to <= from) return
    const words = source.slice(from, to).replace(/\s+/g, ' ')
    parent.appendChild(document.createTextNode(prose ? words.replaceAll('...', '…') : words))
  }

  /** The words between `from` and `to`, with what is inside drawn, into `parent`. */
  const range = (
    node: SyntaxNode | null,
    from: number,
    to: number,
    parent: Node,
    depth: number,
  ): void => {
    let pos = from
    const chip = (group: Citation[]): void => {
      parent.appendChild(
        chipElement(groupChipFor(group, cite), cite, { active: false, selected: false }),
      )
      pos = Math.max(pos, group.at(-1)!.end)
    }
    // The text between nodes may hold the start of a citation as well.
    const plain = (a: number, b: number): void => {
      let at = a
      while (at < b) {
        const group = [...starts.keys()].find((start) => start >= at && start < b)
        if (group === undefined) break
        text(parent, at, group, true)
        chip(starts.get(group)!)
        at = Math.max(at, pos)
      }
      if (at < b) text(parent, at, b, true)
      pos = Math.max(pos, b)
    }
    for (let child = node?.firstChild ?? null; child; child = child.nextSibling) {
      if (child.to <= pos || child.from >= to) continue
      const group = starts.get(child.from) ?? inside(child.from)
      if (group && group[0]!.from >= pos) {
        plain(pos, group[0]!.from)
        chip(group)
        if (child.to <= pos) continue
      }
      plain(pos, child.from)
      node_(child, parent, depth)
      pos = Math.max(pos, child.to)
    }
    plain(pos, to)
  }

  /** Content between the first and last mark of a node. */
  const inner = (node: SyntaxNode, markName: string, parent: Node, depth: number): void => {
    const marks_ = node.getChildren(markName)
    const open = marks_[0]
    const close = marks_.length > 1 ? marks_.at(-1) : undefined
    range(node, open ? open.to : node.from, close ? close.from : node.to, parent, depth)
  }

  const wrap = (spec: { tag: string; className?: string }, parent: Node): HTMLElement => {
    const element = document.createElement(spec.tag)
    if (spec.className) element.className = spec.className
    parent.appendChild(element)
    return element
  }

  const node_ = (node: SyntaxNode, parent: Node, depth: number): void => {
    switch (node.name) {
      case 'Emphasis':
        inner(node, 'EmphasisMark', wrap({ tag: 'em' }, parent), depth)
        return
      case 'Strong':
        inner(node, 'StrongMark', wrap({ tag: 'strong' }, parent), depth)
        return
      case 'Highlight':
        inner(
          node,
          'HighlightMark',
          wrap({ tag: 'span', className: 'cm-highlight' }, parent),
          depth,
        )
        return
      case 'LineComment':
      case 'BlockComment':
      case 'Label':
        return
      case 'Escape':
        text(parent, node.from + 1, node.to)
        return
      case 'Expression': {
        const fn = node.getChild('FuncName')
        const name = fn ? source.slice(fn.from, fn.to) : ''
        if (SKIPPED.has(name)) return
        const content = node.getChild('Content')
        if (name === 'quote' && content) {
          const open = marks.open[Math.min(depth, 1)]!
          const close = marks.close[Math.min(depth, 1)]!
          parent.appendChild(document.createTextNode(open))
          inner(content, 'ContentMark', parent, depth + 1)
          parent.appendChild(document.createTextNode(close))
          return
        }
        const spec = WRAPPERS[name]
        if (content) inner(content, 'ContentMark', spec ? wrap(spec, parent) : parent, depth)
        return
      }
      default:
        // Everything else (a link, a formula, code) shows as it is written, around what is inside.
        if (node.firstChild && ['Heading', 'ListItem', 'Content'].includes(node.name))
          range(node, node.from, node.to, parent, depth)
        else text(parent, node.from, node.to)
    }
  }

  host.textContent = ''
  const root = tree.topNode
  range(root, 0, source.length, host, 0)
  // The words of a note start and end without spaces.
  const first = host.firstChild
  if (first?.nodeType === Node.TEXT_NODE) first.textContent = first.textContent!.replace(/^\s+/, '')
  const last = host.lastChild
  if (last?.nodeType === Node.TEXT_NODE) last.textContent = last.textContent!.replace(/\s+$/, '')
}

/** A note's words in `host`, redrawn when the source changes. */
export function mountNoteText(
  host: HTMLElement,
  view: EditorView,
  source: string,
  options: { wrap?: boolean; onSize: () => void },
): NoteText {
  let shown = source
  drawNote(host, source, view)
  options.onSize()
  return {
    update(next) {
      if (next === shown) return false
      shown = next
      drawNote(host, next, view)
      options.onSize()
      return true
    },
    destroy() {
      host.textContent = ''
    },
  }
}
