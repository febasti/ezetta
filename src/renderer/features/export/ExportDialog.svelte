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
  import PropertiesPanel from '../templates/PropertiesPanel.svelte'
  import ExportPanel from './ExportPanel.svelte'
  import PreviewPane from './PreviewPane.svelte'
  import { EXPORT, OPTIONS, exporting } from './export.svelte'
  import { EXPORT_ICON, GROUP_ICONS, OPTIONS_ICON } from './groupIcons'
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
          EXPORT_ICON,
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
          OPTIONS_ICON,
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

      <PreviewPane />
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
  /* The properties take a third of a wide window, so their names fit on one line; the pages keep the rest. */
  .properties {
    flex: none;
    width: clamp(404px, 34vw, 484px);
    min-height: 0;
    overflow-y: auto;
    padding-right: var(--sp-8);
  }
</style>
