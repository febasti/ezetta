<script lang="ts">
  import type { GroupNodeDto } from '@shared/project'
  import { MATERIAL } from '@core/project/paths'
  import { i18n } from '../../i18n/i18n.svelte'
  import { clearDrag, drag, DROP_END, dropTarget } from '../../lib/dnd.svelte'
  import { slotAt } from '../../lib/dropSlot'
  import type { DropSlot } from '../../lib/dropSlot'
  import { openDropdown } from '../../lib/menu.svelte'
  import type { MenuItem } from '../../lib/menu.svelte'
  import { ui, setOutlineVisible } from '../../lib/ui.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import FolderIcon from '../../ui/FolderIcon.svelte'
  import Icon from '../../ui/Icon.svelte'
  import { project } from './project.svelte'
  import SheetRow from './SheetRow.svelte'

  const group = $derived(project.currentGroup)

  /** The folder of a heading, for its symbol and colour. */
  function groupOf(folder: string) {
    const node = project.node(folder)
    return node?.kind === 'group' ? node : null
  }
  const title = $derived(
    project.selectedGroup === '' ? (project.snapshot?.title ?? '') : (group?.name ?? ''),
  )

  interface Section {
    folder: string
    /** Heading shown above the section, or null for the group's own leading sheets. */
    heading: string | null
    rows: (typeof project.flatRows)[number]['node'][]
  }

  /** Flat rows grouped by folder, with a heading wherever the folder changes. The group's own
   * sheets at the very top need no heading. */
  const sections = $derived.by((): Section[] => {
    const base = project.selectedGroup
    const out: Section[] = []
    for (const { node, folder } of project.flatRows) {
      const last = out.at(-1)
      if (last && last.folder === folder) {
        last.rows.push(node)
        continue
      }
      const relative = folder.slice(base === '' ? 0 : base.length + 1)
      const heading = folder === base ? title : relative.split('/').join(' › ')
      out.push({
        folder,
        heading: out.length === 0 && folder === base ? null : heading,
        rows: [node],
      })
    }
    return out
  })

  /** The group tree as menu items, for switching groups when the groups column is hidden. */
  function groupItems(): MenuItem[] {
    const items: MenuItem[] = []
    const walk = (node: GroupNodeDto, depth: number): void => {
      items.push({
        label: `${' '.repeat(depth)}${node.path === '' ? (project.snapshot?.title ?? '') : node.name}`,
        checked: node.path === project.selectedGroup,
        onselect: () => project.selectGroup(node.path),
      })
      for (const child of node.children)
        if (child.kind === 'group' && child.path !== MATERIAL && (!node.inExport || child.export))
          walk(child, depth + 1)
    }
    if (project.tree) walk(project.tree, 0)
    // The material stands outside the structure, under its own heading.
    for (const outside of project.outside) walk(outside, 0)
    return items
  }

  let rowsElement = $state<HTMLElement>()

  /**
   * Where a drag at the pointer would land, from the pointer's height among the rows: the rows have
   * gaps and headings between them, and there is room under the last one, so every height lands
   * somewhere and the line that shows it is always there.
   */
  function slotOf(event: DragEvent): DropSlot | null {
    const rows = [...(rowsElement?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].map(
      (row) => {
        const { top, bottom } = row.getBoundingClientRect()
        return { path: row.dataset['path']!, top, bottom }
      },
    )
    return slotAt(event.clientY, rows, (path) =>
      drag.paths.some((p) => path === p || path.startsWith(`${p}/`)),
    )
  }

  function onDragOver(event: DragEvent): void {
    if (drag.paths.length === 0) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const slot = slotOf(event)
    if (slot === null) dropTarget.path = null
    else if ('end' in slot) dropTarget.path = DROP_END
    else {
      dropTarget.path = slot.path
      dropTarget.position = slot.position
    }
  }

  function onDragLeave(event: DragEvent): void {
    if (!rowsElement?.contains(event.relatedTarget as Node | null)) dropTarget.path = null
  }

  async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    const paths = [...drag.paths]
    const slot = slotOf(event)
    clearDrag()
    if (paths.length && slot) await project.dropAt(paths, slot)
  }
