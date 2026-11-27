<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '../../ui/Icon.svelte'

  /**
   * A section of the template's properties that opens and closes: its name, and while it is closed
   * what it holds in one line ("2 em · Fett · Kapitälchen"), so a page of many sections reads as a
   * few lines and the writer opens the one that is to change. The chevron stands before the name, as
   * it does before the name of a part of an element. It stands among the kit's sections,
   * with the same hairline between them.
   */
  interface Props {
    /** The section's name; without one it is a plain section, always open. */
    title?: string | undefined
    /** What the section sets, in a few words, shown while it is closed. */
    summary?: string
    open?: boolean
    /** Whether the name opens and closes the section (not where it stands among another panel's). */
    foldable?: boolean
    ontoggle?: (open: boolean) => void
    children: Snippet
  }
  let { title, summary = '', open = true, foldable = true, ontoggle, children }: Props = $props()
  const folds = $derived(foldable && title !== undefined)
  const shown = $derived(!folds || open)
</script>

<section class="section" class:open={shown} class:folds>
  {#if title !== undefined && !folds}
    <h4 class="heading plain">{title}</h4>
  {:else if title !== undefined}
    <h4 class="heading">
      <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a section's name that opens and closes it, a heading with its summary and chevron: the kit has no disclosure -->
      <button type="button" class="fold" aria-expanded={open} onclick={() => ontoggle?.(!open)}>
        <span class="name">
          <span class="chevron"
            ><Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} /></span
          >
          {title}
        </span>
        {#if !open}<span class="summary">{summary}</span>{/if}
      </button>
    </h4>
  {/if}
  {#if shown}{@render children()}{/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    padding: var(--sp-16) 0;
  }
  /* A section that folds has a line as high as a control for its name, so it needs less around it. */
  .section.folds {
    padding: var(--sp-8) 0;
  }
  .section.folds.open {
    padding-bottom: var(--sp-16);
  }
  .section + :global(.section) {
    border-top: 1px solid var(--color-separator);
  }
  .section:first-child {
    padding-top: 0;
  }
  .heading {
    margin: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
  }
  .heading.plain {
    display: flex;
    align-items: center;
    min-height: var(--control-sm);
  }
  /* The whole line opens and closes the section: the chevron, the name, what it holds. */
  .fold {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    width: 100%;
    min-height: var(--control-md);
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--color-label);
    font: inherit;
    text-align: left;
    cursor: default;
  }
  .fold:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  /* The name takes the column of the rows' names, so what the section holds starts where their
     controls do. */
  .name {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    width: calc(var(--form-label-width) + var(--sp-24));
  }
  .summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-label-secondary);
    font: var(--type-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    display: inline-flex;
    flex: none;
    color: var(--color-label-secondary);
  }
</style>
