<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { openContextMenu } from '../../lib/menu.svelte'
  import type { MenuItem } from '../../lib/menu.svelte'
  import Icon from '../../ui/Icon.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import { exporting } from './export.svelte'
  import { TEMPLATES_ICON } from './groupIcons'

  const lang = $derived(i18n.locale)

  type Entry = (typeof exporting.list)[number]
  /** The template that is chosen: what the buttons under the pictures are about. */
  const current = $derived(exporting.list.find((t) => t.id === exporting.selectedId))
  const own = $derived(current !== undefined && !current.builtin && !exporting.busy)

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

<!-- The templates as a panel of the dialog: a picture of each, the chosen one marked, and under
     them what can be done with the chosen one, as buttons (a right click on a picture offers the
     same). -->
<section class="templates" aria-label={i18n.t('templates.title')}>
  <header class="head">
    <Icon name={TEMPLATES_ICON} size={16} />
    <h3 class="title">{i18n.t('templates.title')}</h3>
  </header>
  <!-- The empty part of the list has a menu of its own: a template from a file. -->
  <div
    class="grid"
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

  {#if current}
    <Section title={current.name[lang]} level={4}>
      <p class="about">
        {current.builtin ? i18n.t('templates.about.builtin') : i18n.t('templates.about.own')}
      </p>
      <div class="actions">
        <Button size="sm" disabled={exporting.busy} onclick={() => void exporting.duplicate()}>
          {i18n.t('templates.duplicate')}
        </Button>
        {#if !current.builtin}
          <Button size="sm" icon="pencil" disabled={!own} onclick={() => void exporting.rename()}>
            {i18n.t('templates.rename')}
          </Button>
          <Button size="sm" disabled={!own} onclick={() => void exporting.exportFile()}>
            {i18n.t('templates.file.save')}
          </Button>
          <Button size="sm" icon="trash" disabled={!own} onclick={() => void exporting.remove()}>
            {i18n.t('templates.remove')}
          </Button>
        {/if}
      </div>
    </Section>
  {/if}
  <Section title={i18n.t('templates.more')} level={4}>
    <div class="actions">
      <Button size="sm" disabled={exporting.busy} onclick={() => void exporting.importFile()}>
        {i18n.t('templates.file.load')}
      </Button>
    </div>
  </Section>
</section>

<style>
  .templates {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-right: var(--sp-24);
  }
  /* The head of every panel of the dialog: its name stays in sight, a hairline below it. */
  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    padding-bottom: var(--sp-12);
    border-bottom: 1px solid var(--color-separator);
    background: var(--color-window);
    color: var(--color-label-secondary);
  }
  .title {
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
  }
  /* Three pictures in a line, so the templates are seen together. */
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-8);
    padding: var(--sp-16) 0;
  }
  /* A template is a small picture of its first page and its name under it; the chosen one lies on
   * the selection's ground. */
  .card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-8);
    min-width: 0;
    padding: var(--sp-8);
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
  .about {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-8);
  }
</style>
