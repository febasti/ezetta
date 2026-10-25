<script lang="ts">
  import type { Snippet } from 'svelte'
  import IconButton from './IconButton.svelte'

  /**
   * A dialog: the window's ground with the large radius and the float shadow, over a light scrim.
   * One header everywhere (the title, an optional action, the × at the far right), the body, and an
   * optional footer with its buttons at the right (the main one last). Escape and the × close it
   * (`onescape` when Escape means something else, such as discarding a change). It opens near the
   * top of the window, or in the middle (`position="center"`). `inline` draws it in place, without
   * the scrim (the gallery).
   */
  interface Props {
    title: string
    closeLabel: string
    onclose: () => void
    /** `workspace`: nearly the whole window, for a dialog that is a place to work (the templates). */
    width?: 'narrow' | 'medium' | 'wide' | 'workspace'
    /** `tall` for a dialog whose columns scroll on their own (the versions); `workspace` as high as
     * the window allows. */
    height?: 'auto' | 'tall' | 'workspace'
    position?: 'top' | 'center'
    onescape?: () => void
    inline?: boolean
    headerAction?: Snippet
    footer?: Snippet
    children: Snippet
  }
  let {
    title,
    closeLabel,
    onclose,
    width = 'medium',
    height = 'auto',
    position = 'top',
    onescape,
    inline = false,
    headerAction,
    footer,
    children,
  }: Props = $props()

  const titleId = `dialog-${Math.random().toString(36).slice(2, 8)}`

  /** On opening, the focus moves into the dialog (to itself, unless something in it took it). */
  function focusIn(node: HTMLElement): void {
    if (inline) return
    queueMicrotask(() => {
      if (!node.contains(document.activeElement)) node.focus()
    })
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (!inline && event.key === 'Escape') (onescape ?? onclose)()
  }}
/>

{#snippet panel()}
  <div
    class="dialog {width} {height === 'workspace' ? 'height-workspace' : height}"
    class:inline
    role="dialog"
    aria-modal={!inline}
    aria-labelledby={titleId}
    tabindex="-1"
    use:focusIn
  >
    <header>
      <h2 id={titleId}>{title}</h2>
      {#if headerAction}<span class="action">{@render headerAction()}</span>{/if}
      <IconButton icon="x" label={closeLabel} onclick={onclose} />
    </header>
    <div class="body">{@render children()}</div>
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </div>
{/snippet}

{#if inline}
  {@render panel()}
{:else}
  <div
    class="scrim {position}"
    role="presentation"
    onmousedown={(event) => {
      if (event.target === event.currentTarget) onclose()
    }}
  >
    {@render panel()}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 12vh var(--sp-24) var(--sp-24);
    background: color-mix(in srgb, var(--color-label) 12%, transparent);
  }
  .scrim.center {
    align-items: center;
    padding-top: var(--sp-24);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    outline: none;
  }
  .narrow {
    width: 380px;
  }
  .medium {
    width: 560px;
  }
  .wide {
    width: 880px;
  }
  .tall {
    height: 80vh;
  }
  .dialog.workspace {
    width: 1480px;
  }
  .height-workspace {
    height: 900px;
  }
  header {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--sp-12) var(--sp-8) var(--inset-dialog);
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--color-label);
    font: var(--type-title);
  }
  .action {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-8) var(--inset-dialog) var(--inset-dialog);
  }
  footer {
    display: flex;
    flex: none;
    justify-content: flex-end;
    gap: var(--sp-8);
    padding: var(--sp-12) var(--inset-dialog);
    border-top: 1px solid var(--color-separator);
  }
</style>
