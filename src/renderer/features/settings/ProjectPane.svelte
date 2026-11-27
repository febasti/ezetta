<script lang="ts">
  import { QUOTE_STYLES } from '@core/typst/quoteStyle'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import Link from '../../ui/kit/Link.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import Switch from '../../ui/kit/Switch.svelte'
  import { backup } from '../history/backup.svelte'
  import { history } from '../history/history.svelte'
  import { project } from '../sidebar/project.svelte'
  import { settings } from './settings.svelte'

  /**
   * What belongs to the open project and is kept in its file, not with the app: the literature
   * files the citations come from (which ones, what each holds, whether it is still there; add
   * one, take one out, point to it again where it moved to), whether versions are kept and where
   * the project is backed up to (set here, and looked at in their own dialog, which the links lead
   * to), and the quotation marks. The backup folder is this project's on this computer: it is kept
   * with the app, by the project's folder, since another computer has other folders.
   */
  const status = $derived(backup.status)
  // The page may be the first place that asks for the backup's state.
  $effect(() => {
    if (project.snapshot) void backup.refresh()
  })
  const when = (time: number): string =>
    new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(time)
  /** Leaves the settings for the dialog of the versions, on one of its two tabs. */
  function look(tab: 'versions' | 'backup'): void {
    settings.close()
    void history.show(tab)
  }
  const files = $derived(project.snapshot?.bibliographyFiles ?? [])
  /** The name of a file, and the folder it is in ("" for the project's own folder). */
  const nameOf = (path: string): string => path.split(/[\\/]/).pop() ?? path
  const folderOf = (path: string): string =>
    path.slice(0, -nameOf(path).length).replace(/[\\/]$/, '')
  /** Inside the project a file's folder is said from the project; outside, in full. */
  const inProject = (path: string): boolean => !/^([\\/]|[A-Za-z]:)/.test(path)
  const whereOf = (path: string): string =>
    inProject(path)
      ? folderOf(path) === ''
        ? i18n.t('settings.bib.inProject')
        : i18n.t('settings.bib.inProjectFolder', { folder: folderOf(path) })
      : folderOf(path)
</script>