</script>

<section class="column" aria-label={i18n.t('sidebar.sheets')}>
  <header>
    {#if ui.groupsVisible}
      <h2>{title}</h2>
    {:else}
      <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the column’s title, which opens the menu of groups -->
      <button
        class="switcher"
        aria-haspopup="menu"
        aria-label={i18n.t('sidebar.switchGroup')}
        onclick={(e) => openDropdown(e.currentTarget, groupItems())}
      >
        <span class="switcher-name">{title}</span>
        <Icon name="chevron-down" size={14} />
      </button>
    {/if}
    {#if !ui.groupsVisible}
      <IconButton
        icon="list-tree"
        label={i18n.t('outline.title')}
        onclick={() => setOutlineVisible(true)}
      />
    {/if}
    <IconButton
      icon="plus"
      label={i18n.t('sidebar.newSheet')}
      onclick={() => void project.createSheet()}
    />
  </header>
  <div
    class="rows"
    role="listbox"
    tabindex="-1"
    aria-multiselectable="true"
    aria-label={i18n.t('sidebar.sheets')}
    data-rows
    bind:this={rowsElement}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
  >
    {#if sections.length}
      {#each sections as section, index (`${index}:${section.folder}`)}
        <div role="group" aria-label={section.heading ?? title}>
          {#if section.heading !== null}
            <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a subgroup’s heading in the list, which opens the group -->
            <button
              class="heading"
              tabindex="-1"
              title={section.heading}
              onclick={() => project.selectGroup(section.folder)}
            >
              <FolderIcon
                icon={groupOf(section.folder)?.icon ?? null}
                color={groupOf(section.folder)?.color ?? null}
                size={14}
              />
              <span>{section.heading}</span>
            </button>
          {/if}
          {#each section.rows as node (node.path)}
            <SheetRow {node} />
          {/each}
        </div>
      {/each}
    {:else}
      <EmptyState icon="file" title={i18n.t('sidebar.empty')} text={i18n.t('sidebar.emptyHint')} />
    {/if}
    <!-- Under the last row: a drop there puts the sheet at the end of the group. -->
    {#if dropTarget.path === DROP_END}<div class="drop-end" aria-hidden="true"></div>{/if}
  </div>
</section>

<style>
  .column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
  }
  header {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
    height: var(--bar-height);
    padding: 0 var(--sp-8) 0 var(--sp-16);
  }
  h2,
  .switcher {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* With the groups column hidden, the title switches the group. */
  .switcher {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--control-md);
    margin-left: calc(-1 * var(--sp-8));
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    cursor: default;
    transition: background var(--duration);
  }
  .switcher-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .switcher:hover {
    background: var(--color-control);
  }
  .switcher:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-8) var(--sp-8) var(--sp-16);
  }
  /* The line of the drop under the last row, in the gap that row leaves; it takes no room. */
  .drop-end {
    position: relative;
    height: 0;
  }
  .drop-end::before {
    content: '';
    position: absolute;
    top: calc(-1 * var(--sp-4) - 1.5px);
    right: 0;
    left: 0;
    height: 3px;
    border-radius: 2px;
    background: var(--color-accent);
  }
  /* A subgroup's name above its sheets: quiet, in the caption role, with the folder's symbol. */
  .heading {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    width: 100%;
    margin: var(--sp-12) 0 var(--sp-4);
    padding: 0 var(--sp-4);
    border: 0;
    background: transparent;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
    text-align: left;
    cursor: default;
  }
  .heading:hover {
    color: var(--color-label-secondary);
  }
  .heading:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
    border-radius: var(--r-sm);
  }
  .heading span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
