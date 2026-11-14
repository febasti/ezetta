<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import { exporting } from './export.svelte'

  const lang = $derived(i18n.locale)
  const readOnly = $derived(exporting.detail?.builtin ?? true)
</script>

<div class="templates">
  <h3>{i18n.t('templates.title')}</h3>
  <div class="grid" role="group" aria-label={i18n.t('templates.list')}>
    {#each exporting.list as t (t.id)}
      {@const selected = t.id === exporting.selectedId}
      <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a template is a taster of its page, a control of its own -->
      <button
        type="button"
        class="card"
        class:selected
        aria-current={selected ? 'true' : undefined}
        title={t.builtin ? `${t.name[lang]} · ${i18n.t('templates.builtin')}` : t.name[lang]}
        disabled={exporting.busy}
        onclick={() => void exporting.select(t.id)}
      >
        <span class="page" class:waiting={!exporting.thumbnails[t.id]}>
          {#if exporting.thumbnails[t.id]}
            <img src={exporting.thumbnails[t.id]} alt="" draggable="false" />
          {/if}
        </span>
        <span class="name">
          <span class="text">{t.name[lang]}</span>
          {#if t.builtin}<span class="lock" aria-hidden="true"><Icon name="lock" size={12} /></span
            >{/if}
        </span>
      </button>
    {/each}
  </div>

  <div class="actions">
    <IconButton
      size="sm"
      icon="copy"
      label={i18n.t('templates.duplicate')}
      disabled={exporting.busy}
      onclick={() => void exporting.duplicate()}
    />
    <IconButton
      size="sm"
      icon="pencil"
      label={i18n.t('templates.rename')}
      disabled={readOnly || exporting.busy}
      onclick={() => void exporting.rename()}
    />
    <IconButton
      size="sm"
      icon="trash"
      label={i18n.t('templates.remove')}
      disabled={readOnly || exporting.busy}
      onclick={() => void exporting.remove()}
    />
    <IconButton
      size="sm"
      icon="file-import"
      label={i18n.t('templates.file.load')}
      disabled={exporting.busy}
      onclick={() => void exporting.importFile()}
    />
    <IconButton
      size="sm"
      icon="file-export"
      label={i18n.t('templates.file.save')}
      disabled={readOnly || exporting.busy}
      onclick={() => void exporting.exportFile()}
    />
  </div>
</div>

<style>
  .templates {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  h3 {
    margin: 0 0 var(--sp-4);
    padding: 0 var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .grid {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: max-content;
    gap: var(--sp-8);
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-4);
  }
  /* A template is a small picture of its first page and its name under it; the chosen one lies on
   * the selection's ground. */
  .card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-4);
    min-width: 0;
    padding: var(--sp-4);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label);
    font: var(--type-caption);
    cursor: default;
  }
  .card.selected {
    background: var(--color-selection);
  }
  .card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  /* A taster of the template: a small page cut from its text, its name as the heading
   * (`core/export/miniature.ts`); until it is drawn, a blank one of the same shape. */
  .page {
    display: block;
    overflow: hidden;
    border-radius: var(--r-sm);
    background: var(--color-paper);
    box-shadow: var(--shadow-paper);
  }
  .page.waiting {
    aspect-ratio: 90 / 63;
  }
  .page img {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
  }
  .name {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    min-width: 0;
  }
  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lock {
    display: inline-flex;
    flex: none;
    color: var(--color-label-tertiary);
  }
  .actions {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
    padding-top: var(--sp-8);
    border-top: 1px solid var(--color-separator);
  }
</style>
