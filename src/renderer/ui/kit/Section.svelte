<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A section of a pane or a dialog: an optional heading in the emphasis role, its content, and a
   * hairline between it and the section before. Sections are how content is grouped; there are no
   * cards for grouping. A section with a title is a named region for screen readers, unless `region`
   * is false (a group of fields, whose title would be one name more among the fields' labels).
   * `level` is the heading's level under what stands above it.
   */
  interface Props {
    title?: string
    level?: 3 | 4
    region?: boolean
    /** Something at the end of the heading's line (a count, a small button). */
    action?: Snippet
    children: Snippet
  }
  let { title, level = 3, region = true, action, children }: Props = $props()
</script>

<section class="section" aria-label={region ? title : undefined}>
  {#if title || action}
    <header>
      {#if title}<svelte:element this={`h${level}`} class="heading">{title}</svelte:element>{/if}
      {#if action}<span class="action">{@render action()}</span>{/if}
    </header>
  {/if}
  {@render children()}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    padding: var(--sp-16) 0;
  }
  .section + :global(.section) {
    border-top: 1px solid var(--color-separator);
  }
  .section:first-child {
    padding-top: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    min-height: var(--control-sm);
  }
  .heading {
    margin: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
  }
  .action {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
