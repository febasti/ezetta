import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { buildFlow, segmentAt } from './flowDoc'
import type { FlowDoc, FlowSegment } from './flowDoc'
import { figureConfig, figureField } from './figureState'
import type { FigureConfig } from './figureState'
import { footnoteConfig, footnoteField } from './footnoteState'
import { citeConfig, citeField, missingField } from './citeState'
import type { CiteConfig } from './citeState'
import { refConfig, refField } from './refState'
import type { RefConfig } from './refState'
import { mathConfig, mathField } from './mathState'
import { quoteConfig, quoteField } from './quoteState'
import { tableConfig, tableField } from './tableState'
import type { TableConfig } from './tableState'
import type { QuoteConfig } from './quoteState'
import type { MathConfig } from './mathState'
import type { FootnoteConfig } from './footnoteState'
import { markupExtension } from './markup'
import type { MarkupLabels } from './markup'
import { cspNonceExtension, noBrowserProofing, writingTheme } from './theme'
import { typstLanguage } from './typst'

export interface FlowHandlers {
  /** The writer clicked a sheet heading, or into the text: open that sheet, at a file offset. */
  open: (path: string, offset: number) => void
}

export interface FlowLabels {
  /** Text under the heading, for example "19 words". */
  meta: (path: string) => string
  /** The name that tells the separator's button apart for a screen reader. */
  openSheet: (path: string) => string
}

/** The separator above each sheet. A button, so it works with the keyboard and screen readers. */
class SheetHeading extends WidgetType {
  constructor(
    private readonly segment: FlowSegment,
    private readonly meta: string,
    private readonly label: string,
    private readonly open: FlowHandlers['open'],
  ) {
    super()
  }

  override eq(other: SheetHeading): boolean {
    return (
      other.segment.path === this.segment.path &&
      other.segment.title === this.segment.title &&
      other.meta === this.meta
    )
  }

  override toDOM(): HTMLElement {
    // Space around a block widget must be padding: CodeMirror's height map ignores margins, which
    // makes clicks land on the wrong position.
    const wrap = document.createElement('div')
    wrap.className = 'cm-sheet-heading-wrap'
    const button = document.createElement('button')
    button.className = 'cm-sheet-heading'
    button.type = 'button'
    button.setAttribute('aria-label', this.label)
    const title = document.createElement('span')
    title.className = 'cm-sheet-heading-title'
    title.textContent = this.segment.title
    const meta = document.createElement('span')
    meta.className = 'cm-sheet-heading-meta'
    meta.textContent = this.meta
    button.append(title, meta)
    button.addEventListener('click', () => this.open(this.segment.path, 0))
    wrap.append(button)
    return wrap
  }

  override ignoreEvent(): boolean {
    return true
  }
}

const flowTheme = EditorView.theme({
  '.cm-sheet-heading-wrap': { padding: 'var(--sp-24) 0 var(--sp-8)' },
  '.cm-sheet-heading': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    width: '100%',
    padding: 'var(--sp-4) var(--sp-8)',
    border: '0',
    borderRadius: 'var(--r-md)',
    background: 'var(--color-panel)',
    color: 'var(--color-label-secondary)',
    font: 'var(--type-caption)',
    textAlign: 'left',
    cursor: 'default',
  },
  '.cm-sheet-heading:hover': { background: 'var(--color-control)', color: 'var(--color-label)' },
  '.cm-sheet-heading:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px var(--color-focus)' },
  '.cm-sheet-heading-title': { fontWeight: '600', marginRight: 'auto' },
  '.cm-sheet-heading-title:empty': { display: 'none' },
  '.cm-sheet-heading-meta': {
    color: 'var(--color-label-tertiary)',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-content': { cursor: 'text' },
})

export interface FlowView {
  view: EditorView
  flow: FlowDoc
  setShowSource(show: boolean): void
  destroy(): void
}

/**
 * The continuous view: the text of several sheets in one read-only CodeMirror document, with a
 * heading widget above each sheet. Nothing here is ever saved. Clicking into the text opens that
 * sheet for editing at the matching spot. Dragging selects, so text can be copied.
 */
