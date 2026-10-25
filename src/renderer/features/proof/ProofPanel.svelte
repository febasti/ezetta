<script lang="ts">
  import { onDestroy } from 'svelte'
  import { contextParts } from '@core/proof/issues'
  import type { ProofIssue } from '@core/proof/issues'
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import Switch from '../../ui/kit/Switch.svelte'
  import Spinner from '../../ui/Spinner.svelte'
  import { editor } from '../editor/editorSession.svelte'
  import { project } from '../sidebar/project.svelte'
  import { CATEGORIES, proof, proofWaiting } from './proof.svelte'

  const issues = $derived(editor.issues)
  const disabledCategories = $derived(project.snapshot?.proofing.disabledCategories ?? [])
  const disabledRules = $derived(project.snapshot?.proofing.disabledRules ?? [])
  const picky = $derived(project.snapshot?.proofing.level === 'picky')
  const keyOf = (issue: ProofIssue): string => `${issue.from}:${issue.ruleId}`

  /** The entry that is open, by place and rule. A new check moves entries, so it is found again by key. */
  let openKey = $state<string | null>(null)
  const open = $derived(issues.find((issue) => keyOf(issue) === openKey) ?? null)

  /** Opens an entry: its suggestions show here, and the text shows the place without selecting it. */
  function toggle(issue: ProofIssue): void {
    const same = openKey === keyOf(issue)
    openKey = same ? null : keyOf(issue)
    editor.showIssue(same ? null : issue)
  }

  function step(delta: number): void {
    if (issues.length === 0) return
    const at = open ? issues.indexOf(open) : delta > 0 ? -1 : 0
    toggle(issues[(at + delta + issues.length) % issues.length]!)
  }

  function apply(issue: ProofIssue, value: string): void {
    openKey = null
    editor.applyIssue(issue, value)
  }

  const position = $derived(open ? issues.indexOf(open) + 1 : 0)

  /** Until the first answer for the sheet, the list says it is coming rather than that all is well. */
  const waiting = $derived(proofWaiting())
  const stateText = $derived(
    waiting && proof.state === 'ready'
      ? i18n.t('proof.checking')
      : i18n.t(`proof.state.${proof.state}`),
  )
  /** The colour of each kind of issue (its dot, its underline). */
  const KIND_COLOR: Record<(typeof CATEGORIES)[number], string> = {
    spelling: 'var(--color-danger)',
    grammar: 'var(--color-warning)',
    style: 'var(--color-accent)',
    typography: 'var(--color-label-tertiary)',
  }
  const languageNames = $derived(new Intl.DisplayNames([i18n.locale], { type: 'language' }))
  const languageName = (variant: string): string => languageNames.of(variant) ?? variant

  // Leaving the tab ends the proofreading: the mark in the text goes with it.
  onDestroy(() => editor.showIssue(null))
</script>

