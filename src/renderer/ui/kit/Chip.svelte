<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A small tag of a fact, as in the badge in the corner of the text (the status, the word count):
   * the control's quiet fill, or the selection's ground in the accent. One that does something is a
   * button (the status opens its menu).
   */
  interface Props {
    /** `accent` is the soft blue chip, `neutral` the quiet gray one. */
    tone?: 'accent' | 'neutral'
    /** A chip that does something is a button. */
    onclick?: (event: MouseEvent) => void
    title?: string
    children: Snippet
  }
  let { tone = 'neutral', onclick, title, children }: Props = $props()
</script>

{#if onclick}
  <button class="chip {tone}" type="button" {title} {onclick}>{@render children()}</button>
{:else}
  <span class="chip {tone}" {title}>{@render children()}</span>
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--control-sm);
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-sm);
    font: var(--type-body);
    white-space: nowrap;
    transition: background var(--duration);
  }
  .neutral {
    background: var(--color-control);
    color: var(--color-label-secondary);
  }
  .accent {
    background: var(--color-selection);
    color: var(--color-accent);
  }
  button.chip {
    cursor: default;
  }
  button.neutral:hover {
    background: var(--color-control-hover);
    color: var(--color-label);
  }
  button.chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
