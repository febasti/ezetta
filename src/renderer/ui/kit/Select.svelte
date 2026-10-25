<script lang="ts" generics="T extends string">
  import Icon from '../Icon.svelte'

  /**
   * A choice among a few named values, as the system's pop-up button: the chosen name on a quiet
   * fill with up-and-down chevrons; the list itself is the system's own.
   */
  interface Option {
    value: T
    label: string
  }
  interface Props {
    value: T
    options: readonly Option[]
    label?: string
    id?: string
    size?: 'sm' | 'md'
    disabled?: boolean
    onchange?: (value: T) => void
  }
  let {
    value = $bindable(),
    options,
    label,
    id,
    size = 'md',
    disabled = false,
    onchange,
  }: Props = $props()
</script>

<span class="select {size}">
  <select
    {id}
    {disabled}
    aria-label={label}
    bind:value
    onchange={(event) => onchange?.(event.currentTarget.value as T)}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
  <span class="chevrons" aria-hidden="true">
    <Icon name="selector" size={size === 'sm' ? 12 : 14} />
  </span>
</span>

<style>
  .select {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }
  select {
    width: 100%;
    min-width: 0;
    height: var(--control-md);
    padding: 0 calc(var(--sp-8) + var(--sp-16)) 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: var(--color-control);
    color: var(--color-label);
    font: var(--type-body);
    appearance: none;
    cursor: default;
    transition: background var(--duration);
  }
  .sm select {
    height: var(--control-sm);
    padding-left: var(--sp-4);
  }
  select:hover:not(:disabled) {
    background: var(--color-control-hover);
  }
  select:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  select:disabled {
    opacity: 0.45;
  }
  .chevrons {
    position: absolute;
    top: 50%;
    right: var(--sp-8);
    display: inline-flex;
    color: var(--color-label-secondary);
    transform: translateY(-50%);
    pointer-events: none;
  }
</style>
