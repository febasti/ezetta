import { NodeSet, NodeType, Tree } from '@lezer/common'

/**
 * A small, tolerant parser for the Typst subset the app supports, producing a Lezer syntax tree. It is
 * written by hand, like @lezer/markdown, because Typst markup depends on context: `_` inside a word
 * is literal, `*` pairs only when a closer exists, `#` expressions contain balanced brackets.
 *
 * Rules: it never throws, every node lies inside its parent, and anything it does not understand is
 * left as plain text (no node), so the editor shows it as raw source. Extents of widgets come from
 * these nodes and never from regular expressions.
 *
 * Nodes (names are the contract with the editor):
 *   Heading(HeadingMark …)  ListItem(ListMark …)
 *   Emphasis(EmphasisMark … EmphasisMark)  Strong(StrongMark …)  Highlight(HighlightMark …)
 *   LineComment  BlockComment  Url  Math  Raw  Label  Escape
 *   Ref(Supplement?)
 *   Expression(Hash FuncName Args? Content*)   Content(ContentMark … ContentMark)
 *   CodeLine(Hash FuncName)  CodeBlock(Hash)
 */

const NAMES = [
  'Document',
  'Heading',
  'HeadingMark',
  'ListItem',
  'ListMark',
  'Emphasis',
  'EmphasisMark',
  'Strong',
  'StrongMark',
  'Highlight',
  'HighlightMark',
  'LineComment',
  'BlockComment',
  'Url',
  'Expression',
  'CodeLine',
  'CodeBlock',
  'Hash',
  'FuncName',
  'Args',
  'Content',
  'ContentMark',
  'Math',
  'Raw',
  'Label',
  'Ref',
  'Supplement',
  'Escape',
] as const

export type NodeName = (typeof NAMES)[number]

export const typstNodeSet = new NodeSet(
  NAMES.map((name, id) => NodeType.define({ id, name, top: name === 'Document' })),
)

interface Raw {
  type: NodeName
  from: number
  to: number
  children: Raw[]
}

const node = (type: NodeName, from: number, to: number, children: Raw[] = []): Raw => ({
  type,
  from,
  to,
  children,
})

type Kind = 'emph' | 'strong' | 'highlight'
const DELIMITER: Record<Kind, string> = { emph: '_', strong: '*', highlight: '::' }
const TYPES: Record<Kind, [NodeName, NodeName]> = {
  emph: ['Emphasis', 'EmphasisMark'],
  strong: ['Strong', 'StrongMark'],
  highlight: ['Highlight', 'HighlightMark'],
}

const CODE_KEYWORDS = new Set([
  'set',
  'show',
  'let',
  'import',
  'include',
  'if',
  'for',
  'while',
  'context',
  'else',
])
const HEADING = /^[ \t]*(=+)[ \t]/
const HEADING_EMPTY = /^[ \t]*(=+)[ \t]*$/
const LIST = /^([ \t]*)([-+])[ \t]/
const WORD = /[\p{L}\p{N}]/u
const IDENT_START = /[\p{L}_]/u
const IDENT_CHAR = /[\p{L}\p{N}_-]/u
const KEY_CHAR = /[\p{L}\p{N}_-]/u
const LABEL = /^<[\p{L}\p{N}_:.-]+>/u
const MAX_DEPTH = 200
const MAX_PARSE_DEPTH = 60

const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c)
/** The edges of the text count as whitespace. */
const isSpace = (c: string | undefined): boolean => c === undefined || /\s/.test(c)

type Stop = 'end' | 'closer' | 'outer' | 'break'

interface Ctx {
  /** Delimited spans currently open, outermost first. */
  open: Kind[]
  /** Top-level paragraph: stops at a blank line or the start of a heading or list item. */
  top: boolean
}

class MarkupParser {
  pos = 0
  /** Characters scanned by attempts that turned out unclosed. Bounded, so odd input stays fast. */
  private wasted = 0
  private readonly wasteLimit: number
  /** Nesting of content blocks, bounded to protect the call stack. */
  private depth = 0

  constructor(private readonly text: string) {
    this.wasteLimit = text.length * 20 + 20_000
  }

