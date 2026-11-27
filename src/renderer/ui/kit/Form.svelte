<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A form: rows of a name on the left, in a column of its own, and the control on the right. The
   * names stand flush left, so every row of a form, a panel or a dialog starts on one edge.
   * `stacked` puts each name above its control instead, for a narrow dialog or a single field.
   * `FormRow` is one row; a row without a name (a checkbox, whose name stands after it) leaves the
   * first column empty.
   */
  interface Props {
    /** The width of the label column. */
    labelWidth?: 'narrow' | 'wide'
    stacked?: boolean
    children: Snippet
  }
  let { labelWidth = 'narrow', stacked = false, children }: Props = $props()
</script>

<div class="form {labelWidth}" class:stacked>
  {@render children()}
</div>

<style>
  .form {
    display: grid;
    grid-template-columns: var(--form-label-width) minmax(0, 1fr);
    gap: var(--sp-12) var(--sp-12);
    align-items: center;
  }
  .wide {
    grid-template-columns: calc(var(--form-label-width) * 1.5) minmax(0, 1fr);
  }
  .stacked {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
  }
  .stacked > :global(label) {
    padding-top: 0;
  }
  .stacked > :global(label:not(:first-child)) {
    margin-top: var(--sp-8);
  }
</style>
