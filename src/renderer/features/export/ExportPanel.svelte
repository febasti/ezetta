<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import Link from '../../ui/kit/Link.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import { project } from '../sidebar/project.svelte'
  import PropertiesPanel from '../templates/PropertiesPanel.svelte'
  import ReadonlyNote from '../templates/ReadonlyNote.svelte'
  import { fontProblemText } from '../templates/fontProblems'
  import { elementById } from '@core/export/elements'
  import DocumentField from './DocumentField.svelte'
  import { exporting } from './export.svelte'
  import { EXPORT_ICON } from './groupIcons'

  const info = $derived(exporting.info)
  const profile = $derived(exporting.profile)
  const template = $derived(info?.templates.find((t) => t.id === profile?.template))
  const lang = $derived(i18n.locale)
  const warnings = $derived(info?.warnings)
  const result = $derived(exporting.result)

  const anyOpen = $derived(exporting.openCount > 0)
  /** What the template offers, as the document's own settings. */
  const offered = $derived(template?.options.filter((o) => !o.hidden) ?? [])
</script>

{#snippet flag()}
  <span class="mark"><Icon name="warning" size={16} /></span>
{/snippet}

{#if info && profile}
  <section class="panel" aria-label={i18n.t('export.panel')}>
    <header class="head">
      <Icon name={EXPORT_ICON} size={16} />
      <h3 class="title">{i18n.t('export.panel')}</h3>
      {#if template}
        <p class="sub">{i18n.t('export.withTemplate', { name: template.name[lang] })}</p>
      {/if}
    </header>

    {#if !info.compiler}
      <Callout tone="danger">{i18n.t('export.noCompiler')}</Callout>
    {/if}

    <!-- What the last export did comes first: it is what the writer is waiting for. -->
    {#if result}
      <div class="result" role="status" aria-live="polite">
        {#if result.ok}
          <p class="done">
            <span class="mark ok"><Icon name="circle-check" size={16} /></span>
            <span>
              {i18n.t('export.done', { path: result.path })}
              {#if result.pages !== null}· {i18n.t('export.pages', { count: result.pages })}{/if}
            </span>
          </p>
        {:else if result.reason === 'no_compiler'}
          <Callout tone="danger">{i18n.t('export.noCompiler')}</Callout>
        {:else if result.reason === 'failed'}
          <Callout tone="danger">{i18n.t('export.failed')}</Callout>
        {/if}
        {#if result.diagnostics.length > 0}
          <ul class="diagnostics">
            {#each result.diagnostics as d, index (index)}
              <li class={d.severity}>
                {#if d.sheet}
                  <Link onclick={() => void exporting.goTo(d.sheet!, d.line)}>
                    {project.sheetLabel(d.sheet)} · {i18n.t('export.line', { line: d.line })}
                  </Link>
                {:else}
                  <span class="where">{i18n.t('export.template')}</span>
                {/if}
                <span class="message selectable">{d.message}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    {#if template}
      <Section title={i18n.t('export.layout')} level={4}>
        <Form labels="start">
          <FormRow label={i18n.t('export.binding')} for="export-binding">
            <DocumentField field="binding" id="export-binding" />
          </FormRow>
          {#each offered as option (option.id)}
            {#if option.type !== 'bool'}
              <FormRow label={option.label[lang]} for="export-option-{option.id}">
                <DocumentField field="option:{option.id}" id="export-option-{option.id}" />
              </FormRow>
            {/if}
          {/each}
          <span></span>
          <div class="checks">
            <DocumentField field="hyphenate" id="export-hyphenate" named />
          </div>
        </Form>
      </Section>

      {#if offered.some((o) => o.type === 'bool')}
        <Section title={i18n.t('export.parts')} level={4}>
          <Form labels="start">
            <span></span>
            <div class="checks">
              {#each offered as option (option.id)}
                {#if option.type === 'bool'}
                  <DocumentField field="option:{option.id}" id="export-option-{option.id}" named />
                {/if}
              {/each}
            </div>
          </Form>
        </Section>
      {/if}
    {/if}

    <!-- The colours of the template, which the elements name (the accent of headings, links). -->
    <Section title={i18n.t('export.colours')} level={4}>
      {#if exporting.detail?.builtin}
        <ReadonlyNote />
      {/if}
      <div class="palette"><PropertiesPanel only="palette" /></div>
    </Section>

    <Section title={i18n.t('export.content')} level={4}>
      <Form labels="start">
        <FormRow label={i18n.t('export.citationStyle')} for="export-style">
          <DocumentField field="citationStyle" id="export-style" />
        </FormRow>
        <FormRow label={i18n.t('export.marks')} for="export-marks">
          <Select
            id="export-marks"
            bind:value={profile.marks}
            options={[
              { value: 'hide', label: i18n.t('export.marks.hide') },
              { value: 'show', label: i18n.t('export.marks.show') },
            ]}
            disabled={exporting.busy}
          />
        </FormRow>
        <FormRow label={i18n.t('export.comments')} for="export-comments">
          <Select
            id="export-comments"
            bind:value={profile.comments}
            options={[
              { value: 'remove', label: i18n.t('export.comments.remove') },
              { value: 'footnote', label: i18n.t('export.comments.footnote') },
            ]}
            disabled={exporting.busy}
          />
        </FormRow>
      </Form>
    </Section>

    {#if warnings}
      <Section title={i18n.t('export.warnings')} level={4}>
        {#if !anyOpen}
          <p class="quiet">{i18n.t('export.none')}</p>
        {:else}
          <ul class="open">
            {#if warnings.comments > 0}
              <li>
                {@render flag()}
                <span>{i18n.t('export.warn.comments', { count: warnings.comments })}</span>
              </li>
            {/if}
            {#if warnings.missingCitations > 0}
              <li>
                {@render flag()}
                <span>{i18n.t('export.warn.missing', { count: warnings.missingCitations })}</span>
              </li>
            {/if}
            {#if warnings.checks > 0}
              <li>
                {@render flag()}
                <span>{i18n.t('export.warn.checks', { count: warnings.checks })}</span>
              </li>
            {/if}
            {#if warnings.noAuthors}
              <li>
                {@render flag()}
                <Link onclick={() => void exporting.goToTitelei()}>
                  {i18n.t('export.warn.noAuthors')}
                  · {i18n.t('titelei.title')}
                </Link>
              </li>
            {/if}
            {#each warnings.unknownCitations as citation, index (index)}
              <li>
                {@render flag()}
                <Link onclick={() => void exporting.goTo(citation.sheet, citation.line)}>
                  {i18n.t('export.warn.unknown', { key: citation.key })}
                  · {project.sheetLabel(citation.sheet)}
                </Link>
              </li>
            {/each}
            {#each warnings.emptyImages as image, index (index)}
              <li>
                {@render flag()}
                <Link onclick={() => void exporting.goTo(image.sheet, image.line)}>
                  {i18n.t('export.warn.emptyImage')}
                  · {project.sheetLabel(image.sheet)}
                </Link>
              </li>
            {/each}
            {#each exporting.fontIssues as problem, index (index)}
              <li>
                {@render flag()}
                <Link onclick={() => (exporting.elementId = problem.element)}>
                  {i18n.t('export.warn.font', {
                    element: elementById(problem.element)?.[lang] ?? problem.element,
                    problem: fontProblemText(problem),
                  })}
                </Link>
              </li>
            {/each}
            {#each warnings.references as reference, index (index)}
              <li>
                {@render flag()}
                <Link onclick={() => void exporting.goTo(reference.sheet, reference.line)}>
                  {i18n.t('export.warn.reference', { label: reference.label })}
                  · {project.sheetLabel(reference.sheet)}
                </Link>
              </li>
            {/each}
          </ul>
        {/if}
      </Section>
    {/if}
  </section>
{/if}

<style>
  /* The margin at the right is the template's panels': the place of their way back to a value. */
  .panel {
    min-width: 0;
    padding-right: var(--sp-24);
  }
  /* The name of the panel and the template it is for stay in sight while the rest scrolls under
     them, a hairline below: the head of every panel of the dialog. */
  .head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    margin-right: calc(-1 * var(--sp-24));
    padding: 0 var(--sp-24) var(--sp-12) 0;
    background: var(--color-window);
    color: var(--color-label-secondary);
  }
  .head::after {
    content: '';
    position: absolute;
    right: var(--sp-24);
    bottom: 0;
    left: 0;
    border-bottom: 1px solid var(--color-separator);
  }
  .head + :global(*) {
    margin-top: var(--sp-16);
  }
  .title {
    flex: none;
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
  }
  .sub {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--color-label-secondary);
    font: var(--type-body);
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mark {
    display: inline-flex;
    flex: none;
    color: var(--color-warning);
  }
  .mark.ok {
    color: var(--color-success);
  }
  .panel > :global(.callout) {
    margin-bottom: var(--sp-16);
  }
  /* A section the footer leads to comes to rest under the head, not behind it. */
  .panel :global(.section) {
    scroll-margin-top: calc(var(--sp-32) + var(--sp-8));
  }
  /* The first section follows the head or what is said under it: no space above it. */
  .head + :global(.section),
  .result + :global(.section),
  .panel > :global(.callout) + :global(.section) {
    padding-top: 0;
  }
  /* The colours bring a section of their own: its space below is the outer section's. */
  .palette :global(.section:last-child) {
    padding-bottom: 0;
  }
  /* The names and the fields stand where the template's properties have theirs, on every panel. */
  .panel :global(.form) {
    grid-template-columns: calc(var(--form-label-width) + var(--sp-32) + var(--sp-8)) minmax(
        0,
        1fr
      );
  }
  .checks {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-8);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--color-label);
    font: var(--type-body);
  }
  .open li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-8);
  }
  .open .mark {
    padding-top: 1px;
  }
  .quiet,
  .where {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    padding-bottom: var(--sp-16);
    border-bottom: 1px solid var(--color-separator);
    margin-bottom: var(--sp-16);
  }
  .done {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-8);
    margin: 0;
    color: var(--color-label);
    font: var(--type-body);
    overflow-wrap: anywhere;
  }
  .done .mark {
    padding-top: 1px;
  }
  .diagnostics {
    gap: var(--sp-8);
  }
  .diagnostics li.error .message {
    color: var(--color-danger);
  }
  .message {
    display: block;
    overflow-wrap: anywhere;
  }
</style>
