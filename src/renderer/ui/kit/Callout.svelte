<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'

  /**
   * A note that stands apart from what is around it: a hint, a warning, a problem. The only grey box
   * of the foundation; grouping is done with sections, never with boxes.
   */
  interface Props {
    tone?: 'info' | 'warning' | 'danger'
    children: Snippet
  }
  let { tone = 'info', children }: Props = $props()
  const icon: Record<NonNullable<Props['tone']>, IconName> = {
    info: 'circle-check',
    warning: 'warning',
    danger: 'warning',
  }
</script>

<div class="callout {tone}" role={tone === 'info' ? 'note' : 'alert'}>
  <span class="icon"><Icon name={icon[tone]} size={16} /></span>
  <div class="text">{@render children()}</div>
</div>

<style>
  .callout {
    display: flex;
    gap: var(--sp-8);
    padding: var(--sp-12);
    border-radius: var(--r-md);
    background: var(--color-panel);
    color: var(--color-label);
    font: var(--type-body);
  }
  .icon {
    display: inline-flex;
    flex: none;
    padding-top: 1px;
    color: var(--color-label-secondary);
  }
  .warning .icon {
    color: var(--color-warning);
  }
  .danger .icon {
    color: var(--color-danger);
  }
  .text {
    min-width: 0;
  }
</style>
