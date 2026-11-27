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
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import { project } from '../sidebar/project.svelte'

  /**
   * What belongs to the open project and is kept in its file, not with the app: the literature
   * files the citations come from (which ones, what each holds, whether it is still there; add
   * one, take one out, point to it again where it moved to) and the quotation marks.
   */
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
</style>
