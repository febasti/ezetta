<script lang="ts" generics="T extends string">
  /**
   * A choice among a few options that each need a word of explanation: the system's radio buttons,
   * one per line, with the option's name and a hint under it. The group is named by `label` (for
   * screen readers; the form row shows its own label beside it).
   */
  interface Option {
    value: T
    label: string
    hint?: string
  }
  interface Props {
    value: T
    options: readonly Option[]
    label: string
    name: string
    onchange: (value: T) => void
  }
  let { value, options, label, name, onchange }: Props = $props()
</script>

<fieldset class="radios">
  <legend class="sr-only">{label}</legend>
  {#each options as option (option.value)}
    <label class="option">
      <input
        type="radio"
        {name}
        value={option.value}
        checked={value === option.value}
        onchange={() => onchange(option.value)}
      />
      <span class="text">
        <span class="name">{option.label}</span>
        {#if option.hint}<span class="hint">{option.hint}</span>{/if}
      </span>
    </label>
  {/each}
</fieldset>

<style>
  .radios {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    margin: 0;
    padding: 0;
    border: 0;
  }
  .option {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-8);
    color: var(--color-label);
    font: var(--type-body);
  }
  input {
    flex: none;
    width: 14px;
    height: 14px;
    margin: 2px 0 0;
    accent-color: var(--color-accent);
  }
  input:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .hint {
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
</style>
