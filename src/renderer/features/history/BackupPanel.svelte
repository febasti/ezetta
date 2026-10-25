<script lang="ts">
  import Button from '../../ui/kit/Button.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import { formatNumber } from '../../lib/format'
  import { backup } from './backup.svelte'
  import { history } from './history.svelte'

  const status = $derived(backup.status)

  const when = (time: number): string =>
    new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(time)
  const size = (bytes: number): string =>
    bytes < 1024 * 1024
      ? `${formatNumber(Math.max(1, Math.round(bytes / 1024)), i18n.locale)} KB`
      : `${formatNumber(Math.round(bytes / (1024 * 1024)), i18n.locale)} MB`
</script>

<div class="backup">
  {#if !status?.configured}
    <EmptyState icon="archive" title={i18n.t('backup.none')} text={i18n.t('backup.intro')}>
      {#snippet action()}
        <Button variant="primary" disabled={backup.busy} onclick={() => void backup.chooseFolder()}>
          {i18n.t('backup.choose')}
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <Section>
      <Form>
        <FormRow label={i18n.t('backup.folder')}>
          <span class="value folder selectable" class:problem={!status.reachable}
            >{status.folder}</span
          >
        </FormRow>
        <FormRow label={i18n.t('backup.last')}>
          <span class="value">
            {#if status.running}
              {i18n.t('backup.running')}
            {:else if status.lastAt !== null}
              {when(status.lastAt)}
            {:else}
              {i18n.t('backup.never')}
            {/if}
          </span>
        </FormRow>
      </Form>
      {#if !status.reachable}
        <Callout tone="danger"
          >{i18n.t('backup.unreachable', { folder: status.folder ?? '' })}</Callout
        >
      {:else if status.error}
        <Callout tone="danger">{i18n.t('backup.failed', { message: status.error })}</Callout>
      {/if}
      <div class="row">
        <Button
          variant="primary"
          disabled={backup.busy || status.running}
          onclick={() => void backup.runNow()}
        >
          {i18n.t('backup.now')}
        </Button>
        <Button disabled={backup.busy} onclick={() => void backup.chooseFolder()}>
          {i18n.t('backup.change')}
        </Button>
        <Button variant="plain" onclick={() => void backup.disable()}>{i18n.t('backup.off')}</Button
        >
      </div>
    </Section>

    <Section title={i18n.t('backup.list')}>
      {#if backup.files.length === 0}
        <p class="hint">{i18n.t('backup.listEmpty')}</p>
      {:else}
        <ul class="files">
          {#each backup.files as file (file.name)}
            <li>
              <ListRow
                role={undefined}
                aria-selected={undefined}
                title={file.name}
                subtitle="{when(file.time)} · {size(file.size)}"
              >
                {#snippet accessory()}
                  <Button size="sm" variant="plain" onclick={() => void backup.reveal(file.name)}>
                    {i18n.t('backup.reveal')}
                  </Button>
                  <Button
                    size="sm"
                    variant="plain"
                    disabled={backup.busy}
                    onclick={() =>
                      void backup.restore(file.name).then((done) => {
                        if (done) history.close()
                      })}
                  >
                    {i18n.t('backup.restore')}
                  </Button>
                {/snippet}
              </ListRow>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="hint">{i18n.t('backup.restoreHint')}</p>
      <p class="hint">{i18n.t('backup.how')}</p>
    </Section>
  {/if}
</div>

<style>
  .backup {
    display: flex;
    flex-direction: column;
    max-width: 680px;
    padding-top: var(--sp-16);
  }
  .value {
    padding-top: calc((var(--control-md) - 18px) / 2);
    color: var(--color-label);
    font: var(--type-body);
    overflow-wrap: anywhere;
  }
  .folder.problem {
    color: var(--color-danger);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-8);
    margin-left: calc(var(--form-label-width) + var(--sp-12));
  }
  .files {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .hint {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
