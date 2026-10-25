<script lang="ts">
  import { fittedWidths, ui, setWidth } from '../../lib/ui.svelte'
  import ColumnResizer from '../../ui/ColumnResizer.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import GroupsColumn from './GroupsColumn.svelte'
  import OutlinePane from './OutlinePane.svelte'
  import { project } from './project.svelte'
  import SheetsColumn from './SheetsColumn.svelte'

  const fit = $derived(fittedWidths())
  const manifestNotice = $derived(
    project.snapshot?.warnings.flatMap((w) => (w.kind === 'manifest' ? [w.message] : []))[0],
  )
</script>

<aside class="sidebar" aria-label={project.snapshot?.title}>
  {#if manifestNotice}
    <div class="notice"><Callout tone="warning">{manifestNotice}</Callout></div>
  {/if}
  <div class="columns">
    {#if ui.outlineVisible}
      <div class="col" style:width="{fit.outline}px"><OutlinePane /></div>
      <ColumnResizer width={fit.outline} onresize={(w) => setWidth('outline', w)} />
    {:else if ui.groupsVisible}
      <div class="col" style:width="{fit.groups}px"><GroupsColumn /></div>
      <ColumnResizer width={fit.groups} onresize={(w) => setWidth('groups', w)} />
    {/if}
    {#if ui.sheetsVisible && !ui.outlineVisible}
      <div class="col" style:width="{fit.sheets}px"><SheetsColumn /></div>
      <ColumnResizer width={fit.sheets} onresize={(w) => setWidth('sheets', w)} />
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    flex: none;
    height: 100%;
    background: var(--color-sidebar);
    border-right: 1px solid var(--color-separator);
  }
  .notice {
    padding: var(--sp-8) var(--sp-8) 0;
  }
  .columns {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .col {
    flex: none;
    min-width: 0;
    height: 100%;
  }
  /* One hairline between two columns; the sidebar's own edge is the last. */
  .col ~ .col {
    border-left: 1px solid var(--color-separator);
  }
</style>
