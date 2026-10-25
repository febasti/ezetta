<script lang="ts" generics="T extends string">
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A choice among two to five short, equal options shown side by side (as the system's segmented
   * control): a quiet track, the chosen segment raised on it. The arrow keys move the choice. A
   * segment shows its name, or an icon or a short sample ("Aa") that stands for it; the name is then
   * its tooltip and its name for screen readers. `value` is null when nothing is chosen yet.
   */
  interface Option {
    value: T
    label: string
    icon?: IconName
    sample?: string
    /** How the sample is set. */
    sampleStyle?: 'smallcaps'
  }
  interface Props {
    value: T | null
    options: readonly Option[]
    label: string
    size?: 'sm' | 'md'
    /** As wide as its place, the segments sharing it. */
    stretch?: boolean
    disabled?: boolean
    onchange: (value: T) => void
  }
  let {
    value,
    options,
    label,
    size = 'md',
    stretch = false,
    disabled = false,
    onchange,
  }: Props = $props()

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

<div
  class="segmented {size}"
  class:stretch
  role="radiogroup"
  aria-label={label}
  tabindex="-1"
  onkeydown={onKeydown}
>
  {#each options as option, index (option.value)}
    {@const shown = option.icon !== undefined || option.sample !== undefined}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      aria-label={shown ? option.label : undefined}
      title={shown ? option.label : undefined}
      tabindex={option.value === value || (value === null && index === 0) ? 0 : -1}
      {disabled}
      onclick={() => onchange(option.value)}
    >
      {#if option.icon}
        <Icon name={option.icon} size={16} />
      {:else if option.sample !== undefined}
        <span class:smallcaps={option.sampleStyle === 'smallcaps'}>{option.sample}</span>
      {:else}
        {option.label}
      {/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    gap: 2px;
    height: var(--control-md);
    padding: 2px;
    border-radius: var(--r-md);
    background: var(--color-control);
  }
  .sm {
    height: var(--control-sm);
  }
  .stretch {
    display: flex;
    width: 100%;
  }
  button {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0 var(--sp-12);
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-label);
    font: var(--type-body);
    white-space: nowrap;
    cursor: default;
    transition: background var(--duration);
  }
  .sm button {
    padding: 0 var(--sp-8);
  }
  button:hover:not([aria-checked='true'], :disabled) {
    background: var(--color-control-hover);
  }
  button[aria-checked='true'] {
    background: var(--color-control-raised);
    box-shadow: var(--shadow-raised);
    font-weight: 500;
  }
  button:disabled {
    color: var(--color-label-tertiary);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .smallcaps {
    font-variant-caps: small-caps;
  }
</style>
