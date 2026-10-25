<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { formatNumber } from '../../lib/format'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import KeyValue from '../../ui/kit/KeyValue.svelte'
  import KeyValues from '../../ui/kit/KeyValues.svelte'
  import Meter from '../../ui/kit/Meter.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import { project } from '../sidebar/project.svelte'
  import { stats, WORDS_PER_MINUTE } from './stats.svelte'

  const num = (n: number): string => formatNumber(n, i18n.locale)
  const minutes = (words: number): string => {
    if (words < WORDS_PER_MINUTE / 2) return i18n.t('stats.underMinute')
    const total = Math.max(1, Math.round(words / WORDS_PER_MINUTE))
    return total < 60
      ? i18n.t('stats.minutes', { count: num(total) })
      : i18n.t('stats.hours', { hours: num(Math.floor(total / 60)), minutes: num(total % 60) })
  }
  const share = (value: number, of: number): number => (of > 0 ? Math.min(1, value / of) : 0)

  const sheet = $derived(stats.sheet)
  const whole = $derived(stats.project)
  const goal = $derived(project.snapshot?.goalWords ?? null)
  const group = $derived(stats.group)
  const STATUSES = ['draft', 'revised', 'final'] as const
</script>

<div class="stats" role="tabpanel" aria-labelledby="right-tab-stats">
  <div class="body">
    <Section title={i18n.t('stats.sheet')}>
      {#if sheet}
        <p class="big">{i18n.t('stats.words', { count: num(sheet.counts.words) })}</p>
        {#if sheet.node.goal}
          <Meter value={share(sheet.counts.words, sheet.node.goal)} label={i18n.t('stats.goal')} />
          <p class="note">
            {i18n.t('stats.ofGoal', {
              percent: num(Math.round((sheet.counts.words / sheet.node.goal) * 100)),
              goal: num(sheet.node.goal),
            })}
          </p>
        {/if}
        <KeyValues>
          <KeyValue
            label={i18n.t('stats.reading')}
            value={minutes(sheet.counts.words + sheet.counts.footnoteWords)}
          />
          <KeyValue label={i18n.t('stats.footnoteWords')} value={num(sheet.counts.footnoteWords)} />
          <KeyValue label={i18n.t('stats.footnotes')} value={num(sheet.counts.footnotes)} />
          <KeyValue label={i18n.t('stats.figures')} value={num(sheet.counts.figures)} />
          <KeyValue label={i18n.t('stats.tables')} value={num(sheet.counts.tables)} />
          <KeyValue
            label={i18n.t('stats.citations')}
            value={num(sheet.counts.citations)}
            detail={sheet.counts.works > 0
              ? i18n.t('stats.works', { count: num(sheet.counts.works) })
              : undefined}
          />
        </KeyValues>
      {:else}
        <EmptyState icon="file" title={i18n.t('stats.noSheet')} />
      {/if}
    </Section>

    {#if group && project.selectedGroup !== ''}
      <Section title={i18n.t('stats.group')}>
        <p class="big">{i18n.t('stats.words', { count: num(group.words) })}</p>
        <p class="note">
          {i18n.t('sidebar.sheetCount', { count: group.sheetCount })} · {minutes(group.words)}
        </p>
      </Section>
    {/if}

    <Section title={i18n.t('stats.project')}>
      <p class="big">{i18n.t('stats.words', { count: num(whole.counts.words) })}</p>
      {#if goal}
        <Meter value={share(whole.counts.words, goal)} label={i18n.t('stats.goal')} />
        <p class="note">
          {i18n.t('stats.ofGoal', {
            percent: num(Math.round((whole.counts.words / goal) * 100)),
            goal: num(goal),
          })}
        </p>
      {/if}
      <p class="note">{i18n.t('stats.inExport')}</p>

      <h4>{i18n.t('stats.byStatus')}</h4>
      <div class="split" role="img" aria-label={i18n.t('stats.byStatus')}>
        {#each STATUSES as status (status)}
          <span
            class="part {status}"
            style:flex-grow={whole.byStatus[status].words}
            title="{i18n.t(`status.${status}`)}: {num(whole.byStatus[status].words)}"
          ></span>
        {/each}
      </div>
      <ul class="legend">
        {#each STATUSES as status (status)}
          <li>
            <span class="dot {status}"></span>
            <span class="what">{i18n.t(`status.${status}`)}</span>
            <span class="n">
              {i18n.t('stats.sheets', { count: num(whole.byStatus[status].sheets) })} ·
              {num(whole.byStatus[status].words)}
            </span>
          </li>
        {/each}
      </ul>

      <KeyValues>
        <KeyValue
          label={i18n.t('stats.reading')}
          value={minutes(whole.counts.words + whole.counts.footnoteWords)}
        />
        <KeyValue label={i18n.t('stats.footnotes')} value={num(whole.counts.footnotes)} />
        <KeyValue label={i18n.t('stats.figures')} value={num(whole.counts.figures)} />
        <KeyValue label={i18n.t('stats.tables')} value={num(whole.counts.tables)} />
        <KeyValue
          label={i18n.t('stats.citations')}
          value={num(whole.counts.citations)}
          detail={whole.counts.works > 0
            ? i18n.t('stats.works', { count: num(whole.counts.works) })
            : undefined}
        />
        {#if whole.excludedSheets > 0}
          <KeyValue
            label={i18n.t('stats.excluded')}
            value={num(whole.excludedWords)}
            detail={i18n.t('stats.sheets', { count: num(whole.excludedSheets) })}
          />
        {/if}
      </KeyValues>
    </Section>
  </div>
</div>

<style>
  .stats {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: var(--sp-16) var(--inset-pane);
    overflow-y: auto;
  }
  /* The count of words is the section's main fact. */
  .big {
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  h4 {
    margin: var(--sp-8) 0 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  /* The project's words by status, as one bar in three parts. */
  .split {
    display: flex;
    gap: 1px;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--color-control);
  }
  .part {
    flex-basis: 0;
    min-width: 0;
  }
  .part.draft,
  .dot.draft {
    background: var(--color-label-tertiary);
  }
  .part.revised,
  .dot.revised {
    background: var(--color-warning);
  }
  .part.final,
  .dot.final {
    background: var(--color-success);
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
    font: var(--type-body);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .what {
    flex: 1;
    color: var(--color-label-secondary);
  }
  .n {
    color: var(--color-label-tertiary);
    font-variant-numeric: tabular-nums;
  }
</style>
