<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import Link from '../../ui/kit/Link.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { project } from '../sidebar/project.svelte'
  import { exporting } from './export.svelte'

  const info = $derived(exporting.info)
  const profile = $derived(exporting.profile)
  const template = $derived(info?.templates.find((t) => t.id === profile?.template))
  const lang = $derived(i18n.locale)
  const warnings = $derived(info?.warnings)
  const result = $derived(exporting.result)

  const anyOpen = $derived(exporting.openCount > 0)
</script>

{#if info && profile}
  <section class="panel" aria-label={i18n.t('export.panel')}>
    <h3 class="title">{i18n.t('export.panel')}</h3>

    {#if !info.compiler}
      <Callout tone="danger">{i18n.t('export.noCompiler')}</Callout>
    {/if}

    {#if template && template.options.some((o) => !o.hidden)}
      <Section title={template.name[lang]} level={4}>
        <Form stacked>
          {#each template.options.filter((o) => !o.hidden) as option (option.id)}
            {#if option.type === 'bool'}
              <Checkbox
                checked={profile.options[option.id] === true ||
                  (profile.options[option.id] === undefined && option.default)}
                disabled={exporting.busy}
                onchange={(on) => (profile.options[option.id] = on)}
              >
                {option.label[lang]}
              </Checkbox>
            {:else if option.type === 'enum'}
              <FormRow label={option.label[lang]} for="export-option-{option.id}">
                <Select
                  id="export-option-{option.id}"
                  value={String(profile.options[option.id] ?? option.default)}
                  options={option.values.map((v) => ({ value: v.id, label: v.label[lang] }))}
                  disabled={exporting.busy}
                  onchange={(v) => (profile.options[option.id] = v)}
                />
              </FormRow>
            {:else}
              <FormRow label={option.label[lang]} for="export-option-{option.id}">
                <TextField
                  id="export-option-{option.id}"
                  value={String(profile.options[option.id] ?? option.default)}
                  disabled={exporting.busy}
                  onvalue={(v) => (profile.options[option.id] = v)}
                />
              </FormRow>
            {/if}
          {/each}
        </Form>
      </Section>
    {/if}

    <Section title={i18n.t('export.content')} level={4}>
      <Form stacked>
        <FormRow label={i18n.t('export.citationStyle')} for="export-style">
          <Select
            id="export-style"
            bind:value={profile.citationStyle}
            options={info.styles.map((s) => ({ value: s.id, label: s.label }))}
            disabled={exporting.busy}
          />
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
          <ul>
            {#if warnings.comments > 0}
              <li>{i18n.t('export.warn.comments', { count: warnings.comments })}</li>
            {/if}
            {#if warnings.missingCitations > 0}
              <li>{i18n.t('export.warn.missing', { count: warnings.missingCitations })}</li>
            {/if}
            {#if warnings.checks > 0}
              <li>{i18n.t('export.warn.checks', { count: warnings.checks })}</li>
            {/if}
            {#each warnings.unknownCitations as citation, index (index)}
              <li>
                <Link onclick={() => void exporting.goTo(citation.sheet, citation.line)}>
                  {i18n.t('export.warn.unknown', { key: citation.key })}
                  · {project.sheetLabel(citation.sheet)}
                </Link>
              </li>
            {/each}
            {#each warnings.emptyImages as image, index (index)}
              <li>
                <Link onclick={() => void exporting.goTo(image.sheet, image.line)}>
                  {i18n.t('export.warn.emptyImage')}
                  · {project.sheetLabel(image.sheet)}
                </Link>
              </li>
            {/each}
            {#each warnings.references as reference, index (index)}
              <li>
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

    {#if result}
      <div class="result" role="status" aria-live="polite">
        {#if result.ok}
          <p class="done">
            {i18n.t('export.done', { path: result.path })}
            {#if result.pages !== null}· {i18n.t('export.pages', { count: result.pages })}{/if}
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
  </section>
{/if}

<style>
  .panel {
    min-width: 0;
  }
  .title {
    margin: 0 0 var(--sp-16);
    color: var(--color-label);
    font: var(--type-title);
  }
  .panel > :global(.callout) {
    margin-bottom: var(--sp-16);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--color-label);
    font: var(--type-body);
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
    padding: var(--sp-16) 0;
    border-top: 1px solid var(--color-separator);
  }
  .done {
    margin: 0;
    color: var(--color-label);
    font: var(--type-body);
    overflow-wrap: anywhere;
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
