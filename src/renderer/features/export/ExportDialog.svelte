<script lang="ts">
  import { ELEMENTS, GROUPS, isListed } from '@core/export/elements'
  import { tick } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import type { IconName } from '../../ui/Icon.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Dialog from '../../ui/kit/Dialog.svelte'
  import Link from '../../ui/kit/Link.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import { preview } from './preview.svelte'
  import { project } from '../sidebar/project.svelte'
  import PropertiesPanel from '../templates/PropertiesPanel.svelte'
  import ExportPanel from './ExportPanel.svelte'
  import { EXPORT, OPTIONS, exporting } from './export.svelte'
  import TemplateList from './TemplateList.svelte'
  import { scrollbar } from '../../ui/scrollbar'

  const lang = $derived(i18n.locale)
  const detail = $derived(exporting.detail)
  const panel = $derived(exporting.elementId)

  /** The group that is open in the list: one at a time, or none. The group of the chosen element opens. */
  let expanded = $state<string | null>(null)
  $effect(() => {
    const group = ELEMENTS.find((e) => e.id === exporting.elementId)?.group
    if (group) expanded = group
  })
  /** A symbol for each group, which is also the symbol of its only entry. */
  const GROUP_ICONS: Record<string, IconName> = {
    page: 'layout',
    title: 'file',
    text: 'typography',
    headings: 'heading',
    lists: 'list',
    quotes: 'quote',
    references: 'link',
    indexes: 'book',
    tables: 'table',
    figures: 'image',
    equations: 'formula',
    code: 'code',
  }

  // The pages follow the profile: another template, an option, the citation style.
  $effect(() => {
    if (!exporting.open) return
    void JSON.stringify(exporting.profile)
    exporting.refreshPreview()
  })

  /** A row of the list works as a button: a click, Return, or the space bar. */
  const press =
    (action: () => void) =>
    (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      action()
    }

  /** The summary in the footer leads to the list of what is open, in the panel of the export. */
  async function showOpen(): Promise<void> {
    exporting.elementId = EXPORT
    await tick()
    document
      .querySelector(`.properties section[aria-label="${i18n.t('export.warnings')}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const src = (n: number): string =>
    `project-asset://project/_build/preview/p-${n}.png?v=${preview.stamp}`
</script>

{#snippet row(
  icon: IconName | undefined,
  label: string,
  selected: boolean,
  extra: string | number | null,
  onclick: () => void,
)}
  <ListRow
    {icon}
    title={label}
    {selected}
    role="button"
    tabindex={0}
    aria-selected={undefined}
    aria-current={selected ? 'true' : undefined}
    {onclick}
    onkeydown={press(onclick)}
  >
    {#snippet accessory()}
      {#if extra !== null}
        <span class="count" title={i18n.t('export.open', { count: Number(extra) })}>{extra}</span>
      {/if}
    {/snippet}
  </ListRow>
{/snippet}

{#if exporting.open && exporting.info && exporting.profile && detail}
  <Dialog
    title={i18n.t('export.title')}
    closeLabel={i18n.t('export.close')}
    width="workspace"
    height="workspace"
    position="center"
    onclose={() => void exporting.close()}
  >
    {#snippet footer()}
      <!-- What the writer needs to know before pressing the button, in view on every panel. -->
      <div class="status">
        {#if exporting.info?.warnings}
          {#if exporting.openCount > 0}
            <span class="mark open"><Icon name="warning" size={16} /></span>
            <Link onclick={() => void showOpen()}>
              {i18n.t('export.open', { count: exporting.openCount })}
            </Link>
          {:else}
            <span class="mark"><Icon name="circle-check" size={16} /></span>
            <span>{i18n.t('export.none')}</span>
          {/if}
        {/if}
        {#if preview.busy}
          <span class="quiet">· {i18n.t('preview.loading')}</span>
        {:else if preview.status === 'ready'}
          <span class="quiet">· {i18n.t('export.pages', { count: preview.pages })}</span>
        {/if}
      </div>
      <Button
        variant="primary"
        size="lg"
        disabled={exporting.busy || !exporting.info?.compiler}
        onclick={() => void exporting.run()}
      >
        {exporting.busy ? i18n.t('export.running') : i18n.t('export.run')}
      </Button>
    {/snippet}

    <div class="columns">
      <aside class="templates" aria-label={i18n.t('templates.title')}>
        <TemplateList />
      </aside>

      <nav class="elements" use:scrollbar aria-label={i18n.t('templates.elements')}>
        <h3>{i18n.t('export.group')}</h3>
        {@render row(
          'file-export',
          i18n.t('export.panel'),
          panel === EXPORT,
          exporting.openCount > 0 ? exporting.openCount : null,
          () => (exporting.elementId = EXPORT),
        )}
        <h3>{i18n.t('templates.elements')}</h3>
        {#each GROUPS as group (group.id)}
          {@const entries = ELEMENTS.filter((e) => e.group === group.id && isListed(e.id))}
          {@const open = expanded === group.id}
          {@const icon = GROUP_ICONS[group.id] ?? 'file'}
          {#if entries.length === 1}
            {@const e = entries[0]!}
            {@render row(icon, e[lang], e.id === panel, null, () => (exporting.elementId = e.id))}
          {:else}
            {@const toggle = () => (expanded = open ? null : group.id)}
            <ListRow
              {icon}
              title={group[lang]}
              role="button"
              tabindex={0}
              aria-selected={undefined}
              aria-expanded={open}
              onclick={toggle}
              onkeydown={press(toggle)}
            >
              {#snippet accessory()}
                <span class="chevron"
                  ><Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} /></span
                >
              {/snippet}
            </ListRow>
            {#if open}
              <div class="entries" role="group" aria-label={group[lang]}>
                {#each entries as e (e.id)}
                  {@render row(
                    undefined,
                    e[lang],
                    e.id === panel,
                    null,
                    () => (exporting.elementId = e.id),
                  )}
                {/each}
              </div>
            {/if}
          {/if}
        {/each}
        <h3>{i18n.t('templates.options.group')}</h3>
        {@render row(
          'adjustments',
          i18n.t('templates.options'),
          panel === OPTIONS,
          null,
          () => (exporting.elementId = OPTIONS),
        )}
      </nav>

      <div class="properties" use:scrollbar>
        {#if panel === EXPORT}
          <ExportPanel />
        {:else}
          <PropertiesPanel />
        {/if}
      </div>

      <section class="pages" use:scrollbar aria-label={i18n.t('preview.title')}>
        {#if preview.status === 'error'}
          <p class="empty problem" role="alert">
            {preview.noCompiler ? i18n.t('preview.noCompiler') : i18n.t('preview.failed')}
          </p>
        {:else if preview.status === 'ready'}
          <div class="sheets" class:dim={preview.busy}>
            {#each Array.from({ length: preview.pages }, (_, i) => i + 1) as n (n)}
              <img
                class="page"
                src={src(n)}
                alt={i18n.t('preview.pageLabel', { page: n })}
                loading="lazy"
                decoding="async"
              />
            {/each}
          </div>
        {:else}
          <p class="empty">{project.snapshot ? i18n.t('preview.loading') : ''}</p>
        {/if}
      </section>
    </div>
  </Dialog>
{/if}

<style>
  /* Four columns: the templates, the elements, the properties of the one chosen, and the pages. */
  .columns {
    display: flex;
    gap: var(--sp-16);
    height: 100%;
    min-height: 0;
  }
  .templates {
    flex: none;
    width: 144px;
    min-height: 0;
  }
  .elements {
    flex: none;
    width: 208px;
    min-height: 0;
    overflow-y: auto;
    padding-right: var(--sp-8);
  }
  h3 {
    margin: var(--sp-16) 0 var(--sp-4);
    padding: 0 var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  h3:first-child {
    margin-top: 0;
  }
  .status {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
    color: var(--color-label);
    font: var(--type-body);
  }
  .mark {
    display: inline-flex;
    color: var(--color-success);
  }
  .mark.open {
    color: var(--color-warning);
  }
  .quiet {
    color: var(--color-label-secondary);
  }
  .chevron {
    display: inline-flex;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  /* What is still open in the export: a number the eye is drawn to, not one among the others. */
  .count {
    display: inline-flex;
    color: var(--color-warning);
    font: var(--type-emphasis);
  }
  /* The entries of the open group lie on the panel's ground, so they are seen to belong to it. */
  .entries {
    margin: var(--sp-4) 0 var(--sp-8);
    padding: var(--sp-4);
    border-radius: var(--r-md);
    background: var(--color-panel);
  }
  .properties {
    flex: none;
    width: 380px;
    min-height: 0;
    overflow-y: auto;
    padding-right: var(--sp-8);
  }
  /* The pages lie on the panel's ground, as on a desk. A clear border as deep as the rounded corner
     keeps the ends of the scrollbars out of the corners (macOS draws them to the very edge); the
     panel's ground runs under it, and the pages' padding is less by as much. */
  .pages {
    flex: 1;
    min-width: 0;
    overflow: auto;
    border: var(--r-lg) solid transparent;
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  .sheets {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-24);
    padding: calc(var(--sp-24) - var(--r-lg));
  }
  .sheets.dim {
    opacity: 0.6;
  }
  .page {
    display: block;
    width: 100%;
    max-width: 794px;
    height: auto;
    min-height: 120px;
    background: var(--color-paper);
    box-shadow: var(--shadow-paper);
  }
  .empty {
    margin: var(--sp-24);
    color: var(--color-label-tertiary);
    font: var(--type-body);
  }
  .problem {
    color: var(--color-danger);
  }
</style>
