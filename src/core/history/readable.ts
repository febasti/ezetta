import type { SyntaxNode } from '@lezer/common'
import { parseArgs } from '../typst/args'
import { citationGroups, scanCitations } from '../typst/citations'
import type { Citation } from '../typst/citations'
import { parseTypst } from '../typst/parser'
import { scanCrossRefs } from '../typst/targets'
import type { CrossRef } from '../typst/targets'

/**
 * A sheet as the writer reads it in the editor, for comparing two versions of it: citations and
 * cross-references as their chips say them, a footnote's words where its marker is, the words of a
 * quote, a caption, without the labels, the marks of headings and emphasis, the backticks of raw
 * text, and the escapes. The lines stay where they are, so paragraphs stay paragraphs. Only for
 * reading: a restore brings back the source itself.
 */
export interface ReadableOptions {
  /** What the chip of a group of citations says: "(Kuhn 1962; Eco 1977)". */
  citation: (group: readonly Citation[]) => string
  /** What the chip of a cross-reference says: "Abschnitt 2.1". */
  reference: (ref: CrossRef) => string
  /** A footnote at its marker, from its words. */
  footnote: (text: string) => string
  /**
   * What a call other than a footnote shows: `content` is the words of its trailing `[…]` (null if
   * it has none), `args` its arguments, with the words of those that are content (`caption: […]`).
   */
  call: (name: string, content: string | null, args: readonly ReadableArg[]) => string
}

export interface ReadableArg {
  /** The argument's name, or null for a positional one. */
  name: string | null
  /** The words of a content argument (`[…]`), or null for any other value. */
  text: string | null
  /** The value as written: `table(…)`, `60%`. */
  code: string
}

interface Edit {
  from: number
  to: number
  insert: string
}

/** Marks that only shape the text: they are left out. */
const MARKS = new Set(['EmphasisMark', 'StrongMark', 'HighlightMark'])

export function readableSheet(doc: string, options: ReadableOptions, depth = 0): string {
  if (depth > 20) return doc
  const tree = parseTypst(doc)
  const edits: Edit[] = []
  for (const group of citationGroups(scanCitations(tree, doc), doc))
    edits.push({ from: group[0]!.from, to: group.at(-1)!.end, insert: options.citation(group) })
  for (const ref of scanCrossRefs(tree, doc))
    edits.push({ from: ref.from, to: ref.to, insert: options.reference(ref) })
  /** Inside a citation or a reference, which is replaced as a whole. */
  const taken = (from: number, to: number): boolean =>
    edits.some((edit) => edit.from <= from && to <= edit.to)
  const inner = (from: number, to: number): string =>
    readableSheet(doc.slice(from, to), options, depth + 1)

  tree.iterate({
    enter: (ref) => {
      if (taken(ref.from, ref.to)) return false
      switch (ref.name) {
        case 'Label': {
          // With the spaces before it, so "Titel <sec-a>" is "Titel".
          let from = ref.from
          while (from > 0 && (doc[from - 1] === ' ' || doc[from - 1] === '\t')) from -= 1
          edits.push({ from, to: ref.to, insert: '' })
          return false
        }
        case 'HeadingMark': {
          let to = ref.to
          while (doc[to] === ' ' || doc[to] === '\t') to += 1
          edits.push({ from: ref.from, to, insert: '' })
          return false
        }
        case 'Escape':
          edits.push({ from: ref.from, to: ref.to, insert: doc.slice(ref.from + 1, ref.to) })
          return false
        case 'Raw': {
          const run = /^`+/.exec(doc.slice(ref.from, ref.to))?.[0].length ?? 0
          const tag =
            run >= 3 ? (/^[^\s`]*/.exec(doc.slice(ref.from + run, ref.to))?.[0].length ?? 0) : 0
          const open = Math.min(ref.from + run + tag, ref.to)
          const close = Math.max(ref.to - run, open)
          edits.push({ from: ref.from, to: ref.to, insert: doc.slice(open, close).trim() })
          return false
        }
        case 'Expression': {
          const replaced = call(ref.node)
          if (replaced === null) return undefined
          edits.push({ from: ref.from, to: ref.to, insert: replaced })
          return false
        }
        default:
          if (MARKS.has(ref.name)) edits.push({ from: ref.from, to: ref.to, insert: '' })
          return undefined
      }
    },
  })

  /** A call as its words, or null when it is not a call the tree knows the name of. */
  function call(node: SyntaxNode): string | null {
    const nameNode = node.getChild('FuncName')
    if (!nameNode) return null
    const name = doc.slice(nameNode.from, nameNode.to)
    const content = node.getChild('Content')
    const words = content ? inner(content.from + 1, content.to - 1).trim() : null
    if (name === 'footnote') return options.footnote(words ?? '')
    const argsNode = node.getChild('Args')
    const args: ReadableArg[] = []
    if (argsNode && argsNode.to - argsNode.from >= 2) {
      for (const arg of parseArgs(doc, argsNode.from, argsNode.to - 1)) {
        const code = doc.slice(arg.valueFrom, arg.valueTo).trim()
        const isContent = code.startsWith('[') && code.endsWith(']')
        args.push({
          name: arg.name,
          text: isContent ? inner(arg.valueFrom + 1, arg.valueTo - 1).trim() : null,
          code,
        })
      }
    }
    return options.call(name, words, args)
  }

  edits.sort((a, b) => a.from - b.from || a.to - b.to)
  let out = ''
  let at = 0
  for (const edit of edits) {
    if (edit.from < at) continue // inside one already made
    out += doc.slice(at, edit.from) + edit.insert
    at = edit.to
  }
  return out + doc.slice(at)
}
