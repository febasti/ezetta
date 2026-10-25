<script lang="ts">
  import type { OutlineEntry } from '@core/typst/outline'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'

  /**
   * The headings of the Gliederung, sheet by sheet: a small label for each sheet (unless it
   * is only the sheet's first heading again), then its headings indented by level, with the number the export prints. A heading that skips a level has
   * a warning; the headings of a sheet that is not in the export are dimmed and have no number.
   */
  interface Props {
    entries: readonly OutlineEntry[]
    sheetLabel: (path: string) => string
    /** The sheet open in the editor, whose label stands out. */
    current: string | null
    onpick: (entry: OutlineEntry) => void
  }
  let { entries, sheetLabel, current, onpick }: Props = $props()

  const skippedText = (entry: OutlineEntry): string =>
    entry.skippedFrom === 0
      ? i18n.t('outline.skippedStart', { to: entry.level })
      : i18n.t('outline.skipped', { from: entry.skippedFrom ?? 0, to: entry.level })
</script>

<ul class="outline">
  {#each entries as entry, i (`${entry.path}:${entry.at}:${i}`)}
    <!-- A sheet's label, where its headings begin; left out when it only repeats the first heading. -->
    {#if (i === 0 || entries[i - 1]!.path !== entry.path) && (sheetLabel(entry.path) !== entry.title || !entry.inExport)}
      <li class="sheet" class:current={entry.path === current}>
        <span class="name">{sheetLabel(entry.path)}</span>
        {#if !entry.inExport}
          <span class="excluded" title={i18n.t('outline.excluded')}>
            <Icon name="eye-off" size={12} />
          </span>
        {/if}
      </li>
    {/if}
    <li>
      <ListRow
        role="button"
        tabindex={0}
        aria-selected={undefined}
        depth={Math.max(1, entry.level) - 1}
        strong={entry.level === 1}
        muted={!entry.inExport}
        onclick={() => onpick(entry)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onpick(entry)
          }
        }}
      >
        {#snippet content()}
          {#if entry.number}<span class="number">{entry.number}</span>{/if}
          <span class="title" class:chapter={entry.level === 1}>{entry.title || '…'}</span>
        {/snippet}
        {#snippet accessory()}
          {#if entry.skippedFrom !== null}
            <span class="warn" title={skippedText(entry)} aria-label={skippedText(entry)}>
              <Icon name="warning" size={14} />
            </span>
          {/if}
        {/snippet}
      </ListRow>
    </li>
  {/each}
</ul>

<style>
  .outline {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* A sheet's name above its headings: quiet, in the caption role. */
  .sheet {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    margin: var(--sp-12) 0 var(--sp-4);
    padding: 0 var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .sheet:first-child {
    margin-top: 0;
  }
  .sheet.current {
    color: var(--color-label-secondary);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .excluded {
    display: inline-flex;
  }
  .number {
    flex: none;
    color: var(--color-label-tertiary);
    font-variant-numeric: tabular-nums;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chapter {
    font: var(--type-emphasis);
  }
  .warn {
    display: inline-flex;
    color: var(--color-warning);
  }
</style>
