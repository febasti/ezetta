<script lang="ts">
  import { basename } from '@core/project/paths'
  import { i18n } from '../../i18n/i18n.svelte'
  import { formatNumber } from '../../lib/format'
  import { openDropdown } from '../../lib/menu.svelte'
  import Chip from '../../ui/kit/Chip.svelte'
  import Icon from '../../ui/Icon.svelte'
  import Spinner from '../../ui/Spinner.svelte'
  import { proofWaiting } from '../proof/proof.svelte'
  import { project } from '../sidebar/project.svelte'
  import { editor } from './editorSession.svelte'

  const STATUSES = ['draft', 'revised', 'final'] as const

  const flow = $derived(project.mode === 'flow')
  const sheet = $derived(!flow && editor.path ? project.node(editor.path) : null)
  const sheetNode = $derived(sheet?.kind === 'sheet' ? sheet : null)

  /** The group in the continuous view: the text shows its sheets, so this says which group it is. */
  const groupName = $derived(
    project.selectedGroup === ''
      ? (project.snapshot?.title ?? '')
      : basename(project.selectedGroup),
  )

  const words = $derived(
    flow
      ? project.flowPaths.reduce((sum, p) => {
          const node = project.node(p)
          return sum + (node?.kind === 'sheet' ? node.words : 0)
        }, 0)
      : editor.liveStats.words,
  )
  const num = (n: number): string => formatNumber(n, i18n.locale)

  /**
   * Whether the text has scrolled under the badge: it lies over the text column (a narrow window)
   * and the text is no longer at its top. The badge then steps aside, and comes back at the top or
   * when it has the keyboard's focus; the word count is in the status bar meanwhile.
   */
  let badge = $state<HTMLElement>()
  let covering = $state(false)
  $effect(() => {
    const element = badge
    const pane = element?.parentElement
    if (!element || !pane) return
    let frame = 0
    const check = (): void => {
      frame = 0
      const scroller = pane.querySelector('.cm-scroller')
      const content = pane.querySelector('.cm-content')
      if (!scroller || !content) {
        covering = false
        return
      }
      const own = element.getBoundingClientRect()
      const text = content.getBoundingClientRect()
      covering = scroller.scrollTop > 0 && own.left < text.right && own.right > text.left
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    // A scroll does not bubble, but it passes the pane on its way down.
    pane.addEventListener('scroll', schedule, true)
    const resized = new ResizeObserver(schedule)
    resized.observe(pane)
    schedule()
    return () => {
      pane.removeEventListener('scroll', schedule, true)
      resized.disconnect()
      cancelAnimationFrame(frame)
    }
  })
</script>

<!--
  The sheet's status and word count float in the corner of the text, so the text has the whole
  height. A sheet has no title and no path here: its first lines name it.
-->
<div
  class="badge"
  class:covering
  bind:this={badge}
  role="group"
  aria-label={i18n.t('header.label')}
>
  {#if !flow && proofWaiting()}
    <!-- The first check of the sheet is on its way: no underline does not mean no mistake yet. -->
    <Chip tone="neutral" title={i18n.t('proof.checking')}>
      <Spinner size={13} /><span role="status">{i18n.t('header.checking')}</span>
    </Chip>
  {/if}
  {#if flow}
    <Chip tone="neutral" title={i18n.t('flow.hint')}>{groupName}</Chip>
    <Chip tone="accent">{i18n.t('sidebar.sheetCount', { count: project.flowPaths.length })}</Chip>
  {/if}
  {#if sheetNode && !sheetNode.export}
    <!-- A scrapsheet has no status. -->
    <Chip tone="neutral" title={i18n.t('header.scrapsheetHint')}>
      <Icon name="note" size={13} />{i18n.t('header.scrapsheet')}
    </Chip>
  {:else if sheetNode}
    <Chip
      tone="neutral"
      title={i18n.t('header.status')}
      onclick={(event) =>
        openDropdown(
          event.currentTarget as HTMLElement,
          STATUSES.map((status) => ({
            label: i18n.t(`status.${status}`),
            checked: sheetNode.status === status,
            onselect: () => void project.setStatus([sheetNode.path], status),
          })),
        )}
    >
      <span class="dot {sheetNode.status}"></span>
      {i18n.t(`status.${sheetNode.status}`)}
    </Chip>
  {/if}
  <Chip tone="neutral">
    {sheetNode?.goal
      ? i18n.t('header.wordsOfGoal', { count: num(words), goal: num(sheetNode.goal) })
      : i18n.t('header.words', { count: num(words) })}
  </Chip>
  {#if sheetNode && sheetNode.export && !sheetNode.inExport}
    <Chip tone="neutral"><Icon name="eye-off" size={13} />{i18n.t('header.notInExport')}</Chip>
  {/if}
</div>

<style>
  /* Floats in the corner of the text, on a translucent window ground with a hairline ring. */
  .badge {
    position: absolute;
    z-index: 2;
    top: var(--sp-12);
    right: var(--sp-16);
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: var(--sp-4);
    max-width: calc(100% - var(--sp-24));
    padding: var(--sp-4);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--color-window) 88%, transparent);
    box-shadow: 0 0 0 1px var(--color-separator);
    backdrop-filter: blur(6px);
    transition: opacity var(--duration);
  }
  /* The text is under it: out of the way, unless the keys are on one of its chips. */
  .badge.covering:not(:focus-within) {
    opacity: 0;
    pointer-events: none;
  }
  /* The status in its role colour, as in the sheet cards. */
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-label-tertiary);
  }
  .dot.revised {
    background: var(--color-warning);
  }
  .dot.final {
    background: var(--color-success);
  }
</style>
