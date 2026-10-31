import type { EditorState, Text } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import type { SyntaxNode, Tree } from '@lezer/common'
import type { AtomicUnit } from '../atomicKeys'
import { hidden, mark } from './builder'
import type { Builder, Call } from './builder'
import { labelsFacet } from './facets'
import type { MarkupLabels } from './facets'
import { CommentPill, ListMarker } from './widgets'

/**
 * The simple markup: headings, highlights, lists, comments, labels, links, and the functions that
 * format their content (`#emph`, `#sub`, …). Everything else that a call can be (a citation, a
 * quote, an image) is drawn by its own part before a call reaches `call` here.
 */

/** The class of the content of the formatting functions. */
const CONTENT_CLASS = new Map([
  ['emph', 'cm-emphasis'],
  ['strong', 'cm-strong'],
  ['sub', 'cm-sub'],
  ['super', 'cm-super'],
  ['smallcaps', 'cm-smallcaps'],
])

/** The functions drawn as styled text with their wrapper hidden. */
const HIDDEN_WRAPPER = new Set(['sub', 'super', 'smallcaps'])

interface ListInfo {
  /** Text shown instead of the marker: a bullet or a number. */
  label: string
  /** Nesting level, 1 and up. */
  level: number
}

/** Numbers and levels for all list items, by marker position. Numbering restarts after other text. */
function listInfo(state: EditorState, items: SyntaxNode[]): Map<number, ListInfo> {
  const info = new Map<number, ListInfo>()
  const stack: { indent: number; count: number }[] = []
  let previousEnd = -1
  for (const item of items) {
    const line = state.doc.lineAt(item.from)
    const indent = item.from - line.from
    if (previousEnd >= 0 && /\S/.test(state.doc.sliceString(previousEnd, line.from)))
      stack.length = 0
    while (stack.length > 0 && stack[stack.length - 1]!.indent > indent) stack.pop()
    if (stack.length === 0 || stack[stack.length - 1]!.indent < indent)
      stack.push({ indent, count: 0 })
    const level = stack[stack.length - 1]!
    const numbered = state.doc.sliceString(item.from, item.from + 1) === '+'
    if (numbered) level.count += 1
    info.set(item.from, {
      label: numbered ? `${level.count}.` : '•',
      level: Math.min(stack.length, 5),
    })
    previousEnd = item.to
  }
  return info
}

function commentText(raw: string): string {
  const body = raw.startsWith('/*')
    ? raw.slice(2, raw.endsWith('*/') ? -2 : undefined)
    : raw.slice(2)
  return body.replace(/\s+/g, ' ').trim()
}

/**
 * The hidden part of a heading's label: the label `<sec-…>` that ends its text, with the spaces
 * before it. Null for any other label, which stays visible.
 */
function headingLabelSpan(node: SyntaxNode, doc: Text): { from: number; to: number } | null {
  if (node.parent?.name !== 'Heading') return null
  if (!doc.sliceString(node.from + 1, node.from + 5).startsWith('sec-')) return null
  for (let next = node.nextSibling; next; next = next.nextSibling)
    if (next.name !== 'LineComment' && next.name !== 'BlockComment') return null
  let from = node.from
  while (from > 0 && /[ \t]/.test(doc.sliceString(from - 1, from))) from -= 1
  return { from, to: node.to }
}

export class TextMarkup {
  private readonly labels: MarkupLabels
  private readonly lists: Map<number, ListInfo>

  constructor(
    private readonly b: Builder,
    tree: Tree,
  ) {
    this.labels = b.state.facet(labelsFacet)
    const items: SyntaxNode[] = []
    tree.iterate({
      enter: (ref) => {
        if (ref.name === 'ListItem') items.push(ref.node)
      },
    })
    this.lists = listInfo(b.state, items)
  }

  heading(node: SyntaxNode): void {
    const level =
      Math.min(node.getChild('HeadingMark')?.to ?? node.from + 1, node.from + 6) - node.from
    this.b.addLine(`cm-heading cm-heading-${level}`, node.from, node.from)
  }

  /** `::marked words::`: the caret anywhere in them shows both delimiters, so they are seen together. */
  highlight(node: SyntaxNode): void {
    const { b } = this
    const open = node.firstChild
    const close = node.lastChild
    if (!open || !close || open === close) return
    b.add(mark('cm-highlight'), open.to, close.from)
    if (b.showSource || b.touches(node.from, node.to)) {
      b.marker(open.from, open.to)
      b.marker(close.from, close.to)
    } else {
      b.ranges.push(hidden.range(open.from, open.to))
      b.ranges.push(hidden.range(close.from, close.to))
    }
  }

