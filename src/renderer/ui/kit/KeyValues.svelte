<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A list of facts: names on the left in the secondary label colour, their values right-aligned in
   * the label colour, with tabular figures. `KeyValue` is one fact.
   */
  interface Props {
    children: Snippet
  }
  let { children }: Props = $props()
</script>

<dl class="facts">{@render children()}</dl>

<style>
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-4) var(--sp-12);
    margin: 0;
    font: var(--type-body);
  }
</style>