  parseDocument(): Raw[] {
    const { text } = this
    const out: Raw[] = []
    while (this.pos < text.length) {
      const lineEnd = this.lineEnd(this.pos)
      const line = text.slice(this.pos, lineEnd)
      if (/^\s*$/.test(line)) {
        this.pos = this.afterEol(lineEnd)
        continue
      }
      if (this.isHeadingLine(line)) {
        out.push(this.parseHeading(line, lineEnd))
        continue
      }
      const list = LIST.exec(line)
      if (list) {
        out.push(this.parseListItem(list, lineEnd))
        continue
      }
      out.push(...this.parseInline(text.length, { open: [], top: true }).nodes)
    }
    return out
  }

  // --- blocks -----------------------------------------------------------------------------------

  private isHeadingLine(line: string): boolean {
    return HEADING.test(line) || HEADING_EMPTY.test(line)
  }

  private parseHeading(line: string, lineEnd: number): Raw {
    const match = (HEADING.exec(line) ?? HEADING_EMPTY.exec(line))!
    const markerStart = this.pos + line.indexOf('=')
    const markerEnd = markerStart + match[1]!.length
    this.pos = markerEnd
    const inner = this.parseInline(lineEnd, { open: [], top: false }).nodes
    this.pos = this.afterEol(lineEnd)
    return node('Heading', markerStart, lineEnd, [
      node('HeadingMark', markerStart, markerEnd),
      ...inner,
    ])
  }

  private parseListItem(match: RegExpExecArray, lineEnd: number): Raw {
    const indent = this.indentWidth(match[1]!)
    const markerStart = this.pos + match[1]!.length
    let end = lineEnd
    // Following lines that are indented deeper belong to this item, unless they start a block.
    for (;;) {
      const next = this.afterEol(end)
      if (next >= this.text.length) break
      const nextEnd = this.lineEnd(next)
      const nextLine = this.text.slice(next, nextEnd)
      if (/^\s*$/.test(nextLine) || this.indentWidth(nextLine) <= indent) break
      if (this.isHeadingLine(nextLine) || LIST.test(nextLine)) break
      end = nextEnd
    }
    this.pos = markerStart + 1
    const inner = this.parseInline(end, { open: [], top: false }).nodes
    this.pos = this.afterEol(end)
    return node('ListItem', markerStart, end, [
      node('ListMark', markerStart, markerStart + 1),
      ...inner,
    ])
  }

  // --- inline -------------------------------------------------------------------------------------

  /** Scans from `this.pos` up to `end`. Constructs that must be balanced never reach past `end`. */
  parseInline(end: number, ctx: Ctx): { nodes: Raw[]; stop: Stop } {
    const { text } = this
    const nodes: Raw[] = []
    while (this.pos < end) {
      const at = this.pos
      const c = text[at]!

      if (ctx.open.length > 0) {
        const closing = this.closerAt(at, ctx.open)
        if (closing !== null)
          return { nodes, stop: closing === ctx.open.length - 1 ? 'closer' : 'outer' }
      }

      switch (c) {
        case '\n': {
          this.pos += 1
          if ((ctx.top || ctx.open.length > 0) && this.isBreakAt(this.pos))
            return { nodes, stop: 'break' }
          continue
        }
        case '\\': {
          if (at + 1 < end) {
            nodes.push(node('Escape', at, at + 2))
            this.pos += 2
          } else this.pos += 1
          continue
        }
        case '/': {
          const comment = this.parseComment(end)
          if (comment) {
            nodes.push(comment)
            continue
          }
          break
        }
        case '$': {
          const close = this.findUnescaped('$', at + 1, end)
          if (close >= at + 1) {
            nodes.push(node('Math', at, close + 1))
            this.pos = close + 1
            continue
          }
          break
        }
        case '`': {
          const raw = this.parseRaw(end)
          if (raw) {
            nodes.push(raw)
            continue
          }
          break
        }
        case '#': {
          const expr = this.parseExpression(end)
          if (expr) {
            nodes.push(expr)
            continue
          }
          break
        }
        case '@': {
          const ref = this.parseRef(end)
          if (ref) {
            nodes.push(ref)
            continue
          }
          break
        }
        case '<': {
          const match = LABEL.exec(text.slice(at, Math.min(end, at + 80)))
          if (match) {
            nodes.push(node('Label', at, at + match[0].length))
            this.pos += match[0].length
            continue
          }
          break
        }
        case 'h': {
          const url = this.parseUrl(end)
          if (url) {
            nodes.push(url)
            continue
          }
          break
        }
        case '_':
        case '*':
        case ':': {
          const kind: Kind = c === '_' ? 'emph' : c === '*' ? 'strong' : 'highlight'
          if (c !== ':' || text[at + 1] === ':') {
            const span = this.tryDelimited(kind, end, ctx)
            if (span) {
              nodes.push(span)
              continue
            }
          }
          break
        }
      }
      this.pos += 1
    }
    return { nodes, stop: 'end' }
  }

