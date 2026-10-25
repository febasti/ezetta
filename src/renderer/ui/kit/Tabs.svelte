<script lang="ts" generics="T extends string">
  /**
   * Tabs that switch what a pane shows: names in a row on a hairline, the chosen one in the label
   * colour with an accent line under it. The arrow keys move between them (the ARIA tab pattern).
   */
  interface Tab {
    id: T
    label: string
    /** A number after the name, such as the issues of a check. */
    count?: number | null
  }
  interface Props {
    tabs: readonly Tab[]
    value: T
    label: string
    /** The tabs' ids are `<idPrefix>-<id>`; the panel they control is `panelId`. */
    idPrefix: string
    panelId: string
    onchange: (id: T) => void
  }
  let { tabs, value, label, idPrefix, panelId, onchange }: Props = $props()

  function onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const at = tabs.findIndex((t) => t.id === value)
    const to = tabs[(at + step + tabs.length) % tabs.length]
    if (!to) return
    onchange(to.id)
    queueMicrotask(() => document.getElementById(`${idPrefix}-${to.id}`)?.focus())
  }
</script>

<div class="tabs" role="tablist" aria-label={label} tabindex="-1" onkeydown={onKeydown}>
  {#each tabs as tab (tab.id)}
    <button
      id="{idPrefix}-{tab.id}"
      type="button"
      role="tab"
      aria-selected={tab.id === value}
      aria-controls={panelId}
      tabindex={tab.id === value ? 0 : -1}
      onclick={() => onchange(tab.id)}
    >
      {tab.label}
      {#if tab.count}<span class="count">{tab.count}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: var(--sp-16);
    padding: 0 var(--inset-pane);
    border-bottom: 1px solid var(--color-separator);
  }
  button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--bar-height);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-label-secondary);
    font: var(--type-body);
    cursor: default;
  }
  button:hover {
    color: var(--color-label);
  }
  button[aria-selected='true'] {
    color: var(--color-label);
    font-weight: 500;
  }
  button[aria-selected='true']::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--color-accent);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
    border-radius: var(--r-sm);
  }
  .count {
    padding: 0 var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
</style>
