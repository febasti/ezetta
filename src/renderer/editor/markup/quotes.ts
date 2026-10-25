import { Decoration } from '@codemirror/view'
import type { Quote } from '@core/typst/quotes'
import type { SyntaxNode } from '@lezer/common'
import type { AtomicUnit } from '../atomicKeys'
import { groupChipFor } from '../citeWidget'
import { armedQuoteField, quoteConfig, quoteField } from '../quoteState'
import type { QuoteConfig } from '../quoteState'
import { EpigraphSource, QuoteHint, QuoteMark, QuoteSource, QuoteSourceAdd } from '../quoteWidgets'
import type { QuoteEmphasis, SourcePart } from '../quoteWidgets'
import type { Builder, Call } from './builder'
import type { ChipMarkup } from './chips'

/**
 * Quotes in their three kinds. An inline quote shows the quotation marks of the project's language
 * in place of its syntax; the marks go only with the last of the quote's words, never by a press next
 * to them (`atomicKeys.ts`). A block quote hides its wrapper for good and is drawn with a rule, with
 * its source (`attribution`) at its end. An epigraph is a block quote labelled `<epigraph>`.
 */
export class QuoteMarkup {
  private readonly settings: QuoteConfig
  private readonly byStart: Map<number, Quote>
  /** The quote pressed once next to its marks: the next press takes it off (`atomicKeys.ts`). */
  private readonly armed: number | null
  /** The quote the caret is in (the innermost one): its marks, or a block quote's rule, are in the accent. */
  private readonly current: number | null
  /** Where the labels of epigraphs end: they are hidden with the quote's closing bracket. */
  private readonly epigraphLabels: Set<number>
  /** Where the sources of block quotes are written: drawn at the end of the quote, so not there. */
  private readonly attributions: { from: number; to: number }[]

  constructor(
    private readonly b: Builder,
    private readonly chips: ChipMarkup,
  ) {
    const { state, caret } = b
    const quotes = state.field(quoteField, false) ?? []
    this.settings = state.facet(quoteConfig)
    this.byStart = new Map(quotes.map((quote) => [quote.from, quote]))
    this.armed = state.field(armedQuoteField, false) ?? null
    this.current = quotes.reduce<number | null>(
      (inner, q) =>
        q.openTo <= caret.head && caret.head <= q.closeFrom && (inner === null || q.from > inner)
          ? q.from
          : inner,
      null,
    )
    this.epigraphLabels = new Set(quotes.filter((q) => q.epigraph).map((q) => q.end))
    this.attributions = quotes.flatMap((q) => (q.attribution ? [q.attribution] : []))
  }

  /** True for syntax inside the source of a block quote, which is drawn at the quote's end instead. */
  inSource(node: SyntaxNode): boolean {
    return (
      !this.b.showSource &&
      this.attributions.length > 0 &&
      this.attributions.some((a) => node.from >= a.from && node.to <= a.to)
    )
  }

  /** True for the label of an epigraph, which is hidden with its quote's closing bracket. */
  hidesLabel(node: SyntaxNode): boolean {
    return !this.b.showSource && this.epigraphLabels.has(node.to)
  }

  /** An inline quote: its wrapper is drawn as the quotation marks of the project's language. */
  inline({ node, name, open, close }: Call): boolean {
    const { b, settings } = this
    const quote = name === 'quote' ? this.byStart.get(node.from) : undefined
    if (!quote || quote.block || !open || !close || b.showSource) return false
    const level = Math.min(quote.depth, 1)
    const unit: AtomicUnit = {
      from: node.from,
      to: node.to,
      block: false,
      quoteFrom: node.from,
      quote: { content: { from: open.to, to: close.from } },
    }
    const quoteMark = (side: 'open' | 'close'): QuoteMark =>
      new QuoteMark(
        settings.marks[side][level]!,
        side,
        settings.labels.mark(side),
        level === 0 ? 1 : 2,
        this.emphasis(node.from),
      )
    // The quote is a unit with a faint ground, marks included, so that it can be told from
    // quotation marks typed by hand; one inside another gets a deeper ground.
    b.add(
      Decoration.mark({
        class:
          (level === 0 ? 'cm-quote-inline' : 'cm-quote-inline inner') +
          (this.armed === node.from ? ' armed' : ''),
      }),
      node.from,
      node.to,
    )
    b.addWidget(quoteMark('open'), node.from, open.to, unit)
    b.addWidget(quoteMark('close'), close.from, close.to, unit)
    if (
      !b.state.readOnly &&
      quote.words >= settings.blockFromWords &&
      b.touches(node.from, node.to)
    )
      b.ranges.push(
        Decoration.widget({
          widget: new QuoteHint(quote.words, settings.labels.hint(quote.words)),
          side: 1,
        }).range(close.to),
      )
    return true
  }

