<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { openContextMenu } from '../../lib/menu.svelte'
  import type { MenuItem } from '../../lib/menu.svelte'
  import Icon from '../../ui/Icon.svelte'
  import { exporting } from './export.svelte'
  import { scrollbar } from '../../ui/scrollbar'

  const lang = $derived(i18n.locale)

  type Entry = (typeof exporting.list)[number]

  /** Makes a template the chosen one, unless it is: what a menu does is done to the chosen one. */
  const chosen = (t: Entry): Promise<void> =>
    t.id === exporting.selectedId ? Promise.resolve() : exporting.select(t.id)

  /** Loading a template from a file: the menu of the list, and the last item of a template's menu. */
  const loadItem = (): MenuItem => ({
    label: i18n.t('templates.file.load'),
    disabled: exporting.busy,
    onselect: () => void exporting.importFile(),
  })

  /**
   * The menu of a template, on a right click: a copy of any template; renaming, saving as a file and
   * deleting only a template of the writer's own (a bundled one is in every copy of the app). The
   * template is chosen first, as a row of the sidebar is.
   */
  function menuOf(t: Entry): MenuItem[] {
    const ready = chosen(t)
    const then = (action: () => Promise<void>) => () => void ready.then(action)
    const own = !t.builtin && !exporting.busy
    return [
      {
        label: i18n.t('templates.duplicate'),
        disabled: exporting.busy,
        onselect: then(() => exporting.duplicate()),
      },
      {
        label: i18n.t('templates.rename'),
        disabled: !own,
        onselect: then(() => exporting.rename()),
      },
      {
        label: i18n.t('templates.file.save'),
        disabled: !own,
        onselect: then(() => exporting.exportFile()),
      },
      { separator: true },
      loadItem(),
      { separator: true },
      {
        label: i18n.t('templates.remove'),
        disabled: !own,
        danger: true,
        onselect: then(() => exporting.remove()),
      },
    ]
  }

  /** F2 renames a template of the writer's own and Delete deletes it, as in the sidebar. */
  function onKey(event: KeyboardEvent, t: Entry): void {
    if (t.builtin || exporting.busy) return
    if (event.key === 'F2') void chosen(t).then(() => exporting.rename())
    else if (event.key === 'Delete' || event.key === 'Backspace')
      void chosen(t).then(() => exporting.remove())
    else return
    event.preventDefault()
  }
</script>

<div class="templates">
  <h3>{i18n.t('templates.title')}</h3>
  <!-- The empty part of the list has a menu of its own: a template from a file. -->
  <div
    class="grid"
    use:scrollbar
    role="group"
    aria-label={i18n.t('templates.list')}
    oncontextmenu={(e) => e.target === e.currentTarget && openContextMenu(e, [loadItem()])}
  >
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
        oncontextmenu={(e) => openContextMenu(e, menuOf(t))}
        onkeydown={(e) => onKey(e, t)}
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
</style>
