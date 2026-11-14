<script lang="ts">
  import { hasItalic } from '@core/export/fonts'
  import type { FontFamily } from '@core/export/fonts'
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'
  import Popover from '../../ui/kit/Popover.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { scrollbar } from '../../ui/scrollbar'

  /**
   * The font of an element, as a menu: a button that shows the family it is set in, and opens a list of
   * the families the compiler finds (its own and the system's), each drawn in its own face with its
   * weights and whether it has an italic. A search field at its top narrows the list; a name that is
   * none of them can be used as it is typed (a font the machine does not have is said elsewhere), and
   * the first entry takes the family from the element above again. Arrow keys and Return choose, Escape
   * closes.
   */
  interface Props {
    id: string
    value: string
    families: readonly FontFamily[]
    placeholder?: string
    invalid?: boolean
    disabled?: boolean
    /** A family chosen, or a name typed (empty: back to the inherited one). */
    oncommit: (text: string) => void
  }
  let {
    id,
    value,
    families,
    placeholder = '—',
    invalid = false,
    disabled = false,
    oncommit,
  }: Props = $props()

  /** At most this many families are drawn at once: searching finds the others. */
  const SHOWN = 150

  let root: HTMLElement | undefined = $state()
  let open = $state(false)
  let query = $state('')
  let active = $state(0)
  /** Which edge of the button the menu lines up with: the one with room beside it. */
  let edge = $state<'left' | 'right'>('left')
  const listId = $derived(`${id}-families`)

  /** The entries of the list: the way back to the inherited family, the families that match, the typed name. */
  interface Entry {
    key: string
    /** What is committed. */
    name: string
    family?: FontFamily
    kind: 'inherit' | 'family' | 'typed'
  }
  const entries = $derived.by((): Entry[] => {
    const q = query.trim().toLowerCase()
    const found = (
      q === '' ? families : families.filter((f) => f.name.toLowerCase().includes(q))
    ).slice(0, SHOWN)
    const list: Entry[] = []
    if (q === '' && value !== '') list.push({ key: 'inherit', name: '', kind: 'inherit' })
    for (const family of found)
      list.push({ key: family.name, name: family.name, family, kind: 'family' })
    if (q !== '' && !found.some((f) => f.name.toLowerCase() === q))
      list.push({ key: 'typed', name: query.trim(), kind: 'typed' })
    return list
  })

  /** What a family has: its weights (a range for a variable font), an italic, and small caps. */
  function summary(family: FontFamily): string {
    const low = Math.min(...family.variants.map((v) => v.weight[0]))
    const high = Math.max(...family.variants.map((v) => v.weight[1]))
    const weights = low === high ? `${low}` : `${low}–${high}`
    return [
      weights,
      ...(hasItalic(family) ? [i18n.t('templates.font.italic')] : []),
      ...(family.smallCaps === 'yes' ? [i18n.t('templates.font.smallCaps')] : []),
    ].join(' · ')
  }

  function toggle(): void {
    if (disabled) return
    if (!open && root) {
      const button = root.getBoundingClientRect()
      const room = (root.closest('.properties') ?? document.body).getBoundingClientRect()
      edge = button.left + 340 <= room.right ? 'left' : 'right'
      query = ''
      active = Math.max(
        0,
        entries.findIndex((e) => e.name === value),
      )
    }
    open = !open
  }

  function choose(entry: Entry): void {
    open = false
    if (entry.name !== value) oncommit(entry.name)
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      active = Math.max(0, Math.min(entries.length - 1, active + step))
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = entries[active]
      if (picked) choose(picked)
    }
  }

  /** The search starts at the first entry that matches, whatever was highlighted before. */
  function search(text: string): void {
    query = text
    active = 0
  }

  /** The search field takes the focus when the menu opens. */
  function focusIn(node: HTMLElement): void {
    queueMicrotask(() => node.querySelector<HTMLInputElement>('input')?.focus())
  }

  $effect(() => {
    if (!open) return
    const away = (event: PointerEvent): void => {
      if (root && !root.contains(event.target as Node)) open = false
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        open = false
      }
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  })
</script>

<div class="font-picker" bind:this={root}>
  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the family, which opens the families -->
  <button
    type="button"
    class="menu"
    class:unset={value === ''}
    {id}
    data-value={value}
    aria-haspopup="listbox"
    aria-expanded={open}
    data-invalid={invalid || undefined}
    {disabled}
    onclick={toggle}
  >
    <span class="name">{value === '' ? placeholder : value}</span>
    <span class="chevrons" aria-hidden="true"><Icon name="selector" size={14} /></span>
  </button>
  {#if open}
    <div class="float {edge}" use:focusIn>
      <Popover width="medium">
        <TextField
          type="search"
          label={i18n.t('templates.font.search')}
          placeholder={i18n.t('templates.font.search')}
          value={query}
          onvalue={search}
          onkeydown={keydown}
        />
        <ul
          class="list"
          use:scrollbar
          id={listId}
          role="listbox"
          aria-label={i18n.t('templates.font.search')}
        >
          {#each entries as entry, index (entry.key)}
            <!-- The press is taken before the search loses the focus, so the choice is not lost. -->
            <li
              id="{listId}-{index}"
              role="option"
              aria-selected={entry.name === value}
              class:active={index === active}
              class:chosen={entry.kind !== 'typed' && entry.name === value}
              onmousedown={(event) => {
                event.preventDefault()
                choose(entry)
              }}
              onmousemove={() => (active = index)}
            >
              {#if entry.kind === 'family' && entry.family}
                <span class="entry" style:font-family="'{entry.name}'">{entry.name}</span>
                <span class="variants">{summary(entry.family)}</span>
              {:else if entry.kind === 'typed'}
                <span class="entry">{i18n.t('templates.font.use', { name: entry.name })}</span>
              {:else}
                <span class="entry">{i18n.t('templates.font.inherit')}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </Popover>
    </div>
  {/if}
</div>

<style>
  .font-picker {
    position: relative;
    width: 100%;
    min-width: 0;
  }
  /* The family as a pop-up button, like the other menus: its name on a quiet fill with the chevrons. */
  .menu {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-8);
    width: 100%;
    height: var(--control-md);
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: var(--color-control);
    color: var(--color-label);
    font: var(--type-body);
    text-align: left;
    cursor: default;
    transition: background var(--duration);
  }
  .menu:hover:not(:disabled) {
    background: var(--color-control-hover);
  }
  .menu:focus-visible,
  .menu[aria-expanded='true'] {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .menu[data-invalid='true'] {
    box-shadow: 0 0 0 1px var(--color-danger);
  }
  .menu:disabled {
    opacity: 0.45;
  }
  .menu.unset .name {
    color: var(--color-label-tertiary);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevrons {
    display: inline-flex;
    flex: none;
    color: var(--color-label-secondary);
  }
  .float {
    position: absolute;
    z-index: 20;
    top: calc(100% + var(--sp-4));
  }
  .float.left {
    left: 0;
  }
  .float.right {
    right: 0;
  }
  .list {
    max-height: 280px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  li {
    display: flex;
    flex-direction: column;
    padding: var(--sp-4) var(--sp-8);
    border-radius: var(--r-sm);
    cursor: default;
  }
  /* The chosen family has the selection's ground; the one under the pointer or the keys is in the accent. */
  li.chosen {
    background: var(--color-selection);
  }
  li.active .entry {
    color: var(--color-accent);
  }
  .entry {
    overflow: hidden;
    color: var(--color-label);
    /* The family is drawn in its own face (set on the element), at the size of the text. */
    font: var(--type-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .variants {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
