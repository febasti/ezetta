<script lang="ts">
  import { hasItalic } from '@core/export/fonts'
  import type { FontFamily } from '@core/export/fonts'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * The font of an element: a field to type a family into, with the families the compiler finds
   * (its own and the system's) in a list below it while the field has the focus, each shown in its
   * own face, with its weights and whether it has an italic. Typing narrows the list; a click, or
   * Return on a highlighted one, chooses it; Return or leaving the field takes what is typed.
   */
  interface Props {
    id: string
    value: string
    families: readonly FontFamily[]
    placeholder?: string
    invalid?: boolean
    disabled?: boolean
    /** A family chosen, or a name typed (empty: back to the inherited one). */
    oncommit: (text: string) => void
  }
  let {
    id,
    value,
    families,
    placeholder,
    invalid = false,
    disabled = false,
    oncommit,
  }: Props = $props()

  /** At most this many families are drawn at once: typing finds the others. */
  const SHOWN = 150

  let text = $state('')
  let typed = $state(false)
  let open = $state(false)
  let active = $state(-1)
  // The field shows the value until the writer types.
  $effect(() => {
    text = value
    typed = false
  })

  const matches = $derived.by(() => {
    const query = typed ? text.trim().toLowerCase() : ''
    const found =
      query === '' ? families : families.filter((f) => f.name.toLowerCase().includes(query))
    return found.slice(0, SHOWN)
  })
  const listId = $derived(`${id}-families`)

  /** What a family has: its weights (a range for a variable font), an italic, and small caps. */
  function summary(family: FontFamily): string {
    const low = Math.min(...family.variants.map((v) => v.weight[0]))
    const high = Math.max(...family.variants.map((v) => v.weight[1]))
    const weights = low === high ? `${low}` : `${low}–${high}`
    return [
      weights,
      ...(hasItalic(family) ? [i18n.t('templates.font.italic')] : []),
      ...(family.smallCaps === 'yes' ? [i18n.t('templates.font.smallCaps')] : []),
    ].join(' · ')
  }

  function choose(name: string): void {
    text = name
    typed = false
    open = false
    active = -1
    if (name !== value) oncommit(name)
  }

  function commitTyped(): void {
    open = false
    active = -1
    if (typed && text.trim() !== value) oncommit(text.trim())
    typed = false
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      open = true
      const step = event.key === 'ArrowDown' ? 1 : -1
      active = Math.max(0, Math.min(matches.length - 1, active + step))
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = matches[active]
      if (open && picked) choose(picked.name)
      else commitTyped()
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      open = false
      text = value
      typed = false
    }
  }
</script>

<div class="picker">
  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a combo box: the field and its list belong together -->
  <input
    class="field"
    {id}
    role="combobox"
    aria-expanded={open}
    aria-controls={listId}
    aria-autocomplete="list"
    aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
    aria-invalid={invalid || undefined}
    autocomplete="off"
    spellcheck="false"
    {placeholder}
    {disabled}
    value={text}
    oninput={(event) => {
      text = event.currentTarget.value
      typed = true
      open = true
      active = -1
    }}
    onfocus={() => (open = !disabled)}
    onblur={commitTyped}
    onkeydown={keydown}
  />
  {#if open && matches.length > 0}
    <ul class="list" id={listId} role="listbox">
      {#each matches as family, index (family.name)}
        <!-- The press is taken before the field loses the focus, so the choice is not lost. -->
        <li
          id="{listId}-{index}"
          role="option"
          aria-selected={family.name === value}
          class:active={index === active}
          onmousedown={(event) => {
            event.preventDefault()
            choose(family.name)
          }}
        >
          <span class="name" style:font-family="'{family.name}'">{family.name}</span>
          <span class="variants">{summary(family)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  .field {
    width: 100%;
    min-width: 0;
    height: var(--control-md);
    padding: 0 var(--sp-8);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    color: var(--color-label);
    font: var(--type-body);
  }
  .field::placeholder {
    color: var(--color-label-tertiary);
  }
  .field:focus {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .field[aria-invalid='true'] {
    border-color: var(--color-danger);
  }
  .field:disabled {
    background: var(--color-panel);
    color: var(--color-label-tertiary);
  }
  .list {
    position: absolute;
    z-index: 10;
    top: calc(100% + var(--sp-4));
    right: 0;
    left: 0;
    max-height: 280px;
    margin: 0;
    padding: var(--sp-4);
    overflow-y: auto;
    border-radius: var(--r-md);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    list-style: none;
  }
  li {
    display: flex;
    flex-direction: column;
    padding: var(--sp-4) var(--sp-8);
    border-radius: var(--r-sm);
    cursor: default;
  }
  li:hover,
  li.active {
    background: var(--color-control-hover);
  }
  li[aria-selected='true'] .name {
    color: var(--color-accent);
  }
  .name {
    overflow: hidden;
    color: var(--color-label);
    /* The family is drawn in its own face (set on the element), at the size of the text. */
    font: var(--type-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .variants {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