export function createFlowView(options: {
  parent: HTMLElement
  sources: Parameters<typeof buildFlow>[0]
  lang: string
  label: string
  labels: FlowLabels
  markupLabels: MarkupLabels
  showSource: boolean
  /** Numbering and labels for footnote markers. Opening a marker opens its sheet. */
  footnotes: Pick<FootnoteConfig, 'restart' | 'offsets' | 'labels'>
  /** Numbering and labels for images. Opening an image opens its sheet. */
  figures: Pick<FigureConfig, 'offset' | 'supplement' | 'separator' | 'labels'>
  /** Tables are drawn as in the sheet; a click opens the sheet. */
  tables: Pick<TableConfig, 'offset' | 'supplement' | 'separator' | 'labels'>
  /** Cross-references are chips as in the sheet; opening one opens its sheet. */
  refs: Partial<RefConfig>
  /** Citations are drawn as in the sheet; opening one opens its sheet. */
  cites: Pick<CiteConfig, 'lookup' | 'all' | 'language' | 'labels'>
  /** Quotation marks as in the sheet. There is no hint to make a block: the view only reads. */
  quotes: Pick<QuoteConfig, 'marks' | 'blockFromWords' | 'blockMarks' | 'labels'>
  /** Formulas are drawn as in the sheet; opening one opens its sheet. */
  math: Pick<MathConfig, 'service' | 'labels'>
  handlers: FlowHandlers
}): FlowView {
  const flow = buildFlow(options.sources)
  const markup = new Compartment()
  const builder = new RangeSetBuilder<Decoration>()
  for (const segment of flow.segments) {
    builder.add(
      segment.from,
      segment.from,
      Decoration.widget({
        widget: new SheetHeading(
          segment,
          options.labels.meta(segment.path),
          options.labels.openSheet(segment.path),
          options.handlers.open,
        ),
        block: true,
        side: -1,
      }),
    )
  }

  const extensions: Extension[] = [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    typstLanguage.extension,
    markup.of(markupExtension({ showSource: options.showSource, labels: options.markupLabels })),
    figureField,
    figureConfig.of({
      ...options.figures,
      onOpen: (_view, from) => {
        const segment = segmentAt(flow.segments, from)
        if (segment) options.handlers.open(segment.path, Math.max(0, from - segment.from))
      },
    }),
    tableField,
    tableConfig.of({
      ...options.tables,
      onOpen: (_view, from) => {
        const segment = segmentAt(flow.segments, from)
        if (segment) options.handlers.open(segment.path, Math.max(0, from - segment.from))
      },
    }),
    citeField,
    missingField,
    citeConfig.of({
      ...options.cites,
      onOpen: (_view, from) => {
        const segment = segmentAt(flow.segments, from)
        if (segment) options.handlers.open(segment.path, Math.max(0, from - segment.from))
      },
    }),
    refField,
    refConfig.of({
      ...options.refs,
      livePath: null,
      onOpen: (_view, from) => {
        const segment = segmentAt(flow.segments, from)
        if (segment) options.handlers.open(segment.path, Math.max(0, from - segment.from))
      },
    }),
    quoteField,
    quoteConfig.of(options.quotes),
    mathField,
    mathConfig.of({
      ...options.math,
      onOpen: (_view, from) => {
        const segment = segmentAt(flow.segments, from)
        if (segment) options.handlers.open(segment.path, Math.max(0, from - segment.from))
      },
    }),
    footnoteField,
    footnoteConfig.of({
      ...options.footnotes,
      mode: 'margin',
      onOpen: (_view, from) => {
        const segment = segmentAt(flow.segments, from)
        if (segment) options.handlers.open(segment.path, Math.max(0, from - segment.from))
      },
    }),
    writingTheme,
    flowTheme,
    ...cspNonceExtension(),
    noBrowserProofing(options.lang, options.label),
    EditorView.contentAttributes.of({ tabindex: '0' }),
    EditorView.decorations.of(builder.finish()),
    EditorView.domEventHandlers({
      // A click that selects nothing opens the sheet; a drag or double click selects text.
      click: (event, view) => {
        if (!view.state.selection.main.empty || event.detail > 1) return false
        // The caret CodeMirror just placed there is the most reliable position.
        const position = view.state.selection.main.head
        const segment = segmentAt(flow.segments, position)
        if (!segment) return false
        options.handlers.open(
          segment.path,
          Math.max(0, Math.min(position, segment.to) - segment.from),
        )
        return true
      },
    }),
  ]
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: flow.doc, extensions }),
  })
  return {
    view,
    flow,
    setShowSource: (show) =>
      view.dispatch({
        effects: markup.reconfigure(
          markupExtension({ showSource: show, labels: options.markupLabels }),
        ),
      }),
    destroy: () => view.destroy(),
  }
}
