<script lang="ts">
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A few settings that are each on or off, as cards in a row, each an icon above a short name: the
   * ones that are on stand in the accent, as the chosen card of `ChoiceCards` does. Each card is a
   * checkbox, named in full for screen readers and as its tooltip (`name`), so a short `label` is
   * enough on the card. For settings that need a sentence, use a `Switch` or a `Checkbox`.
   */
  interface Option {
    key: string
    label: string
    /** The full name, for the tooltip and for screen readers. */
    name: string
    icon: IconName
    checked: boolean
  }
  interface Props {
    options: readonly Option[]
    label: string
    disabled?: boolean
    onchange: (key: string, checked: boolean) => void
  }
  let { options, label, disabled = false, onchange }: Props = $props()
</script>

<div class="cards" role="group" aria-label={label}>
  {#each options as option (option.key)}
    <label class="card" class:on={option.checked} class:disabled title={option.name}>
      <input
        type="checkbox"
        aria-label={option.name}
        checked={option.checked}
        {disabled}
        onchange={(event) => onchange(option.key, event.currentTarget.checked)}
      />
      <Icon name={option.icon} size={20} />
      <span>{option.label}</span>
    </label>
  {/each}
</div>

<style>
  .cards {
    display: flex;
    gap: var(--sp-8);
  }
  .card {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
    padding: var(--sp-8);
    border-radius: var(--r-md);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-body);
    text-align: center;
    cursor: default;
    transition: background var(--duration);
  }
  .card:hover:not(.on, .disabled) {
    background: var(--color-control-hover);
  }
  .card.on {
    background: var(--color-selection);
    color: var(--color-accent);
    font: var(--type-emphasis);
  }
  .card.disabled {
    color: var(--color-label-tertiary);
  }
  /* The box is the whole card, not seen: a click anywhere on the card is a click on it. */
  input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: default;
  }
  .card:has(input:focus-visible) {
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
