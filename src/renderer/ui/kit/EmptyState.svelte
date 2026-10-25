<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../Icon.svelte'
  import Spinner from '../Spinner.svelte'

  /**
   * What a pane shows when it has nothing yet: a quiet icon, one line that says what is missing, an
   * optional line that says what to do, and an optional action. `busy` shows a progress circle in
   * place of the icon, while what the pane waits for is on its way.
   */
  interface Props {
    icon: IconName
    busy?: boolean
    title: string
    text?: string
    action?: Snippet
  }
  let { icon, busy = false, title, text, action }: Props = $props()
</script>

<div class="empty">
  <span class="icon">
    {#if busy}<Spinner size={24} />{:else}<Icon name={icon} size={24} />{/if}
  </span>
  <p class="title">{title}</p>
  {#if text}<p class="text">{text}</p>{/if}
  {#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-32) var(--inset-pane);
    text-align: center;
  }
  .icon {
    display: inline-flex;
    margin-bottom: var(--sp-4);
    color: var(--color-label-tertiary);
  }
  p {
    margin: 0;
    max-width: 280px;
  }
  .title {
    color: var(--color-label);
    font: var(--type-emphasis);
  }
  .text {
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .action {
    margin-top: var(--sp-8);
  }
</style>
