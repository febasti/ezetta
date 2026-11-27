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
  import { EXPORT, OPTIONS, TEMPLATES, exporting } from './export.svelte'
  import { EXPORT_ICON, GROUP_ICONS, OPTIONS_ICON } from './groupIcons'
  import TemplateList from './TemplateList.svelte'
  import { scrollbar } from '../../ui/scrollbar'

  const lang = $derived(i18n.locale)
  const detail = $derived(exporting.detail)
  const panel = $derived(exporting.elementId)
  /** The template the dialog is about: the export's, and the one whose elements are listed. */
  const template = $derived(exporting.list.find((t) => t.id === exporting.selectedId))

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
      <!-- One list leads to everything: the template at its top, the document's settings, then the
           elements of the template in groups. -->
      <nav class="sidebar" use:scrollbar aria-label={i18n.t('templates.elements')}>
        {#if template}
          {@const chosen = panel === TEMPLATES}
          {@const show = () => (exporting.elementId = TEMPLATES)}
          <ListRow
            title={template.name[lang]}
            subtitle={i18n.t('templates.current')}
            selected={chosen}
            role="button"
            tabindex={0}
            aria-selected={undefined}
            aria-current={chosen ? 'true' : undefined}
            aria-label={i18n.t('templates.choose', { name: template.name[lang] })}
            onclick={show}
            onkeydown={press(show)}
          >
            {#snippet leading()}
              <span class="taster" class:waiting={!exporting.thumbnails[template.id]}>
                {#if exporting.thumbnails[template.id]}
                  <img src={exporting.thumbnails[template.id]} alt="" draggable="false" />
                {/if}
              </span>
            {/snippet}
            {#snippet accessory()}
              <span class="chevron">
                {#if template.builtin}<Icon name="lock" size={12} />{/if}
                <Icon name="chevron-right" size={14} />
              </span>
            {/snippet}
          </ListRow>
        {/if}
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
                  ><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></span
                >
              {/snippet}
            </ListRow>
            {#if open}
              <div class="entries" role="group" aria-label={group[lang]}>
                {#each entries as e (e.id)}
                  <ListRow
                    title={e[lang]}
                    depth={1}
                    selected={e.id === panel}
                    role="button"
                    tabindex={0}
                    aria-selected={undefined}
                    aria-current={e.id === panel ? 'true' : undefined}
                    onclick={() => (exporting.elementId = e.id)}
                    onkeydown={press(() => (exporting.elementId = e.id))}
                  />
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
        {#if panel === TEMPLATES}
          <TemplateList />
        {:else if panel === EXPORT}
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
  /* Three parts: the list of what can be set, the values of the one chosen, and the pages, which
     have the most room. */
  .columns {
    display: flex;
    gap: var(--sp-24);
    height: 100%;
    min-height: 0;
  }
  /* The list lies on the sidebar's ground, as the list of a window does. */
  .sidebar {
    flex: none;
    width: 224px;
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-8);
    border-radius: var(--r-lg);
    background: var(--color-sidebar);
  }
  h3 {
    margin: var(--sp-16) 0 var(--sp-4);
    padding: 0 var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  /* The template at the top of the list: a small picture of it before its name. */
  .taster {
    display: block;
    width: var(--control-lg);
    overflow: hidden;
    border-radius: 2px;
    background: var(--color-paper);
    box-shadow: var(--shadow-paper);
  }
  .taster.waiting {
    aspect-ratio: 90 / 63;
  }
  .taster img {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
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
    align-items: center;
    gap: var(--sp-4);
    color: var(--color-label-tertiary);
  }
  /* What is still open in the export: a number the eye is drawn to, not one among the others. */
  .count {
    display: inline-flex;
    color: var(--color-warning);
    font: var(--type-emphasis);
  }
  /* The values take as much as their names and fields need; the pages keep the rest. */
  .properties {
    flex: none;
    width: clamp(416px, 32vw, 480px);
    min-height: 0;
    overflow-y: auto;
  }
</style>