{#if !project.snapshot}
  <EmptyState icon="folder" title={i18n.t('settings.noProject')} />
{:else}
  <p class="hint">{i18n.t('settings.project.hint')}</p>
  <Section title={i18n.t('settings.bib.title')} level={4}>
    <p class="hint">{i18n.t('settings.bib.hint')}</p>
    {#if files.length === 0}
      <p class="none">{i18n.t('settings.bib.none')}</p>
    {:else}
      <ul class="files" aria-label={i18n.t('settings.bib.title')}>
        {#each files as file (file.path)}
          <li>
            <ListRow
              role="group"
              aria-selected={undefined}
              aria-label={nameOf(file.path)}
              tabindex={-1}
              title={nameOf(file.path)}
              subtitle={file.missing ? i18n.t('settings.bib.missing') : whereOf(file.path)}
              muted={file.missing}
            >
              {#snippet leading()}
                {#if file.missing}
                  <span class="warn"><Icon name="warning" size={16} /></span>
                {:else}
                  <Icon name="book" size={16} />
                {/if}
              {/snippet}
              {#snippet accessory()}
                <span class="tools" title={file.path}>
                  {#if file.missing}
                    <Button size="sm" onclick={() => void project.relinkBibliography(file.path)}>
                      {i18n.t('settings.bib.relink')}
                    </Button>
                  {:else}
                    <span
                      class="count"
                      title={file.shadowed > 0 ? i18n.t('settings.bib.shadowedHint') : undefined}
                    >
                      {i18n.t('settings.bib.works', { count: file.works })}{#if file.shadowed > 0}
                        · {i18n.t('settings.bib.shadowed', { count: file.shadowed })}{/if}
                    </span>
                    <IconButton
                      icon="folder"
                      size="sm"
                      label={i18n.t('settings.bib.reveal', { name: nameOf(file.path) })}
                      onclick={() => void project.revealBibliography(file.path)}
                    />
                  {/if}
                  <IconButton
                    icon="x"
                    size="sm"
                    label={i18n.t('settings.bib.remove', { name: nameOf(file.path) })}
                    onclick={() => void project.removeBibliography(file.path)}
                  />
                </span>
              {/snippet}
            </ListRow>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      <Button icon="plus" onclick={() => void project.addBibliography()}>
        {i18n.t('settings.bib.add')}
      </Button>
    </div>
  </Section>

  <Section title={i18n.t('settings.versions.title')} level={4}>
    <Form>
      <FormRow label="">
        <Switch checked={history.enabled} onchange={(on) => void history.setEnabled(on)}>
          {i18n.t('history.auto')}
        </Switch>
        <span class="more">
          <Link onclick={() => look('versions')}>{i18n.t('settings.versions.look')}</Link>
        </span>
      </FormRow>
      <FormRow label={i18n.t('settings.backup.folder')}>
        <div class="folder">
          {#if status?.configured}
            <span class="path selectable" class:problem={!status.reachable} title={status.folder}
              >{status.folder}</span
            >
          {:else}
            <span class="path none-yet">{i18n.t('settings.backup.none')}</span>
          {/if}
          <Button size="sm" disabled={backup.busy} onclick={() => void backup.chooseFolder()}>
            {status?.configured ? i18n.t('backup.change') : i18n.t('settings.backup.choose')}
          </Button>
          {#if status?.configured}
            <Button size="sm" variant="plain" onclick={() => void backup.disable()}>
              {i18n.t('backup.off')}
            </Button>
          {/if}
        </div>
        {#if status?.configured}
          <p class="state" class:problem={!status.reachable || !!status.error}>
            {#if !status.reachable}
              {i18n.t('statusbar.backup.problem')}
            {:else if status.running}
              {i18n.t('backup.running')}
            {:else if status.lastAt !== null}
              {i18n.t('settings.backup.last', { when: when(status.lastAt) })}
            {:else}
              {i18n.t('settings.backup.never')}
            {/if}
          </p>
        {/if}
        <span class="more">
          <Link onclick={() => look('backup')}>{i18n.t('settings.backup.look')}</Link>
        </span>
      </FormRow>
    </Form>
  </Section>

  <Section title={i18n.t('settings.quotes.title')} level={4} region={false}>
    <Form>
      <FormRow label={i18n.t('settings.quoteStyle')} for="settings-quote-style">
        <Select
          id="settings-quote-style"
          value={project.snapshot.quoteStyle}
          options={QUOTE_STYLES.map((style) => ({
            value: style,
            label: i18n.t(`quoteStyle.${style}`),
          }))}
          onchange={(style) => void project.setQuoteStyle(style)}
        />
      </FormRow>
      <FormRow label="">
        <Checkbox
          checked={project.snapshot.quoteBlockMarks}
          onchange={(checked) => void project.setQuoteBlockMarks(checked)}
        >
          {i18n.t('project.quoteBlockMarks')}
        </Checkbox>
      </FormRow>
    </Form>
  </Section>
{/if}

<style>
  .hint,
  .none {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .hint + :global(.section) {
    padding-top: var(--sp-16);
  }
  .none {
    color: var(--color-label-tertiary);
    font: var(--type-body);
  }
  /* The files as a list under hairlines: each a row with what it holds and what can be done. */
  .files {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .files li + li {
    border-top: 1px solid var(--color-separator);
  }
  .files :global(.row) {
    padding-right: 0;
    padding-left: 0;
  }
  .tools {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
  }
  .count {
    margin-right: var(--sp-8);
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .warn {
    display: inline-flex;
    color: var(--color-warning);
  }
  .actions {
    display: flex;
  }
  /* The way to the dialog where versions and backups are looked at, under what is set here. */
  .more {
    font: var(--type-body);
  }
  /* The backup folder: its path, which may be long, and the buttons after it. */
  .folder {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    min-height: var(--control-md);
    min-width: 0;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-label);
    font: var(--type-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path.none-yet {
    color: var(--color-label-tertiary);
  }
  .path.problem,
  .state.problem {
    color: var(--color-danger);
  }
  .state {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
</style>
