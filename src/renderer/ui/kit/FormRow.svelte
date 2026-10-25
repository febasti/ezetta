<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * One row of a `Form`: its label (tied to the control by `for`), the control, and an optional hint
   * under the control in the secondary label colour.
   */
  interface Props {
    label: string
    /** The id of the control the label names. */
    for?: string
    hint?: string
    children: Snippet
  }
  let { label, for: control, hint, children }: Props = $props()
</script>

<label class="label" for={control}>{label}</label>
<div class="control">
  {@render children()}
  {#if hint}<p class="hint">{hint}</p>{/if}
</div>

<style>
  .label {
    align-self: start;
    padding-top: calc((var(--control-md) - 18px) / 2);
    color: var(--color-label);
    font: var(--type-body);
    text-align: right;
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-width: 0;
  }
  .hint {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
</style>
