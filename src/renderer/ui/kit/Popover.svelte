<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * The shell of what floats by a place (a picker, an editor at the caret, a card on hover): the
   * window's ground, the large radius, the float shadow, the pane inset. It does not place itself;
   * whoever opens it does. `title` adds a small heading.
   */
  interface Props {
    title?: string
    width?: 'narrow' | 'medium'
    children: Snippet
  }
  let { title, width = 'medium', children }: Props = $props()
</script>

<div class="popover {width}">
  {#if title}<h3>{title}</h3>{/if}
  {@render children()}
</div>

<style>
  .popover {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    max-width: 100%;
    padding: var(--sp-12) var(--inset-pane);
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    color: var(--color-label);
    font: var(--type-body);
  }
  .narrow {
    width: 260px;
  }
  .medium {
    width: 340px;
  }
  h3 {
    margin: 0;
    font: var(--type-emphasis);
  }
</style>
