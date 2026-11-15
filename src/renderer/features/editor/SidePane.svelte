<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { createFlowView } from '../../editor/flowView'
  import type { FlowView } from '../../editor/flowView'
  import { i18n } from '../../i18n/i18n.svelte'
  import { call } from '../../lib/api'
  import { ui } from '../../lib/ui.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import { project } from '../sidebar/project.svelte'
  import { editor } from './editorSession.svelte'
  import { flowSettings } from './flowSettings'
  import { split } from './split.svelte'

  /**
   * The pane read beside the editor: a sheet drawn like the text, read-only. A click into it moves
   * the editor here (`split.activate`). It shows the file as it is on disk, and follows it when it
   * changes; when the editor has the same sheet open, it follows the typing instead.
   */
  interface Props {
    path: string
  }
  let { path }: Props = $props()

  let host = $state<HTMLDivElement>()
  let flow: FlowView | null = null
  let ticket = 0
  const sameAsEditor = $derived(path === editor.path)
  const name = $derived(project.sheetLabel(path))

  /** Builds the view for the sheet's text. */
  function show(text: string, scroll: number): void {
    flow?.destroy()
    flow = createFlowView({
      ...flowSettings(path),
      parent: host!,
      sources: [{ path, title: '', content: text }],
      label: i18n.t('split.label', { name }),
      labels: { meta: () => '', openSheet: () => name },
      single: true,
      handlers: { open: (_path, offset) => void activate(offset) },
    })
    flow.view.scrollDOM.scrollTop = scroll
  }

  async function activate(offset: number): Promise<void> {
    await split.activate(offset, (target, cursor, options) =>
      project.openSheet(target, cursor, options),
    )
  }

  // A new sheet in the pane: read it (from the editor when it is the same sheet), and start where
  // the editor was when its sheet came over from there.
  $effect(() => {
    const current = path
    if (!host) return
    void untrack(async () => {
      const mine = ++ticket
      const live = current === editor.path ? editor.currentText() : null
      const text =
        live ?? (await call(window.api.project.readSheet({ path: current })))?.content ?? null
      if (mine !== ticket || text === null) return
      show(text, split.otherScroll)
    })
  })

  // The file changed on disk (another program, a restore): show what it holds now.
  $effect(() => {
    void project.contentStamp
    untrack(() => {
      if (!flow || sameAsEditor) return
      const mine = ++ticket
      void call(window.api.project.readSheet({ path })).then((result) => {
        if (mine === ticket && result) flow?.setContent(result.content)
      })
    })
  })

  // The same sheet as the editor's: follow the typing, a moment after it pauses.
  $effect(() => {
    void editor.liveVersion
    if (!sameAsEditor) return
    const timer = setTimeout(() => {
      const text = editor.currentText()
      if (text !== null) flow?.setContent(text)
    }, 300)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    const showSource = ui.showSource
    flow?.setShowSource(showSource)
  })

  split.readScroll = () => flow?.view.scrollDOM.scrollTop ?? 0

  onDestroy(() => {
    ticket += 1
    flow?.destroy()
    flow = null
    split.readScroll = () => 0
  })
</script>

<section class="side" aria-label={i18n.t('split.label', { name })}>
  <header class="bar">
    <span class="name" title={name}>{name}</span>
    <span class="hint">{i18n.t('split.hint')}</span>
    <IconButton icon="x" size="sm" label={i18n.t('split.close')} onclick={() => split.close()} />
  </header>
  <div class="view" bind:this={host}></div>
</section>

<style>
  .side {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  /* What the pane shows, and that a click makes it the one written in: floating in its corner, as
   * the badge does beside it, so the two texts start level. */
  .side {
    position: relative;
  }
  .bar {
    position: absolute;
    z-index: 2;
    top: var(--sp-12);
    right: var(--sp-16);
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    max-width: calc(100% - 2 * var(--sp-16));
    padding: var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-8);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--color-window) 88%, transparent);
    box-shadow: 0 0 0 1px var(--color-separator);
    color: var(--color-label-secondary);
    font: var(--type-caption);
    backdrop-filter: blur(6px);
  }
  .name {
    overflow: hidden;
    color: var(--color-label);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    color: var(--color-label-tertiary);
    white-space: nowrap;
  }
  .view {
    flex: 1;
    min-height: 0;
  }
  .view > :global(.cm-editor) {
    height: 100%;
  }
</style>
