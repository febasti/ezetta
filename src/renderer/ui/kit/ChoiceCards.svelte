<script lang="ts" generics="T extends string">
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A choice among a few options that deserve more room than a segmented control: each is a card
   * with an icon above its name, the chosen one in the accent. The arrow keys move the
   * choice. `value` is null when nothing is chosen (for example while a setting overrides it).
   */
  interface Option {
    value: T
    label: string
    icon: IconName
  }
  interface Props {
    value: T | null
    options: readonly Option[]
    label: string
    disabled?: boolean
    onchange: (value: T) => void
  }
  let { value, options, label, disabled = false, onchange }: Props = $props()

  function onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    if (disabled) return
    const at = options.findIndex((o) => o.value === value)
    const to = options[(at + step + options.length) % options.length]
    if (to) onchange(to.value)
  }
</script>

<div class="cards" role="radiogroup" aria-label={label} tabindex="-1" onkeydown={onKeydown}>
  {#each options as option, index (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      tabindex={option.value === value || (value === null && index === 0) ? 0 : -1}
      {disabled}
      onclick={() => onchange(option.value)}
    >
      <Icon name={option.icon} size={20} />
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .cards {
    display: flex;
    gap: var(--sp-8);
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    min-width: 72px;
    padding: var(--sp-8) var(--sp-12);
    border: 0;
    border-radius: var(--r-md);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-body);
    cursor: default;
    transition: background var(--duration);
  }
  button:hover:not([aria-checked='true'], :disabled) {
    background: var(--color-control-hover);
  }
  button[aria-checked='true'] {
    background: var(--color-selection);
    color: var(--color-accent);
    font: var(--type-emphasis);
  }
  button:disabled {
    color: var(--color-label-tertiary);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