  private tryDelimited(kind: Kind, end: number, ctx: Ctx): Raw | null {
    if (
      ctx.open.includes(kind) ||
      this.wasted > this.wasteLimit ||
      !this.canOpen(kind, this.pos, end)
    ) {
      return null
    }
    const start = this.pos
    const width = DELIMITER[kind].length
    this.pos += width
    const inner = this.parseInline(end, { open: [...ctx.open, kind], top: false })
    if (inner.stop !== 'closer') {
      this.wasted += this.pos - start
      this.pos = start
      return null
    }
    const closeAt = this.pos
    this.pos += width
    const [type, mark] = TYPES[kind]
    return node(type, start, this.pos, [
      node(mark, start, start + width),
      ...inner.nodes,
      node(mark, closeAt, closeAt + width),
    ])
  }

  private canOpen(kind: Kind, pos: number, end: number): boolean {
    const delimiter = DELIMITER[kind]
    const { text } = this
    if (!text.startsWith(delimiter, pos)) return false
    const before = text[pos - 1]
    const after = pos + delimiter.length < end ? text[pos + delimiter.length] : undefined
    if (isSpace(after) || after === delimiter[0]) return false
    if (kind === 'highlight') return before !== ':'
    return !isWord(before)
  }

  private isCloser(kind: Kind, pos: number): boolean {
    const delimiter = DELIMITER[kind]
    const { text } = this
    if (!text.startsWith(delimiter, pos)) return false
    const before = text[pos - 1]
    const after = text[pos + delimiter.length]
    if (isSpace(before) || after === delimiter[0]) return false
    return kind === 'highlight' ? true : !isWord(after)
  }

  /** Index into `open` of the innermost-first delimiter that closes at `pos`, or null. */
  private closerAt(pos: number, open: readonly Kind[]): number | null {
    const c = this.text[pos]
    if (c !== '_' && c !== '*' && c !== ':') return null
    for (let i = open.length - 1; i >= 0; i -= 1) if (this.isCloser(open[i]!, pos)) return i
    return null
  }

  private isBreakAt(pos: number): boolean {
    if (pos >= this.text.length) return false
    const line = this.text.slice(pos, this.lineEnd(pos))
    return /^\s*$/.test(line) || this.isHeadingLine(line) || LIST.test(line)
  }

  // --- atoms --------------------------------------------------------------------------------------

  private parseComment(end: number): Raw | null {
    const { text } = this
    const at = this.pos
    if (text[at + 1] === '/') {
      if (text[at - 1] === ':') return null // part of a URL such as file://
      let to = at
      while (to < end && text[to] !== '\n') to += 1
      if (text[to - 1] === '\r') to -= 1
      this.pos = to
      return node('LineComment', at, to)
    }
    if (text[at + 1] === '*') {
      const close = this.skipBlockComment(at, end)
      if (close < 0) return null
      this.pos = close
      return node('BlockComment', at, close)
    }
    return null
  }

  private parseRaw(end: number): Raw | null {
    const { text } = this
    const at = this.pos
    let run = 1
    while (text[at + run] === '`') run += 1
    const fence = '`'.repeat(run)
    let from = at + run
    for (;;) {
      const close = text.indexOf(fence, from)
      if (close < 0 || close + run > end) return null
      if (text[close + run] === '`') {
        from = close + run
        while (text[from] === '`') from += 1
        continue
      }
      if (run === 1 && text.slice(at, close).includes('\n')) return null
      this.pos = close + run
      return node('Raw', at, close + run)
    }
  }