<div class="proof" role="tabpanel" aria-labelledby="right-tab-proof">
  <header>
    <div class="status">
      {#if waiting}
        <Spinner size={12} />
      {:else}
        <span class="light {proof.state}" aria-hidden="true"></span>
      {/if}
      <p class="state" role="status">{stateText}</p>
      <IconButton
        icon="refresh"
        size="sm"
        label={i18n.t('proof.recheck')}
        disabled={!editor.path}
        onclick={() => editor.recheck()}
      />
    </div>
    <!-- What is checked: the language, the kinds of issue, and how strictly. -->
    <div class="settings">
      {#if proof.variants.length > 1}
        <Select
          label={i18n.t('proof.language')}
          value={proof.settings.language}
          options={proof.variants.map((variant) => ({
            value: variant,
            label: languageName(variant),
          }))}
          onchange={(value) => void proof.setLanguage(value)}
        />
      {/if}
      <fieldset class="kinds">
        <legend>{i18n.t('proof.checkFor')}</legend>
        {#each CATEGORIES as category (category)}
          <Checkbox
            checked={!disabledCategories.includes(category)}
            onchange={() => void proof.toggleCategory(category)}
          >
            {i18n.t(`proof.category.${category}`)}
          </Checkbox>
        {/each}
      </fieldset>
      <div class="picky">
        <Switch checked={picky} onchange={(on) => void proof.setPicky(on)}>
          {i18n.t('proof.picky')}
        </Switch>
        <p class="hint">{i18n.t('proof.pickyHint')}</p>
      </div>
    </div>
    {#if issues.length > 0}
      <div class="nav">
        <span class="position" aria-live="polite">
          {position > 0
            ? i18n.t('proof.position', { n: position, total: issues.length })
            : i18n.t('proof.total', { count: issues.length })}
        </span>
        <IconButton
          icon="chevron-up"
          size="sm"
          label={i18n.t('proof.previous')}
          onclick={() => step(-1)}
        />
        <IconButton
          icon="chevron-down"
          size="sm"
          label={i18n.t('proof.next')}
          onclick={() => step(1)}
        />
      </div>
    {/if}
  </header>

  <div class="body">
    {#if !editor.path}
      <EmptyState icon="file" title={i18n.t('proof.noSheet')} />
    {:else if waiting}
      <EmptyState icon="circle-check" busy title={stateText} />
    {:else if issues.length === 0}
      <EmptyState
        icon={proof.state === 'ready' ? 'circle-check' : 'warning'}
        title={proof.state === 'ready' ? i18n.t('proof.none') : stateText}
      />
    {:else}
      <ul class="issues">
        {#each issues as issue (keyOf(issue))}
          {@const [before, covered, after] = contextParts(issue)}
          {@const isOpen = open === issue}
          <li class:open={isOpen}>
            <ListRow
              role="button"
              tabindex={0}
              aria-selected={undefined}
              aria-expanded={isOpen}
              selected={isOpen}
              align="top"
              onclick={() => toggle(issue)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(issue)
                }
              }}
            >
              {#snippet leading()}
                <span class="dot" style:background={KIND_COLOR[issue.category]}></span>
              {/snippet}
              {#snippet content()}
                <span class="text">
                  <span class="message">{issue.shortMessage}</span>
                  <span class="context"
                    >{before}<mark class={issue.category}>{covered}</mark>{after}</span
                  >
                  {#if issue.footnote}<span class="note">{i18n.t('proof.inFootnote')}</span>{/if}
                </span>
              {/snippet}
            </ListRow>
            {#if isOpen}
              <div class="detail">
                <p class="explain">{issue.message}</p>
                {#if issue.replacements.length > 0}
                  <div class="suggestions" role="group" aria-label={i18n.t('proof.suggestions')}>
                    {#each issue.replacements as value (value)}
                      <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- shares the DOM kit classes with the hover card, which is plain DOM -->
                      <button
                        type="button"
                        class="k-button k-button-sm proof-suggestion"
                        onclick={() => apply(issue, value)}
                      >
                        {value}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <p class="explain">{i18n.t('proof.noSuggestion')}</p>
                {/if}
                <div class="proof-more" role="group" aria-label={i18n.t('proof.moreActions')}>
                  {#if issue.category === 'spelling'}
                    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- shares the DOM kit classes with the hover card -->
                    <button
                      type="button"
                      class="k-button k-button-sm k-button-plain proof-action"
                      onclick={() => void proof.addWord('project', issue.text)}
                    >
                      {i18n.t('proof.addToProject')}
                    </button>
                    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- shares the DOM kit classes with the hover card -->
                    <button
                      type="button"
                      class="k-button k-button-sm k-button-plain proof-action"
                      onclick={() => void proof.addWord('personal', issue.text)}
                    >
                      {i18n.t('proof.addToPersonal')}
                    </button>
                  {/if}
                  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- shares the DOM kit classes with the hover card -->
                  <button
                    type="button"
                    class="k-button k-button-sm k-button-plain proof-action"
                    onclick={() => proof.ignore(issue)}
                  >
                    {i18n.t('proof.ignore')}
                  </button>
                  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- shares the DOM kit classes with the hover card -->
                  <button
                    type="button"
                    class="k-button k-button-sm k-button-plain proof-action"
                    onclick={() => void proof.disableRule(issue.ruleId)}
                  >
                    {i18n.t('proof.disableRule')}
                  </button>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if disabledRules.length > 0}
      <Section title={i18n.t('proof.disabledRules')}>
        <ul class="rules">
          {#each disabledRules as rule (rule)}
            <li>
              <span class="rule">{rule}</span>
              <Button size="sm" variant="plain" onclick={() => void proof.enableRule(rule)}>
                {i18n.t('proof.enableRule')}
              </Button>
            </li>
          {/each}
        </ul>
      </Section>
    {/if}
  </div>
</div>

<style>
  .proof {
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
    border-bottom: 1px solid var(--color-separator);
  }
  /* The state of the checker: a light, its words, and the button that checks the sheet again. */
  .status {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .state {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .light {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-warning);
  }
  .light.ready {
    background: var(--color-success);
  }
  .light.missing,
  .light.failed {
    background: var(--color-danger);
  }
  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
  }
  .settings > :global(.select) {
    width: 100%;
  }
  /* The four kinds in two columns, under a small heading. */
  .kinds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 var(--sp-8);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: var(--sp-4);
    padding: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .picky .hint {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  /* The count and the steps through the list: under a hairline, apart from the settings. */
  .nav {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    margin: var(--sp-4) calc(-1 * var(--inset-pane)) 0;
    padding: var(--sp-8) var(--inset-pane) 0;
    border-top: 1px solid var(--color-separator);
  }
  .position {
    flex: 1;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: var(--sp-8) var(--sp-8) var(--sp-16);
    overflow-y: auto;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* An entry and, while it is open, its explanation, suggestions and actions belong together. */
  .issues li + li {
    margin-top: var(--sp-4);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .message {
    font: var(--type-emphasis);
  }
  .context {
    color: var(--color-label-secondary);
    overflow-wrap: anywhere;
  }
  mark {
    padding: 0 1px;
    background: none;
    color: var(--color-label);
    text-decoration: underline wavy;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }
  mark.spelling {
    text-decoration-color: var(--color-danger);
  }
  mark.grammar {
    text-decoration-color: var(--color-warning);
  }
  mark.style {
    text-decoration-color: var(--color-accent);
  }
  mark.typography {
    text-decoration-color: var(--color-label-tertiary);
  }
  .note {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    padding: var(--sp-4) var(--sp-8) var(--sp-12) var(--sp-24);
  }
  .explain {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
  }
  .rules li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
  }
  .rule {
    min-width: 0;
    overflow: hidden;
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-family: var(--font-mono);
    text-overflow: ellipsis;
  }
</style>