  /** A list item is indented by its level; its marker is a bullet or a number until the caret touches it. */
  listItem(node: SyntaxNode): void {
    const { b } = this
    const info = this.lists.get(node.from)
    b.addLine(`cm-list cm-list-${info?.level ?? 1}`, node.from, node.to)
    const listMark = node.getChild('ListMark')
    if (!listMark || !info) return
    if (b.showSource || b.touches(listMark.from, listMark.to)) b.marker(listMark.from, listMark.to)
    else
      b.ranges.push(
        Decoration.replace({ widget: new ListMarker(info.label) }).range(
          listMark.from,
          listMark.to,
        ),
      )
  }

  /**
   * A `/* … *\/` comment is a small pill until the caret touches it. A `//` comment is never hidden:
   * it stays as written, and its whole line has a grey ground.
   */
  comment(node: SyntaxNode): void {
    const { b } = this
    if (node.name === 'LineComment') {
      b.addLine('cm-comment-line', node.from, node.from)
      b.add(mark('cm-comment-line-text'), node.from, node.to)
      return
    }
    if (b.showSource || b.touches(node.from, node.to)) {
      b.add(mark('cm-comment'), node.from, node.to)
      return
    }
    const text = commentText(b.doc.sliceString(node.from, node.to))
    b.ranges.push(
      Decoration.replace({ widget: new CommentPill(text, this.labels.comment(text)) }).range(
        node.from,
        node.to,
      ),
    )
  }

  /**
   * The label of a heading is the anchor of its cross-references: the app writes it and the text
   * does not show it. It is hidden for good, like the wrapper of a block quote. Other labels show.
   */
  label(node: SyntaxNode): void {
    const { b } = this
    const span = headingLabelSpan(node, b.doc)
    if (!span || b.showSource) {
      b.add(mark('cm-label'), node.from, node.to)
      return
    }
    const line = b.doc.lineAt(node.to)
    const unit: AtomicUnit = {
      from: span.from,
      to: span.to,
      block: false,
      silent: true,
      ...(line.to === node.to
        ? {
            edge: {
              outer: node.to,
              inner: span.from,
              out: line.to < b.doc.length ? line.to + 1 : span.from,
            },
          }
        : {}),
    }
    b.addHidden(span.from, span.to, unit)
  }

  /**
   * `#link("…")[words]`: the syntax is never shown, not even at the caret. The words show as a link,
   * the caret steps over the hidden wrapper, and Backspace or Delete next to it takes the link off and
   * keeps the words. The address is changed with the Hyperlink tool, or in "Quelltext".
   */
  link({ node, name, open, close }: Call): boolean {
    const { b } = this
    if (name !== 'link' || !open || !close) return false
    if (b.showSource) {
      b.marker(node.from, open.to)
      b.marker(close.from, close.to)
    } else {
      const unit = unwrapUnit(node, open, close)
      b.addHidden(node.from, open.to, unit)
      b.addHidden(close.from, close.to, unit)
    }
    b.add(mark('cm-link'), open.to, close.from)
    return true
  }

  /**
   * Subscript, superscript, and small caps: the wrapper is hidden, Backspace next to it takes the
   * format off and keeps the text.
   */
  format({ node, name, args, open, close }: Call): boolean {
    const { b } = this
    if (!open || !close || args || b.showSource || !HIDDEN_WRAPPER.has(name)) return false
    const unit = unwrapUnit(node, open, close)
    b.addHidden(node.from, open.to, unit)
    b.addHidden(close.from, close.to, unit)
    b.add(mark(CONTENT_CLASS.get(name)!), open.to, close.from)
    return true
  }

  /** Any other call shows as source: its name in the accent, its arguments and brackets dimmed. */
  call({ node, name, nameNode, args, open, close }: Call): void {
    const { b } = this
    if (nameNode) b.add(mark('cm-func'), node.from, nameNode.to)
    if (args) b.add(mark('cm-args'), args.from, args.to)
    if (!open || !close) return
    b.marker(open.from, open.to)
    b.marker(close.from, close.to)
    const content = CONTENT_CLASS.get(name)
    if (content) b.add(mark(content), open.to, close.from)
  }
}

/** A wrapper that Backspace or Delete next to it takes off, keeping the words inside. */
function unwrapUnit(node: SyntaxNode, open: SyntaxNode, close: SyntaxNode): AtomicUnit {
  return {
    from: node.from,
    to: node.to,
    block: false,
    unwrap: [
      [node.from, open.to],
      [close.from, close.to],
    ],
  }
}