  /**
   * A block quote (`#quote(block: true)[…]`). Its wrapper is hidden and atomic, like the marks of an
   * inline quote: the caret cannot enter it, and a press next to it marks the quote, the next one
   * takes it off (`atomicKeys.ts`). An epigraph has its label `<epigraph>` behind the closing
   * bracket: it is hidden with it, and goes with it. In "Quelltext" the wrapper is dimmed.
   */
  block({ node, name, args, open, close }: Call): boolean {
    const { b, settings } = this
    const { doc } = b
    if (name !== 'quote' || !open || !close || !args) return false
    if (!/block\s*:\s*true/.test(doc.sliceString(args.from, args.to))) return false
    if (b.showSource) {
      b.marker(node.from, open.to)
      b.marker(close.from, close.to)
      b.addLine('cm-quote', node.from, node.to)
      return true
    }
    const quote = this.byStart.get(node.from)
    const epigraph = quote?.epigraph ?? false
    const endPos = quote?.end ?? node.to
    const first = doc.lineAt(node.from)
    const last = doc.lineAt(endPos)
    const atStart = doc.sliceString(first.from, node.from).trim() === ''
    const atEnd = doc.sliceString(endPos, last.to).trim() === ''
    const unit: AtomicUnit = {
      from: node.from,
      to: endPos,
      block: false,
      quoteFrom: node.from,
      quote: { content: { from: open.to, to: close.from } },
    }
    // With the project setting the wrapper is drawn as the quotation marks of the language (not
    // for an epigraph, which has none).
    const put = (side: 'open' | 'close', from: number, to: number, piece: AtomicUnit): void => {
      if (settings.blockMarks && !epigraph)
        b.addWidget(
          new QuoteMark(
            settings.marks[side][0],
            side,
            settings.labels.mark(side),
            0,
            this.emphasis(node.from),
          ),
          from,
          to,
          piece,
        )
      else b.addHidden(from, to, piece)
    }
    put('open', node.from, open.to, {
      ...unit,
      ...(atStart
        ? {
            edge: {
              outer: node.from,
              inner: open.to,
              out: first.from > 0 ? first.from - 1 : open.to,
            },
          }
        : {}),
    })
    put('close', close.from, endPos, {
      ...unit,
      ...(atEnd
        ? {
            edge: {
              outer: endPos,
              inner: close.from,
              out: last.to < doc.length ? last.to + 1 : close.from,
            },
          }
        : {}),
    })
    b.addLine(epigraph ? 'cm-epigraph' : 'cm-quote', node.from, endPos)
    const emphasis = this.emphasis(node.from)
    if (emphasis) b.addLine(`cm-quote-${emphasis}`, node.from, endPos)
    if (quote) this.addSource(quote, close.to, last.to)
    return true
  }

  /** How the marks of the quote that starts at `from` are drawn. */
  private emphasis(from: number): QuoteEmphasis {
    return this.armed === from ? 'armed' : this.current === from ? 'current' : null
  }

  /**
   * The source of a block quote. A quote in the text has its citations as chips at its end, with
   * any words that go with them; an epigraph has a field for free text on a line of its own.
   */
  private addSource(quote: Quote, closeTo: number, lineEnd: number): void {
    const { b, chips } = this
    const { doc } = b
    const source = quote.attribution
    if (quote.epigraph) {
      const text = source ? doc.sliceString(source.innerFrom, source.innerTo) : ''
      b.ranges.push(
        Decoration.widget({
          widget: new EpigraphSource(text, this.settings.labels, b.state.readOnly),
          block: true,
          side: 1,
        }).range(lineEnd),
      )
      return
    }
    if (source) {
      const parts: SourcePart[] = []
      let pos = source.innerFrom
      const text = (to: number): void => {
        const words = doc.sliceString(pos, to).trim()
        if (words) parts.push({ kind: 'text', text: words })
      }
      for (const group of chips.groups) {
        if (group[0]!.attributionOf !== quote.from) continue
        const from = group[0]!.from
        text(from)
        parts.push({
          kind: 'chip',
          chip: groupChipFor(group, chips.settings),
          from,
          active: chips.activeFrom === from,
        })
        pos = group[group.length - 1]!.end
      }
      text(source.innerTo)
      b.ranges.push(
        Decoration.widget({ widget: new QuoteSource(parts, chips.settings), side: 1 }).range(
          closeTo,
        ),
      )
      return
    }
    if (!b.state.readOnly && b.touches(quote.from, quote.to))
      b.ranges.push(
        Decoration.widget({
          widget: new QuoteSourceAdd(this.settings.labels.addSource),
          side: 1,
        }).range(closeTo),
      )
  }
}
