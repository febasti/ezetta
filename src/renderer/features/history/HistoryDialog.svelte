<script lang="ts">
  import { tick } from 'svelte'
  import type { VersionDto } from '@shared/history'
  import { isMaterial } from '@core/project/paths'
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import Dialog from '../../ui/kit/Dialog.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Tabs from '../../ui/kit/Tabs.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import BackupPanel from './BackupPanel.svelte'
  import { backup } from './backup.svelte'
  import { history } from './history.svelte'

  const dayKey = (time: number): string => new Date(time).toDateString()
  /** The versions with a heading before the first of each day. */
  const days = $derived.by(() => {
    const out: { key: string; label: string; versions: VersionDto[] }[] = []
    const today = new Date()
    const yesterday = new Date(today.getTime() - 86_400_000)
    for (const version of history.versions) {
      const key = dayKey(version.time)
      let day = out[out.length - 1]
      if (!day || day.key !== key) {
        const label =
          key === today.toDateString()
            ? i18n.t('history.today')
            : key === yesterday.toDateString()
              ? i18n.t('history.yesterday')
              : new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'full' }).format(version.time)
        day = { key, label, versions: [] }
        out.push(day)
      }
      day.versions.push(version)
    }
    return out
  })

  const clock = (time: number): string =>
    new Intl.DateTimeFormat(i18n.locale, { timeStyle: 'short' }).format(time)
  const fullDate = (time: number): string =>
    new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'full', timeStyle: 'short' }).format(time)
  const kindLabel = (version: VersionDto): string =>
    version.kind === 'named' && version.name ? version.name : i18n.t(`history.kind.${version.kind}`)

  const sheets = $derived(history.files)
  const size = (bytes: number): string =>
    bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${Math.round(bytes / (1024 * 1024))} MB`
  const chosen = $derived(history.files.find((f) => f.path === history.selectedPath) ?? null)
  const comparison = $derived(history.comparison)

  function startNaming(): void {
    history.naming = true
    void tick().then(() => document.getElementById('version-name')?.focus())
  }
</script>

{#if history.open}
  <Dialog
    title={i18n.t('history.dialogTitle')}
    closeLabel={i18n.t('history.close')}
    width="wide"
    height="tall"
    onclose={() => history.close()}
    onescape={() => (history.naming ? (history.naming = false) : history.close())}
  >
    <div class="layout">
      <div class="tabs">
        <Tabs
          label={i18n.t('history.dialogTitle')}
          tabs={[
            { id: 'versions', label: i18n.t('history.tabVersions') },
            { id: 'backup', label: i18n.t('history.tabBackup') },
          ]}
          value={history.tab}
          onchange={(tab) => {
            history.tab = tab
            if (tab === 'backup') {
              void backup.refresh()
              void backup.loadFiles()
            }
          }}
          idPrefix="history-tab"
          panelId="history-panel"
        />
      </div>

      {#if history.tab === 'backup'}
        <div id="history-panel" class="panel" role="tabpanel" aria-labelledby="history-tab-backup">
          <BackupPanel />
        </div>
      {:else}
        <div class="bar">
          <Checkbox checked={history.enabled} onchange={(on) => void history.setEnabled(on)}>
            {i18n.t('history.auto')}
          </Checkbox>
          {#if history.enabled && !history.naming}
            <Button onclick={startNaming}>{i18n.t('history.save')}</Button>
          {/if}
        </div>

        {#if history.naming}
          <form
            class="naming"
            onsubmit={(event) => {
              event.preventDefault()
              void history.saveNamed()
            }}
          >
            <TextField
              id="version-name"
              value={history.name}
              onvalue={(v) => (history.name = v)}
              placeholder={i18n.t('history.namePlaceholder')}
              label={i18n.t('history.namePlaceholder')}
            />
            <Button
              variant="primary"
              type="submit"
              disabled={history.busy || history.name.trim() === ''}
            >
              {i18n.t('history.nameSave')}
            </Button>
            <Button variant="plain" onclick={() => (history.naming = false)}>
              {i18n.t('history.cancel')}
            </Button>
          </form>
        {/if}

        {#if !history.enabled}
          <EmptyState icon="history" title={i18n.t('history.off')}>
            {#snippet action()}
              <Button variant="primary" onclick={() => void history.setEnabled(true)}>
                {i18n.t('history.turnOn')}
              </Button>
            {/snippet}
          </EmptyState>
        {:else if history.versions.length === 0}
          {#if !history.loading}<EmptyState icon="history" title={i18n.t('history.empty')} />{/if}
        {:else}
          <div class="body">
            <nav class="versions" aria-label={i18n.t('history.versions')}>
              {#each days as day (day.key)}
                <h3>{day.label}</h3>
                <ul>
                  {#each day.versions as version (version.id)}
                    <li class="version">
                      <ListRow
                        role="button"
                        tabindex={0}
                        aria-selected={undefined}
                        aria-current={version.id === history.selectedId}
                        selected={version.id === history.selectedId}
                        strong={version.kind === 'named'}
                        onclick={() => void history.select(version.id)}
                        onkeydown={(e) => {
                          if (e.key === 'Enter') void history.select(version.id)
                        }}
                      >
                        {#snippet leading()}<span class="time">{clock(version.time)}</span
                          >{/snippet}
                        {#snippet content()}
                          <span class="what" class:named={version.kind === 'named'}
                            >{kindLabel(version)}</span
                          >
                        {/snippet}
                      </ListRow>
                    </li>
                  {/each}
                </ul>
              {/each}
            </nav>

            <section class="detail" aria-live="polite">
              {#if history.selected}
                <h3 class="when">
                  {fullDate(history.selected.time)}
                  {#if history.selected.kind === 'named' && history.selected.name}
                    <span class="name">{history.selected.name}</span>
                  {/if}
                </h3>

                {#if sheets.length === 0 && history.newSince === 0}
                  <p class="hint">{i18n.t('history.noSheets')}</p>
                {:else}
                  <div class="all">
                    <Button
                      disabled={history.busy ||
                        sheets.length + (history.removeNew ? history.newSince : 0) === 0}
                      onclick={() => void history.restoreAll()}
                    >
                      {i18n.t('history.restoreAllButton', { count: sheets.length })}
                    </Button>
                    {#if history.newSince > 0}
                      <Checkbox bind:checked={history.removeNew}>
                        {i18n.t('history.removeNew', { count: history.newSince })}
                      </Checkbox>
                    {/if}
                  </div>
                  <ul class="files" aria-label={i18n.t('history.changes')}>
                    {#each sheets as file (file.path)}
                      <li class="file">
                        <ListRow
                          role="button"
                          tabindex={0}
                          aria-selected={undefined}
                          aria-current={file.path === history.selectedPath}
                          selected={file.path === history.selectedPath}
                          onclick={() => void history.selectFile(file.path)}
                          onkeydown={(e) => {
                            if (e.key === 'Enter') void history.selectFile(file.path)
                          }}
                        >
                          {#snippet leading()}
                            <span class="badge {file.change}"
                              >{i18n.t(`history.change.${file.change}`)}</span
                            >
                          {/snippet}
                          {#snippet content()}
                            <span class="title" class:path={file.sheet === null}
                              >{#if file.sheet !== null && isMaterial(file.sheet)}<span
                                  class="material"
                                  >{i18n.t('sidebar.material')} ·
                                </span>{/if}{file.sheet === null
                                ? file.path
                                : file.title || i18n.t('history.noText')}</span
                            >
                          {/snippet}
                        </ListRow>
                      </li>
                    {/each}
                  </ul>
                {/if}
                {#if chosen && comparison}
                  <div class="compare">
                    {#if comparison.binary}
                      <p class="summary">
                        {i18n.t('history.binary', {
                          version:
                            comparison.versionSize === null
                              ? i18n.t('history.noFile')
                              : size(comparison.versionSize),
                          current:
                            comparison.currentSize === null
                              ? i18n.t('history.noFile')
                              : size(comparison.currentSize),
                        })}
                      </p>
                      <div class="actions">
                        <span class="hint">{i18n.t('history.restoreHint')}</span>
                        <Button
                          variant="primary"
                          disabled={history.busy}
                          onclick={() => void history.restore()}
                        >
                          {comparison.currentSize === null
                            ? i18n.t('history.restoreFileDeleted')
                            : i18n.t('history.restore')}
                        </Button>
                      </div>
                    {:else if comparison.lost === 0 && comparison.back === 0 && comparison.version === comparison.current}
                      <p class="hint">{i18n.t('history.identical')}</p>
                    {:else}
                      <p class="summary">
                        {i18n.t('history.summary', {
                          back: comparison.back,
                          lost: comparison.lost,
                        })}
                      </p>
                      <div class="legend">
                        <span class="lost">{i18n.t('history.legendLost')}</span>
                        <span class="back">{i18n.t('history.legendBack')}</span>
                      </div>
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <pre
                        class="text selectable"
                        tabindex="0"
                        aria-label={i18n.t(
                          'history.diff',
                        )}>{#each comparison.pieces as piece, i (i)}<span class={piece.kind}
                            >{piece.text}</span
                          >{/each}</pre>
                      <div class="actions">
                        <span class="hint">{i18n.t('history.restoreHint')}</span>
                        <Button
                          variant="primary"
                          disabled={history.busy}
                          onclick={() => void history.restore()}
                        >
                          {comparison.current === null
                            ? i18n.t(
                                chosen.sheet === null
                                  ? 'history.restoreFileDeleted'
                                  : 'history.restoreDeleted',
                              )
                            : i18n.t('history.restore')}
                        </Button>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/if}
            </section>
          </div>
        {/if}
      {/if}
    </div>
  </Dialog>
{/if}

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    height: 100%;
    min-height: 0;
  }
  /* The tabs reach the dialog's edges, under its header. */
  .tabs {
    flex: none;
    margin: calc(-1 * var(--sp-8)) calc(-1 * var(--inset-dialog)) 0;
  }
  .tabs :global(.tabs) {
    padding: 0 var(--inset-dialog);
  }
  .panel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .bar {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-12);
  }
  .naming {
    display: flex;
    flex: none;
    gap: var(--sp-8);
  }
  .body {
    display: grid;
    flex: 1;
    grid-template-columns: 260px 1fr;
    gap: var(--sp-16);
    min-height: 0;
  }
  .versions,
  .detail {
    min-height: 0;
    overflow-y: auto;
  }
  .versions {
    padding-right: var(--sp-8);
    border-right: 1px solid var(--color-separator);
  }
  h3 {
    margin: var(--sp-12) 0 var(--sp-4);
    padding: 0 var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .versions h3:first-child {
    margin-top: 0;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .time {
    color: var(--color-label-tertiary);
    font-variant-numeric: tabular-nums;
  }
  .what {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .what.named {
    font: var(--type-emphasis);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
  }
  .when {
    margin: 0;
    padding: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
  }
  .name {
    margin-left: var(--sp-8);
    padding: 0 var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-selection);
    color: var(--color-accent);
  }
  .hint {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .all {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-12);
  }
  .files {
    flex: none;
    max-height: 11em;
    overflow-y: auto;
  }
  .badge {
    min-width: 5em;
    padding: 0 var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-caption);
    text-align: center;
  }
  .badge.added {
    color: var(--color-success);
  }
  .badge.deleted {
    color: var(--color-danger);
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title.path {
    font: var(--type-caption);
    font-family: var(--font-mono);
  }
  .compare {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-8);
    min-height: 0;
  }
  .summary {
    margin: 0;
    color: var(--color-label-secondary);
  }
  .legend {
    display: flex;
    gap: var(--sp-16);
    font: var(--type-caption);
  }
  /* The comparison, in the writing face: what a restore removes, struck through; what comes back. */
  .text {
    flex: 1;
    min-height: 8em;
    margin: 0;
    padding: var(--sp-12) var(--sp-16);
    overflow: auto;
    border-radius: var(--r-md);
    background: var(--color-panel);
    color: var(--color-label);
    font-family: var(--font-writing);
    font-size: 14px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .text:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .lost {
    background: color-mix(in srgb, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
    text-decoration: line-through;
  }
  .back {
    background: color-mix(in srgb, var(--color-success) 22%, transparent);
  }
  .actions {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-12);
  }
  .material {
    color: var(--color-label-tertiary);
  }
</style>
