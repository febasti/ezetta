<script lang="ts">
  import { citeLabels } from './citeLabels'
  import { figureLabels } from './figureLabels'
  import { footnoteLabels } from './footnoteLabels'
  import { quoteLabels } from './quoteLabels'
  import { mathLabels } from './mathLabels'
  import { tableLabels } from './tableLabels'
  import { blockQuoteWords, quoteMarks } from '@core/typst/quotes'
  import { bibliography } from '../bibliography/bibliography.svelte'
  import { crossRefSettings } from './crossRefs'
  import { CAPTION_MARKS, headingNumbering } from '../export/numbering.svelte'
  import { mathService } from './mathService'
  import { basename } from '@core/project/paths'
  import { onDestroy, untrack } from 'svelte'
  import { createFlowView } from '../../editor/flowView'
  import { watchScrollbarWidth } from '../../editor/scrollbar'
  import type { FlowView } from '../../editor/flowView'
  import { i18n } from '../../i18n/i18n.svelte'
  import { call } from '../../lib/api'
  import { formatNumber } from '../../lib/format'
  import { markupLabels } from '../../lib/markupLabels'
  import { ui } from '../../lib/ui.svelte'
  import { project } from '../sidebar/project.svelte'

  let host = $state<HTMLDivElement>()
  let flow: FlowView | null = null
  let status = $state<'loading' | 'ready' | 'empty'>('loading')
  let ticket = 0
  let stopWatching: (() => void) | null = null

  const key = $derived(project.flowPaths.join('\u0000'))
  const title = $derived(
    project.selectedGroup === ''
      ? (project.snapshot?.title ?? '')
      : basename(project.selectedGroup),
  )

  $effect(() => {
    void key
    void project.contentStamp
    if (host) void load(untrack(() => [...project.flowPaths]))
  })

  async function load(paths: string[]): Promise<void> {
    const mine = ++ticket
    if (paths.length === 0) {
      release()
      status = 'empty'
      return
    }
    const result = await call(window.api.project.readSheets({ paths }))
    if (mine !== ticket || !host || result === null) return
    const scroll = flow?.view.scrollDOM.scrollTop ?? 0
    release()
    flow = createFlowView({
      parent: host,
      sources: result.sheets.map((s) => ({
        path: s.path,
        // The text shows its own heading: the separator only has the word count.
        title: '',
        content: s.content,
      })),
      lang: project.snapshot?.language ?? 'de',
      label: i18n.t('flow.label', { name: title }),
      labels: {
        meta: (path) => {
          const node = project.node(path)
          return i18n.t('statusbar.words', {
            count: formatNumber(node?.kind === 'sheet' ? node.words : 0, i18n.locale),
          })
        },
        openSheet: (path) => i18n.t('flow.openSheet', { name: project.sheetLabel(path) }),
      },
      markupLabels,
      showSource: ui.showSource,
      figures: {
        offset: project.figureOffset(paths[0] ?? ''),
        supplement: headingNumbering.captionSupplement('fig', project.snapshot?.language ?? 'de'),
        separator: CAPTION_MARKS[headingNumbering.captionSeparator],
        labels: figureLabels(),
      },
      tables: {
        offset: project.tableOffset(paths[0] ?? ''),
        supplement: headingNumbering.captionSupplement('tbl', project.snapshot?.language ?? 'de'),
        separator: CAPTION_MARKS[headingNumbering.captionSeparator],
        labels: tableLabels(),
      },
      refs: crossRefSettings({ livePath: null }),
      cites: {
        lookup: bibliography.lookup,
        all: () => bibliography.entries,
        language: project.snapshot?.language ?? 'de',
        labels: citeLabels(),
      },
      quotes: {
        marks: quoteMarks(project.snapshot?.language ?? 'de', project.snapshot?.quoteStyle),
        blockFromWords: blockQuoteWords(project.snapshot?.citationStyle ?? ''),
        blockMarks: project.snapshot?.quoteBlockMarks ?? false,
        labels: quoteLabels(),
      },
      math: {
        service: mathService,
        labels: mathLabels(),
      },
      footnotes: {
        restart: project.snapshot?.footnoteRestart ?? 'continuous',
        offsets: project.footnoteOffsets(paths[0] ?? ''),
        labels: footnoteLabels(),
      },
      handlers: { open: (path, offset) => void project.openSheet(path, offset) },
    })
    flow.view.scrollDOM.scrollTop = scroll
    stopWatching = watchScrollbarWidth(flow.view, (width) => (ui.scrollbarWidth = width))
    status = 'ready'
  }

  $effect(() => {
    // Read first: with optional chaining the effect would not subscribe while there is no view yet.
    const show = ui.showSource
    flow?.setShowSource(show)
  })

  function release(): void {
    stopWatching?.()
    stopWatching = null
    flow?.destroy()
    flow = null
  }

  onDestroy(() => {
    ticket += 1
    release()
  })
</script>

<div class="flow" data-testid="flow">
  <div class="view" bind:this={host} hidden={status !== 'ready'}></div>
  {#if status === 'empty'}
    <div class="message"><p>{i18n.t('flow.empty')}</p></div>
  {:else if status === 'loading'}
    <div class="message"><p>{i18n.t('flow.loading')}</p></div>
  {/if}
</div>

<style>
  .flow {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .view {
    flex: 1;
    min-height: 0;
  }
  .view > :global(.cm-editor) {
    height: 100%;
  }
  .message {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    color: var(--color-label-tertiary);
  }
</style>
