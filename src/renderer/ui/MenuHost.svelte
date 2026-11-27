<script lang="ts">
  import { tick } from 'svelte'
  import { closeMenu, menuState } from '../lib/menu.svelte'
  import { shortcutLabel } from '../lib/shortcut'
  import Icon from './Icon.svelte'

  let element = $state<HTMLElement>()
  let position = $state({ left: 0, top: 0 })
  /** The item the pointer or the keys are on; none when the menu opens, so the chosen one stands out. */
  let active = $state(-1)

  /** The items: given as a function they are read again when what it reads changes. */
  const items = $derived.by(() => {
    const given = menuState.current?.items ?? []
    return typeof given === 'function' ? given() : given
  })
  const actionable = $derived(
    items.flatMap((item, i) =>
      item.separator || item.disabled || item.heading || item.info ? [] : [i],
    ),
  )
  /** With a symbol on any item every label starts after the symbols' column. */
  const symbols = $derived(items.some((item) => item.icon !== undefined))

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
    if (!item || item.disabled || item.separator || item.heading || item.info) return
    const action = item.onselect
    // A switch is turned with the menu open, so its new state is seen.
    if (!item.toggle) closeMenu()
    action?.()
  }

  function onKeydown(event: KeyboardEvent): void {
    const at = actionable.indexOf(active)
    // The keys start at the chosen item (or the first), and from the end going up.
    const chosen = actionable.find((i) => items[i]?.checked && !items[i]?.toggle)
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
      {:else if item.info}
        <!-- What the menu is about: said at its top, not something to choose. -->
        <div class="info" role="presentation">
          <span class="info-title">{item.info.title}</span>
          {#if item.info.text}<span class="info-text">{item.info.text}</span>{/if}
          {#if item.info.share !== undefined}
            <span class="bar" aria-hidden="true"
              ><span style:width="{Math.min(1, Math.max(0, item.info.share)) * 100}%"></span></span
            >
          {/if}
        </div>
      {:else if item.heading}
        <div class="heading" role="presentation">{item.label}</div>
      {:else}
        <button
          class="item"
          class:active={active === i}
          class:danger={item.danger}
          role={item.toggle ? 'menuitemcheckbox' : 'menuitem'}
          aria-label={item.label}
          aria-checked={item.toggle ? item.checked === true : undefined}
          aria-current={item.checked && !item.toggle ? 'true' : undefined}
          disabled={item.disabled}
          onpointermove={() => !item.disabled && (active = i)}
          onclick={() => choose(i)}
        >
          {#if symbols}
            <span class="symbol"
              >{#if item.icon}<Icon name={item.icon} size={16} />{/if}</span
            >
          {/if}
          <span class="label">{item.label}</span>
          {#if item.detail}<span class="detail">{item.detail}</span>{/if}
          {#if item.shortcut}<span class="keys">{shortcutLabel(item.shortcut)}</span>{/if}
          {#if item.toggle}
            <span class="switch" class:on={item.checked === true}></span>
          {:else if item.checked}
            <span class="check"><Icon name="check" size={14} /></span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* The app's own menu (the dropdowns under a tool, the project menu): roomy items as high as a
     control, a symbol before the name where the menu has symbols, what an item stands at and its
     shortcut quietly at its end. The item under the pointer or the keys lies on the control's
     ground; the chosen one of a choice has a check mark. */
  .menu {
    position: fixed;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 220px;
    max-width: 380px;
    padding: var(--sp-4);
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
    outline: none;
  }
  .item {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-8);
    width: 100%;
    min-height: var(--control-md);
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label);
    font: var(--type-body);
    text-align: left;
    cursor: default;
  }
  .symbol {
    display: inline-flex;
    flex: none;
    justify-content: center;
    width: var(--sp-16);
    color: var(--color-label-secondary);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail,
  .keys {
    flex: none;
    margin-left: var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-body);
    white-space: nowrap;
  }
  .check {
    display: inline-flex;
    flex: none;
    color: var(--color-accent);
  }
  .item.active {
    background: var(--color-control);
  }
  .item:active:not(:disabled) {
    background: var(--color-control-pressed);
  }
  .item:disabled {
    color: var(--color-label-tertiary);
  }
  .item.danger,
  .item.danger .symbol {
    color: var(--color-danger);
  }
  /* A switch in a menu: off on the control's ground, on in the accent, its knob at the other end. */
  .switch {
    position: relative;
    flex: none;
    width: var(--sp-24);
    height: calc(var(--sp-12) + 2px);
    margin-left: var(--sp-8);
    border-radius: var(--r-lg);
    background: var(--color-control-pressed);
    transition: background var(--duration);
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(var(--sp-8) + 2px);
    height: calc(var(--sp-8) + 2px);
    border-radius: 50%;
    background: var(--color-control-raised);
    box-shadow: var(--shadow-raised);
    transition: transform var(--duration);
  }
  .switch.on {
    background: var(--color-accent);
  }
  .switch.on::after {
    transform: translateX(calc(var(--sp-8) + 2px));
  }
  .separator {
    flex: none;
    height: 1px;
    margin: var(--sp-4) var(--sp-8);
    background: var(--color-separator);
  }
  .heading {
    padding: var(--sp-8) var(--sp-8) var(--sp-4);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  /* The head of a menu: what it is about, in a line or two, and how far it is. */
  .info {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-8) var(--sp-8) var(--sp-8);
  }
  .info-title {
    overflow: hidden;
    color: var(--color-label);
    font: var(--type-emphasis);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .info-text {
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .bar {
    display: block;
    height: var(--sp-4);
    margin-top: 2px;
    overflow: hidden;
    border-radius: var(--r-sm);
    background: var(--color-control);
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: var(--r-sm);
    background: var(--color-accent);
  }
</style>
