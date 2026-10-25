import { RangeSet } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { Decoration } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { Builder, mark, readCall } from './builder'
import type { Call } from './builder'
import { ChipMarkup } from './chips'
import { EmbedMarkup } from './embeds'
import { keepTogether, lineSpacing } from './layout'
import { QuoteMarkup } from './quotes'
import { TextMarkup } from './text'
import { fullTree } from '../source'

export interface Built {
  decorations: DecorationSet
  /** Kept apart from `decorations`: a mark wraps a widget only from a set of its own (`keepTogether`). */
  together: DecorationSet
  atomic: RangeSet<Decoration>
}

/** Syntax that is only given a class, by the name of its node. */
const STYLED = new Map([
  ['HeadingMark', 'cm-marker'],
  ['EmphasisMark', 'cm-marker'],
  ['StrongMark', 'cm-marker'],
  ['Emphasis', 'cm-emphasis'],
  ['Strong', 'cm-strong'],
  ['Url', 'cm-link'],
  ['Raw', 'cm-raw'],
])

/**
 * All the decorations of the text, in one walk over its syntax tree. Each node goes to the part that
 * draws its kind (text, chips, quotes, embeds); a function call is offered to each kind in turn, and
 * the first that knows it draws it.
 */
export function build(state: EditorState): Built {
  const tree = fullTree(state)
  const b = new Builder(state)
  const text = new TextMarkup(b, tree)
  const chips = new ChipMarkup(b)
  const quotes = new QuoteMarkup(b, chips)
  const embeds = new EmbedMarkup(b)

  const call = (c: Call): void => {
    if (chips.longRef(c) || chips.longCite(c)) return
    if (embeds.table(c) || embeds.figure(c) || embeds.footnote(c)) return
    if (quotes.inline(c) || quotes.block(c)) return
    if (text.link(c) || text.format(c)) return
    text.call(c)
  }

  tree.iterate({
    enter: (ref) => {
      const node = ref.node
      if (quotes.inSource(node)) return false
      switch (ref.name) {
        case 'Heading':
          text.heading(node)
          break
        case 'Highlight':
          text.highlight(node)
          break
        case 'ListItem':
          text.listItem(node)
          break
        case 'BlockComment':
        case 'LineComment':
          if (!chips.comment(node)) text.comment(node)
          return false
        case 'Math':
          embeds.math(node)
          break
        case 'Label':
          if (!quotes.hidesLabel(node)) text.label(node)
          break
        case 'Ref':
          chips.ref(node)
          break
        case 'CodeLine':
        case 'CodeBlock':
          b.add(mark('cm-code'), node.from, node.to)
          return false
        case 'Expression':
          call(readCall(node, b.doc))
          break
        default: {
          const className = STYLED.get(ref.name)
          if (className) b.add(mark(className), node.from, node.to)
        }
      }
      return undefined
    },
  })

  const { doc, ranges } = b
  ranges.push(...lineSpacing(doc, ranges, b.headingLines, b.quoteLines))
  return {
    decorations: Decoration.set(ranges, true),
    together: Decoration.set(keepTogether(doc, ranges), true),
    atomic: RangeSet.of(b.atomic, true),
  }
}
