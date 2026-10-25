<script lang="ts">
  import { outlineOf, skippedLevels } from '@core/typst/outline'
  import { numberTargets } from '@core/typst/targets'
  import { i18n } from '../../i18n/i18n.svelte'
  import { setOutlineVisible } from '../../lib/ui.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import { editor } from '../editor/editorSession.svelte'
  import { headingNumbering } from '../export/numbering.svelte'
  import OutlineList from './OutlineList.svelte'
  import { project } from './project.svelte'

  /**
   * The Gliederung: the structure of the document as the headings in the text make it,
   * not as the folders do. It takes the place of the sidebar's two columns; a click on a heading
   * opens its sheet there. It follows what was last saved (the sheet statistics), so a heading typed
   * a moment ago appears with the next save.
   */
  const entries = $derived(outlineOf(numberTargets(project.targetSheets, headingNumbering.current)))
  const skipped = $derived(skippedLevels(entries))
</script>

<section class="pane" aria-label={i18n.t('outline.title')}>
  <header>
    <h2>{i18n.t('outline.title')}</h2>
    <IconButton icon="x" label={i18n.t('cmd.outline')} onclick={() => setOutlineVisible(false)} />
  </header>
  <p class="summary">
    {i18n.t('outline.summary', { count: entries.length })}
    {#if skipped > 0}
      · <span class="warn">{i18n.t('outline.skippedCount', { count: skipped })}</span>
    {/if}
  </p>
  <div class="body">
    {#if entries.length === 0}
      <EmptyState icon="list-tree" title={i18n.t('outline.empty')} />
    {:else}
      <OutlineList
        {entries}
        sheetLabel={(path) => project.sheetLabel(path)}
        current={editor.path}
        onpick={(entry) => void project.openSheet(entry.path, entry.at)}
      />
    {/if}
  </div>
</section>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
  }
  header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    height: var(--bar-height);
    padding: 0 var(--sp-8) 0 var(--sp-16);
  }
  h2 {
    margin: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
  }
  .summary {
    flex: none;
    margin: 0 0 var(--sp-8);
    padding: 0 var(--sp-16);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .warn {
    color: var(--color-warning);
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: 0 var(--sp-8) var(--sp-16);
    overflow-y: auto;
  }
</style>
