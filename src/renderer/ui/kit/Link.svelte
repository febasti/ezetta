<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A way to a place (a line of a sheet, say), in the text: the accent colour and the hand, as any
   * link, underlined under the pointer. An action is a `Button`, not this.
   */
  interface Props {
    onclick: (event: MouseEvent) => void
    children: Snippet
  }
  let { onclick, children }: Props = $props()
</script>

<button type="button" class="link" {onclick}>{@render children()}</button>

<style>
  .link {
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-accent);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
