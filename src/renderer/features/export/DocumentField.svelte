<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Checkbox from '../../ui/kit/Checkbox.svelte'
  import Select from '../../ui/kit/Select.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { checkBinding } from '@core/export/profile'
  import { numberIn } from '@core/export/template'
  import { exporting } from './export.svelte'

  /**
   * One of the document's own settings: the binding offset, hyphenation, the citation style, or an
   * option of the template (the line spacing, the parts it prints). They belong to the export, not to
   * the template, so they can be changed with a template that comes with the app as well. The
   * "Dokument einrichten" panel shows them all; an element's page shows the ones about it, the same
   * control on the same value.
   */
  interface Props {
    /** `binding`, `hyphenate`, `citationStyle`, or `option:<id>`. */
    field: string
    id: string
    /** The name of the setting, for a control that has none of its own (a checkbox in a row). */
    label?: string
    /** A checkbox with its name after it, as in a list of switches. */
    named?: boolean
  }
  let { field, id, label, named = false }: Props = $props()

  const info = $derived(exporting.info)
  const profile = $derived(exporting.profile)
  const template = $derived(info?.templates.find((t) => t.id === profile?.template))
  const lang = $derived(i18n.locale)
  const option = $derived(
    field.startsWith('option:')
      ? template?.options.find((o) => o.id === field.slice('option:'.length))
      : undefined,
  )
  /** Hyphenation: the document's own choice, else what the template's body text says. */
  const hyphenate = $derived(
    profile?.hyphenate ?? exporting.resolved['body']?.['hyphenate'] === true,
  )
  /** The decimal mark of the interface's language. */
  const decimal = (text: string): string => text.replace('.', lang === 'de' ? ',' : '.')

  /** A binding offset that is not one: kept in the field, marked, and not stored. */
  let bindingRefused = $state(false)
  function setBinding(text: string): void {
    if (!profile) return
    if (text.trim() === '') {
      bindingRefused = false
      delete profile.binding
      return
    }
    const binding = checkBinding(text)
    bindingRefused = binding === null
    if (binding !== null) profile.binding = binding
  }
</script>

{#if profile}
  {#if field === 'binding'}
    <span class="short">
      <TextField
        {id}
        {label}
        value={profile.binding ?? ''}
        placeholder="0 cm"
        invalid={bindingRefused}
        disabled={exporting.busy}
        onchange={(e) => setBinding((e.currentTarget as HTMLInputElement).value)}
      />
    </span>
    {#if bindingRefused}
      <p class="refused" role="alert">{i18n.t('export.binding.invalid')}</p>
    {/if}
  {:else if field === 'hyphenate'}
    <Checkbox
      {id}
      label={named ? undefined : label}
      checked={hyphenate}
      disabled={exporting.busy}
      onchange={(on) => (profile.hyphenate = on)}
    >
      {#if named}{i18n.t('export.hyphenate')}{/if}
    </Checkbox>
  {:else if field === 'citationStyle' && info}
    <Select
      {id}
      {label}
      bind:value={profile.citationStyle}
      options={info.styles.map((s) => ({ value: s.id, label: s.label }))}
      disabled={exporting.busy}
    />
  {:else if option?.type === 'enum'}
    <Select
      {id}
      {label}
      value={String(profile.options[option.id] ?? option.default)}
      options={option.values.map((v) => ({ value: v.id, label: v.label[lang] }))}
      disabled={exporting.busy}
      onchange={(v) => (profile.options[option.id] = v)}
    />
  {:else if option?.type === 'number'}
    {@const typed = String(profile.options[option.id] ?? option.default)}
    <!-- A number (the line spacing): a value outside its bounds is marked and not used. -->
    <span class="short">
      <TextField
        {id}
        {label}
        value={decimal(typed)}
        inputmode="numeric"
        invalid={numberIn(typed, option.min, option.max) === null}
        disabled={exporting.busy}
        onvalue={(v) => (profile.options[option.id] = numberIn(v, option.min, option.max) ?? v)}
      />
    </span>
    {#if numberIn(typed, option.min, option.max) === null}
      <p class="refused" role="alert">
        {i18n.t('export.number.invalid', {
          min: decimal(String(option.min)),
          max: decimal(String(option.max)),
        })}
      </p>
    {/if}
  {:else if option?.type === 'bool'}
    <Checkbox
      {id}
      label={named ? undefined : label}
      checked={profile.options[option.id] === true ||
        (profile.options[option.id] === undefined && option.default)}
      disabled={exporting.busy}
      onchange={(on) => (profile.options[option.id] = on)}
    >
      {#if named}{option.label[lang]}{/if}
    </Checkbox>
  {:else if option}
    <TextField
      {id}
      {label}
      value={String(profile.options[option.id] ?? option.default)}
      disabled={exporting.busy}
      onvalue={(v) => (profile.options[option.id] = v)}
    />
  {/if}
{/if}

<style>
  /* A number or a length is a short field, as in the template's own panels. */
  .short {
    display: block;
    width: 96px;
  }
  .short :global(.text-field) {
    width: 100%;
  }
  .refused {
    flex-basis: 100%;
    margin: 0;
    color: var(--color-danger);
    font: var(--type-caption);
  }
</style>
