<script lang="ts">
  import { TITELEI_SLOTS } from '@core/project/paths'
  import { i18n } from '../../i18n/i18n.svelte'
  import { openDropdown } from '../../lib/menu.svelte'
  import { ui } from '../../lib/ui.svelte'
  import Icon from '../../ui/Icon.svelte'
  import { groupMenuItems } from './groupMenu'
  import { project } from './project.svelte'
  import SheetRow from './SheetRow.svelte'
  import { scrollbar } from '../../ui/scrollbar'

  const titelei = $derived(project.titelei)
  const names = $derived(
    (titelei?.authors ?? [])
      .map((author) => author.name)
      .filter((name) => name !== '')
      .join(', '),
  )
  const detailsOpen = $derived(project.mode === 'titelei')
</script>

<section class="column" aria-label={i18n.t('titelei.title')}>
  <header>
    {#if ui.groupsVisible}
      <h2>{i18n.t('titelei.title')}</h2>
    {:else}
      <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the column’s title, which opens the menu of groups -->
      <button
        class="switcher"
        aria-haspopup="menu"
        aria-label={i18n.t('sidebar.switchGroup')}
        onclick={(e) => openDropdown(e.currentTarget, groupMenuItems())}
      >
        <span class="switcher-name">{i18n.t('titelei.title')}</span>
        <Icon name="chevron-down" size={14} />
      </button>
    {/if}
  </header>
  <div class="rows" use:scrollbar>
    <!-- The title page fields: a card like a sheet's, with the title and the authors for its text. -->
    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a card of the sidebar that opens the form of the title page fields -->
    <button
      class="card"
      class:selected={detailsOpen}
      aria-pressed={detailsOpen}
      onclick={() => void project.showTitelei()}
    >
      <span class="label">{i18n.t('titelei.details')}</span>
      <span class="title">{project.snapshot?.title}</span>
      <span class="authors" class:empty={names === ''}>{names || i18n.t('titelei.noAuthors')}</span>
    </button>
    <h3 class="heading">{i18n.t('titelei.texts')}</h3>
    {#each TITELEI_SLOTS as slot (slot)}
      {@const sheet = titelei?.slots[slot] ?? null}
      {#if sheet}
        <SheetRow node={sheet} />
      {:else}
        <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- an empty slot of the Titelei: a dashed row that makes its sheet -->
        <button
          class="slot"
          aria-label={i18n.t('titelei.addText', { name: i18n.t(`titelei.slot.${slot}`) })}
          onclick={() => void project.createSlot(slot)}
        >
          <span>{i18n.t(`titelei.slot.${slot}`)}</span>
          <Icon name="plus" size={14} />
        </button>
      {/if}
    {/each}
  </div>
</section>

<style>
  .column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
  }
  header {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    height: var(--bar-height);
    padding: 0 var(--sp-8) 0 var(--sp-16);
  }
  h2,
  .switcher {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* With the groups column hidden, the title switches the group. */
  .switcher {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--control-md);
    margin-left: calc(-1 * var(--sp-8));
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    cursor: default;
    transition: background var(--duration);
  }
  .switcher-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .switcher:hover {
    background: var(--color-control);
  }
  .switcher:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-8) var(--sp-8) var(--sp-16);
  }
  /* Like a sheet's card (SheetRow): a small card on the sidebar's ground. */
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    width: 100%;
    margin-bottom: var(--sp-8);
    padding: var(--sp-8) var(--sp-12);
    border: 1px solid var(--color-separator);
    border-radius: var(--r-md);
    background: var(--color-window);
    color: var(--color-label);
    font: var(--type-body);
    text-align: left;
    cursor: default;
  }
  .card.selected {
    border-color: var(--color-label-secondary);
    box-shadow: inset 0 0 0 1px var(--color-label-secondary);
  }
  .card:focus-visible,
  .slot:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .card.selected:focus-visible {
    box-shadow:
      inset 0 0 0 1px var(--color-label-secondary),
      0 0 0 3px var(--color-focus);
  }
  .label {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .title {
    font: var(--type-emphasis);
    overflow-wrap: anywhere;
  }
  .authors {
    color: var(--color-label-secondary);
    font: var(--type-caption);
    overflow-wrap: anywhere;
  }
  .authors.empty {
    color: var(--color-label-tertiary);
  }
  .heading {
    margin: var(--sp-12) 0 var(--sp-4);
    padding: 0 var(--sp-4);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  /* A slot without a sheet yet: a dashed row, the way a scrapsheet is drawn dashed. */
  .slot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: var(--sp-8);
    padding: var(--sp-4) var(--sp-12);
    min-height: var(--control-md);
    border: 1px dashed var(--color-field-border);
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label-tertiary);
    font: var(--type-body);
    cursor: default;
  }
  .slot:hover {
    color: var(--color-label-secondary);
  }
</style>
