<script lang="ts">
  import { tick } from 'svelte'
  import { closeMenu, menuState } from '../lib/menu.svelte'

  let element = $state<HTMLElement>()
  let position = $state({ left: 0, top: 0 })
  /** The item the pointer or the keys are on; none when the menu opens, so the chosen one stands out. */
  let active = $state(-1)

  const items = $derived(menuState.current?.items ?? [])
  const actionable = $derived(
    items.flatMap((item, i) => (item.separator || item.disabled ? [] : [i])),
  )

  $effect(() => {
    const current = menuState.current
    if (!current) return
    position = { left: current.x, top: current.y }
    active = -1
    void tick().then(() => {
      if (!element) return
      // Keep the menu inside the window.
      const rect = element.getBoundingClientRect()
      position = {
        left: Math.max(4, Math.min(current.x, window.innerWidth - rect.width - 4)),
        top: Math.max(4, Math.min(current.y, window.innerHeight - rect.height - 4)),
      }
      element.focus()
    })
  })

  function choose(index: number): void {
    const item = items[index]
    if (!item || item.disabled || item.separator) return
    const action = item.onselect
    closeMenu()
    action?.()
  }

  function onKeydown(event: KeyboardEvent): void {
    const at = actionable.indexOf(active)
    // The keys start at the chosen item (or the first), and from the end going up.
    const chosen = actionable.find((i) => items[i]?.checked)
    if (event.key === 'ArrowDown')
      active =
        at === -1
          ? (chosen ?? actionable[0] ?? -1)
          : (actionable[(at + 1) % actionable.length] ?? active)
    else if (event.key === 'ArrowUp')
      active =
        at === -1
          ? (actionable.at(-1) ?? -1)
          : (actionable[(at - 1 + actionable.length) % actionable.length] ?? active)
    else if (event.key === 'Enter' || event.key === ' ') choose(active)
    else if (event.key === 'Escape') closeMenu()
    else return
    event.preventDefault()
    event.stopPropagation()
  }
</script>

<svelte:window
  onpointerdown={(e) => menuState.current && !element?.contains(e.target as Node) && closeMenu()}
  onblur={closeMenu}
/>

{#if menuState.current}
  <div
    bind:this={element}
    class="menu"
    role="menu"
    tabindex="-1"
    style:left="{position.left}px"
    style:top="{position.top}px"
    onkeydown={onKeydown}
  >
    {#each items as item, i (i)}
      {#if item.separator}
        <div class="separator" role="separator"></div>
      {:else}
        <button
          class="item"
          class:active={active === i}
          class:chosen={item.checked}
          class:danger={item.danger}
          role="menuitem"
          aria-current={item.checked ? 'true' : undefined}
          disabled={item.disabled}
          onpointermove={() => !item.disabled && (active = i)}
          onclick={() => choose(i)}
        >
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* The app's own menu (dropdowns under a tool), drawn as the system's: 22 px items, the active one
     in the accent with its text in white, the small radius, the float shadow. */
  .menu {
    position: fixed;
    z-index: 100;
    min-width: 200px;
    padding: var(--sp-4);
    border-radius: var(--r-md);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    outline: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    width: 100%;
    height: var(--control-sm);
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-label);
    font: var(--type-body);
    text-align: left;
    cursor: default;
  }
  /* The chosen item has the selection's ground (no check mark); the one under the pointer or the keys the accent. */
  .item.chosen {
    background: var(--color-selection);
  }
  .item.active {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .item:disabled {
    color: var(--color-label-tertiary);
  }
  .item.danger {
    color: var(--color-danger);
  }
  .item.danger.active {
    background: var(--color-danger);
    color: var(--color-on-accent);
  }
  .separator {
    height: 1px;
    margin: var(--sp-4) var(--sp-8);
    background: var(--color-separator);
  }
</style>
