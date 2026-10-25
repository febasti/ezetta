<script lang="ts">
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Segmented from '../../ui/kit/Segmented.svelte'
  import { referencePieces } from '@core/bib/reference'
  import { i18n } from '../../i18n/i18n.svelte'
  import { setLiteratureScope, ui } from '../../lib/ui.svelte'
  import { project } from '../sidebar/project.svelte'
  import { literature } from './literature.svelte'
  import LiteratureRow from './LiteratureRow.svelte'

  const SCOPES = ['sheet', 'group', 'project'] as const

  const language = $derived(project.snapshot?.language ?? 'de')
  const summary = $derived(literature.summary)
  const open = $derived(summary.missing.length + summary.checks.length > 0)
</script>

<div class="literature" role="tabpanel" aria-label={i18n.t('literature.title')}>
  <header>
    <Segmented
      label={i18n.t('literature.scope')}
      size="sm"
      stretch
      options={SCOPES.map((scope) => ({
        value: scope,
        label: i18n.t(`literature.scope.${scope}`),
      }))}
      value={ui.literatureScope}
      onchange={setLiteratureScope}
    />
    <p class="summary">
      {i18n.t('literature.summary', { works: summary.works.length, count: summary.total })}
    </p>
  </header>

  <div class="body">
    {#if open}
      <Section title={i18n.t('literature.open.title')}>
        {#if summary.missing.length > 0}
          <LiteratureRow
            label={i18n.t('literature.missing')}
            count={summary.missing.length}
            uses={summary.missing}
            problem
          />
        {/if}
        {#if summary.checks.length > 0}
          <LiteratureRow
            label={i18n.t('literature.check')}
            count={summary.checks.length}
            uses={summary.checks}
          />
        {/if}
      </Section>
    {/if}

    <Section>
      {#if summary.works.length === 0}
        <EmptyState icon="book" title={i18n.t('literature.empty')} />
      {:else}
        <!-- The works as a list of references: each in full, with how often it is cited. -->
        <ul class="works" aria-label={i18n.t('literature.works')}>
          {#each summary.works as work (work.key)}
            {@const here = ui.literatureScope !== 'sheet' && literature.citedHere.has(work.key)}
            <li class="work">
              <span
                class="dot"
                class:here
                title={here ? i18n.t('literature.here') : undefined}
                aria-hidden="true"
              ></span>
              {#if work.entry}
                <p class="reference selectable">
                  {#each referencePieces(work.entry, language) as piece, i (i)}{#if piece.italic}<em
                        >{piece.text}</em
                      >{:else if piece.link}<span class="link">{piece.text}</span
                      >{:else}{piece.text}{/if}{/each}
                </p>
              {:else}
                <p class="reference missing selectable">
                  <span class="key">{work.key}</span>
                  <span class="unknown">{i18n.t('literature.unknown')}</span>
                </p>
              {/if}
              <span class="count" title={i18n.t('literature.cited', { count: work.count })}
                >{work.count}×</span
              >
            </li>
          {/each}
        </ul>
      {/if}
    </Section>
  </div>
</div>

<style>
  .literature {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  header {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--inset-pane) var(--sp-8);
  }
  .summary {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: var(--sp-8) var(--sp-8) var(--sp-16);
    overflow-y: auto;
  }
  .works {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    margin: 0;
    padding: 0 var(--sp-8);
    list-style: none;
  }
  /* A reference with a hanging indent, as in a list of works; a dot in the margin for a work the
     open sheet cites; how often it is cited at the right. */
  .work {
    display: grid;
    grid-template-columns: var(--sp-8) minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-4);
  }
  .dot {
    width: 6px;
    height: 6px;
    margin-top: calc((18px - 6px) / 2);
    border-radius: 50%;
  }
  .dot.here {
    background: var(--color-accent);
  }
  .reference {
    margin: 0;
    padding-left: var(--sp-16);
    color: var(--color-label);
    font: var(--type-body);
    text-indent: calc(-1 * var(--sp-16));
    overflow-wrap: anywhere;
  }
  .reference em {
    font-style: italic;
  }
  .link {
    color: var(--color-label-secondary);
  }
  .missing .key {
    margin-right: var(--sp-4);
    color: var(--color-danger);
    font: var(--type-emphasis);
  }
  .missing .unknown {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .count {
    padding: 0 var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    line-height: 18px;
  }
</style>
