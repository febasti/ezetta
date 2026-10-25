<script lang="ts">
  import { i18n } from '../i18n/i18n.svelte'
  import { dismissNotice, ui } from '../lib/ui.svelte'
  import Icon from './Icon.svelte'
  import IconButton from './kit/IconButton.svelte'
</script>

<!-- A short message at the foot of the window, above the status bar; an error has its mark. -->
{#if ui.notice}
  <div
    class="toast"
    class:error={ui.notice.kind === 'error'}
    role={ui.notice.kind === 'error' ? 'alert' : 'status'}
  >
    {#if ui.notice.kind === 'error'}<span class="mark"><Icon name="warning" size={16} /></span>{/if}
    <span class="text">{ui.notice.text}</span>
    <IconButton icon="x" size="sm" label={i18n.t('notice.dismiss')} onclick={dismissNotice} />
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    right: var(--sp-16);
    bottom: calc(var(--statusbar-height) + var(--sp-16));
    z-index: 300;
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    max-width: 440px;
    padding: var(--sp-8) var(--sp-8) var(--sp-8) var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    color: var(--color-label);
    font: var(--type-body);
  }
  .mark {
    display: inline-flex;
    flex: none;
    color: var(--color-danger);
  }
  .text {
    min-width: 0;
  }
</style>