  private parseUrl(end: number): Raw | null {
    const { text } = this
    const at = this.pos
    if (isWord(text[at - 1])) return null
    if (!text.startsWith('http://', at) && !text.startsWith('https://', at)) return null
    let to = at
    while (to < end && !/\s/.test(text[to]!)) to += 1
    while (to > at && /[.,;:!?)\]}'"]/.test(text[to - 1]!)) to -= 1
    if (to - at <= (text.startsWith('https', at) ? 8 : 7)) return null
    this.pos = to
    return node('Url', at, to)
  }

  private parseRef(end: number): Raw | null {
    const { text } = this
    const at = this.pos
    if (isWord(text[at - 1]) || !KEY_CHAR.test(text[at + 1] ?? '')) return null
    let to = at + 1
    while (
      to < end &&
      (KEY_CHAR.test(text[to]!) ||
        ((text[to] === ':' || text[to] === '.') && KEY_CHAR.test(text[to + 1] ?? '')))
    )
      to += 1
    const children: Raw[] = []
    if (text[to] === '[') {
      const close = this.scanContent(to, end, 0)
      if (close >= 0) {
        children.push(node('Supplement', to, close))
        to = close
      }
    }
    this.pos = to
    return node('Ref', at, to, children)
  }

  private parseExpression(end: number): Raw | null {
    const { text } = this
    const start = this.pos
    const first = text[start + 1]
    if (first === undefined) return null
    const hash = node('Hash', start, start + 1)
    if (first === '(' || first === '{') {
      const close = this.scanCode(start + 1, end, 0)
      if (close < 0) return null
      this.pos = close
      return node('CodeBlock', start, close, [hash])
    }
    if (!IDENT_START.test(first)) return null
    let nameEnd = start + 2
    while (
      nameEnd < end &&
      (IDENT_CHAR.test(text[nameEnd]!) ||
        (text[nameEnd] === '.' && IDENT_START.test(text[nameEnd + 1] ?? '')))
    )
      nameEnd += 1
    const name = text.slice(start + 1, nameEnd)
    const children: Raw[] = [hash, node('FuncName', start + 1, nameEnd)]
    if (CODE_KEYWORDS.has(name)) {
      const close = this.scanCodeLine(nameEnd, end)
      this.pos = close
      return node('CodeLine', start, close, children)
    }
    let p = nameEnd
    if (text[p] === '(') {
      const close = this.scanCode(p, end, 0)
      if (close >= 0) {
        children.push(node('Args', p, close))
        p = close
      }
    }
    while (text[p] === '[') {
      const close = this.scanContent(p, end, 0)
      if (close < 0) break
      this.pos = p + 1
      let inner: Raw[] = []
      if (this.depth < MAX_PARSE_DEPTH) {
        this.depth += 1
        inner = this.parseInline(close - 1, { open: [], top: false }).nodes
        this.depth -= 1
      }
      children.push(
        node('Content', p, close, [
          node('ContentMark', p, p + 1),
          ...inner,
          node('ContentMark', close - 1, close),
        ]),
      )
      p = close
    }
    this.pos = p
    return node('Expression', start, p, children)
  }

  // --- balanced scanning (return the index after the construct, or -1) --------------------------

  private skipBlockComment(from: number, end: number): number {
    const { text } = this
    let depth = 0
    let i = from
    while (i < end) {
      if (text[i] === '/' && text[i + 1] === '*') {
        depth += 1
        i += 2
      } else if (text[i] === '*' && text[i + 1] === '/') {
        depth -= 1
        i += 2
        if (depth === 0) return i
      } else i += 1
    }
    return -1
  }

  private skipString(from: number, end: number): number {
    const { text } = this
    for (let i = from + 1; i < end; i += 1) {
      if (text[i] === '\\') i += 1
      else if (text[i] === '"') return i + 1
    }
    return -1
  }

  /** `text[from]` is "[": the index after its matching "]". Quotes are plain text in content. */
  private scanContent(from: number, end: number, depth: number): number {
    if (depth > MAX_DEPTH) return -1
    const { text } = this
    let level = 0
    for (let i = from; i < end; i += 1) {
      const c = text[i]
      if (c === '\\') i += 1
      else if (c === '/' && text[i + 1] === '*') {
        const close = this.skipBlockComment(i, end)
        if (close < 0) return -1
        i = close - 1
      } else if (c === '`' || c === '$') {
        // Raw text and math may contain brackets. Skip them when they are closed; a lone
        // backtick or dollar sign is just a character.
        const close = c === '$' ? this.findUnescaped('$', i + 1, end) : this.findRawEnd(i, end)
        if (close > i) i = close
      } else if (c === '[') level += 1
      else if (c === ']') {
        level -= 1
        if (level === 0) return i + 1
      }
    }
    return -1
  }

  /** `text[from]` is "(" or "{": the index after its matching closer. Strings are skipped. */
  private scanCode(from: number, end: number, depth: number): number {
    if (depth > MAX_DEPTH) return -1
    const { text } = this
    const closer = text[from] === '(' ? ')' : '}'
    let i = from + 1
    while (i < end) {
      const c = text[i]!
      if (c === '"') {
        i = this.skipString(i, end)
        if (i < 0) return -1
      } else if (c === '(' || c === '{') {
        i = this.scanCode(i, end, depth + 1)
        if (i < 0) return -1
      } else if (c === '[') {
        i = this.scanContent(i, end, depth + 1)
        if (i < 0) return -1
      } else if (c === closer) return i + 1
      else if (c === '/' && text[i + 1] === '*') {
        i = this.skipBlockComment(i, end)
        if (i < 0) return -1
      } else if (c === '/' && text[i + 1] === '/') {
        while (i < end && text[i] !== '\n') i += 1
      } else i += 1
    }
    return -1
  }

  private scanCodeLine(from: number, end: number): number {
    const { text } = this
    let i = from
    while (i < end && text[i] !== '\n') {
      const c = text[i]!
      let next = -1
      if (c === '"') next = this.skipString(i, end)
      else if (c === '(' || c === '{') next = this.scanCode(i, end, 0)
      else if (c === '[') next = this.scanContent(i, end, 0)
      i = next >= 0 ? next : i + 1
    }
    return text[i - 1] === '\r' ? i - 1 : i
  }

  /** Index of the last backtick of the raw span that starts at `from`, or -1. */
  private findRawEnd(from: number, end: number): number {
    const { text } = this
    let run = 1
    while (text[from + run] === '`') run += 1
    const fence = '`'.repeat(run)
    let search = from + run
    for (;;) {
      const close = text.indexOf(fence, search)
      if (close < 0 || close + run > end) return -1
      if (text[close + run] === '`') {
        search = close + run
        while (text[search] === '`') search += 1
        continue
      }
      if (run === 1 && text.slice(from, close).includes('\n')) return -1
      return close + run - 1
    }
  }

  private findUnescaped(char: string, from: number, end: number): number {
    for (let i = from; i < end; i += 1) {
      if (this.text[i] === '\\') i += 1
      else if (this.text[i] === char) return i
    }
    return -1
  }

  // --- lines --------------------------------------------------------------------------------------

  private lineEnd(pos: number): number {
    const nl = this.text.indexOf('\n', pos)
    const end = nl < 0 ? this.text.length : nl
    return end > pos && this.text[end - 1] === '\r' ? end - 1 : end
  }

  private afterEol(lineEnd: number): number {
    let p = lineEnd
    if (this.text[p] === '\r') p += 1
    if (this.text[p] === '\n') p += 1
    return p
  }

  private indentWidth(line: string): number {
    let width = 0
    for (const ch of line) {
      if (ch === ' ') width += 1
      else if (ch === '\t') width += 4
      else break
    }
    return width
  }
}

const TYPE_ID = new Map<NodeName, number>(NAMES.map((name, id) => [name, id]))

/**
 * Parses Typst source into a Lezer tree. Pass a node set to attach node props (the editor does); it
 * must keep the ids of `typstNodeSet`, as `NodeSet.extend` does.
 *
 * The tree is built by `Tree.build` from a postfix buffer, so Lezer packs small subtrees into
 * buffers and balances the long list of top-level nodes. A flat tree with a separate object per
 * node would make every lookup by position walk all paragraphs of the sheet.
 */
export function parseTypst(text: string, types: NodeSet = typstNodeSet): Tree {
  const buffer: number[] = []
  const emit = (n: Raw): void => {
    const start = buffer.length
    for (const child of n.children) emit(child)
    buffer.push(TYPE_ID.get(n.type)!, n.from, n.to, buffer.length + 4 - start)
  }
  for (const n of new MarkupParser(text).parseDocument()) emit(n)
  return Tree.build({
    buffer,
    nodeSet: types,
    topID: TYPE_ID.get('Document')!,
    length: text.length,
  })
}
