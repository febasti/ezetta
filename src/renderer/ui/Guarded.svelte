<script lang="ts">
  import type { Snippet } from 'svelte'
  import { i18n } from '../i18n/i18n.svelte'
  import { notify } from '../lib/ui.svelte'
  import Button from './kit/Button.svelte'
  import EmptyState from './kit/EmptyState.svelte'

  /**
   * Keeps an error in one part of the window from taking the rest with it. An error while a part
   * is drawn would otherwise leave the whole window standing still.
   *
   * A `pane` (a column, the editor area) shows in its place that it could not be shown, with a way
   * to try again. Anything else (a dialog) is closed by `onfail`, says so in a notice, and can be
   * opened again; one that fails again at once stays away, so it cannot fail for ever.
   */
  interface Props {
    pane?: boolean
    onfail?: () => void
    children: Snippet
  }
  let { pane = false, onfail, children }: Props = $props()

  let lastFailure = 0

  function caught(error: unknown, reset: () => void): void {
    // The main process writes the page's errors to the log.
    console.error(error)
    if (pane) return
    notify('error', i18n.t('failure.dialog'))
    onfail?.()
    const again = Date.now() - lastFailure < 2000
    lastFailure = Date.now()
    if (!again) setTimeout(reset)
  }
</script>

<svelte:boundary onerror={caught}>
  {@render children()}
  {#snippet failed(_error, reset)}
    {#if pane}
      <div class="failed">
        <EmptyState icon="warning" title={i18n.t('failure.title')} text={i18n.t('failure.text')}>
          {#snippet action()}
            <Button onclick={reset}>{i18n.t('failure.retry')}</Button>
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  {/snippet}
</svelte:boundary>

<style>
  .failed {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }
</style>
