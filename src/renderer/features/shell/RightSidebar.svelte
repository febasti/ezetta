<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { fittedWidths, setRightTab, setWidth, ui } from '../../lib/ui.svelte'
  import ColumnResizer from '../../ui/ColumnResizer.svelte'
  import Tabs from '../../ui/kit/Tabs.svelte'
  import { editor } from '../editor/editorSession.svelte'
  import LiteraturePanel from '../literature/LiteraturePanel.svelte'
  import ProofPanel from '../proof/ProofPanel.svelte'
  import StatsPanel from '../stats/StatsPanel.svelte'

  /** The width it has now: the window may have no room for the width chosen. */
  const width = $derived(fittedWidths().right ?? ui.rightSidebarWidth)
  const TABS = ['literature', 'proof', 'stats'] as const
</script>

<ColumnResizer side="right" {width} onresize={(w) => setWidth('right', w)} />
<aside class="right" style:width="{width}px" aria-label={i18n.t('right.label')}>
  <Tabs
    label={i18n.t('right.label')}
    tabs={TABS.map((tab) => ({
      id: tab,
      label: i18n.t(`right.tab.${tab}`),
      count: tab === 'proof' ? editor.issues.length : null,
    }))}
    value={ui.rightTab}
    onchange={setRightTab}
    idPrefix="right-tab"
    panelId="right-panel"
  />
  <div class="panel" id="right-panel">
    {#if ui.rightTab === 'literature'}
      <LiteraturePanel />
    {:else if ui.rightTab === 'stats'}
      <StatsPanel />
    {:else}
      <ProofPanel />
    {/if}
  </div>
</aside>

<style>
  .right {
    display: flex;
    flex-direction: column;
    flex: none;
    min-width: 0;
    height: 100%;
    background: var(--color-window);
    border-left: 1px solid var(--color-separator);
  }
  .panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
</style>
