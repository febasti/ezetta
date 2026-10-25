<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A small question, as the system's alerts: a title, what it is about, maybe a field, and its
   * buttons at the right (the main one last). No header and no ×; Escape answers "no". It opens
   * high in the window, over a light scrim, above any dialog.
   */
  interface Props {
    title: string
    /** `alertdialog` for a question that needs an answer before anything else. */
    role?: 'dialog' | 'alertdialog'
    message?: string
    onescape: () => void
    actions: Snippet
    children?: Snippet
  }
  let { title, role = 'dialog', message, onescape, actions, children }: Props = $props()
  const id = `alert-${Math.random().toString(36).slice(2, 8)}`
</script>

<svelte:window
  onkeydowncapture={(event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onescape()
    }
  }}
/>

<div class="scrim">
  <div
    class="alert"
    {role}
    aria-modal="true"
    aria-labelledby="{id}-title"
    aria-describedby={message ? `${id}-message` : undefined}
  >
    <h2 id="{id}-title">{title}</h2>
    {#if message}<p id="{id}-message">{message}</p>{/if}
    {#if children}{@render children()}{/if}
    <div class="actions">{@render actions()}</div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-confirm);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 18vh var(--sp-24) var(--sp-24);
    background: color-mix(in srgb, var(--color-label) 8%, transparent);
  }
  .alert {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    width: 380px;
    max-width: 100%;
    padding: var(--inset-dialog);
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    color: var(--color-label);
    font: var(--type-body);
  }
  h2 {
    margin: 0;
    font: var(--type-title);
  }
  p {
    margin: 0;
    color: var(--color-label-secondary);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-8);
    margin-top: var(--sp-8);
  }
</style>
