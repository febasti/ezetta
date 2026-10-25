<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A switch for a setting that applies at once (as in macOS Settings); a checkbox is for a choice
   * that is confirmed later. Its label stands before it, the switch at the end of the row.
   */
  interface Props {
    checked: boolean
    disabled?: boolean
    onchange?: (checked: boolean) => void
    children: Snippet
  }
  let { checked = $bindable(), disabled = false, onchange, children }: Props = $props()
</script>

<label class="switch" class:disabled>
  <span class="label">{@render children()}</span>
  <input
    type="checkbox"
    role="switch"
    {disabled}
    bind:checked
    onchange={(event) => onchange?.(event.currentTarget.checked)}
  />
</label>

<style>
  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-12);
    min-height: var(--control-md);
    color: var(--color-label);
    font: var(--type-body);
  }
  .label {
    min-width: 0;
  }
  input {
    position: relative;
    flex: none;
    width: 30px;
    height: 18px;
    margin: 0;
    border-radius: 9px;
    background: var(--color-control-pressed);
    appearance: none;
    cursor: default;
    transition: background var(--duration);
  }
  input::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-window);
    box-shadow: var(--shadow-raised);
    transition: transform var(--duration);
  }
  input:checked {
    background: var(--color-accent);
  }
  input:checked::after {
    transform: translateX(12px);
  }
  input:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .disabled {
    color: var(--color-label-tertiary);
  }
  .disabled input {
    opacity: 0.45;
  }
</style>
