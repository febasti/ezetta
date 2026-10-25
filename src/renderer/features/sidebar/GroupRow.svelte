<script lang="ts">
  import { dirname, isMaterial, MATERIAL } from '@core/project/paths'
  import { structureCount } from '@core/project/tree'
  import type { GroupNodeDto } from '@shared/project'
  import { tick } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import { clearDrag, drag, dropPosition, dropTarget } from '../../lib/dnd.svelte'
  import { openContextMenu } from '../../lib/menu.svelte'
  import { rowNavigation } from '../../lib/rowNav'
  import { ui } from '../../lib/ui.svelte'
  import Icon from '../../ui/Icon.svelte'
  import FolderIcon from '../../ui/FolderIcon.svelte'
  import InlineName from '../../ui/InlineName.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import GroupRow from './GroupRow.svelte'
  import { project } from './project.svelte'

  interface Props {
    node: GroupNodeDto
    depth: number
  }
  let { node, depth }: Props = $props()

  let open = $state(true)
  let row = $state<HTMLDivElement>()
  // The folders that are excluded stand outside the structure (below it, in their own place); in one
  // of them everything is shown.
  const subgroups = $derived(
    node.children.filter(
      (c): c is GroupNodeDto =>
        c.kind === 'group' && c.path !== MATERIAL && (!node.inExport || c.export),
    ),
  )
  const selected = $derived(project.selectedGroup === node.path)
  const isRoot = $derived(node.path === '')
  // The top row stands for the whole project: all its sheets. The project is named in the menu above.
  const label = $derived(isRoot ? i18n.t('sidebar.allSheets') : node.name)
  const marked = $derived(dropTarget.path === node.path ? dropTarget.position : null)

  function menuItems() {
    return [
      { label: i18n.t('menu.newSheetHere'), onselect: () => void project.createSheet(node.path) },
      { label: i18n.t('menu.newGroupHere'), onselect: () => void project.createGroup(node.path) },
      ...(isRoot
        ? [
            {
              label: i18n.t('sidebar.newMaterialFolder'),
              onselect: () => void project.createGroup(MATERIAL),
            },
          ]
        : []),
      { separator: true },
      ...(isRoot
        ? []
        : [
            { label: i18n.t('menu.editGroup'), onselect: () => void edit() },
            { label: i18n.t('menu.rename'), onselect: () => (project.renaming = node.path) },
            // Leaving a folder out of the export is a place: the material is where it goes.
            isMaterial(node.path) || !node.export
              ? {
                  label: i18n.t('menu.includeExport'),
                  onselect: () => void project.move([node.path], ''),
                }
              : {
                  label: i18n.t('menu.moveToMaterial'),
                  onselect: () => void project.move([node.path], MATERIAL),
                },
            { separator: true },
            {
              label: i18n.t('menu.delete'),
              danger: true,
              onselect: () => void project.remove([node.path]),
            },
          ]),
    ]
  }

  /** Opens the edit popover (name, colour, symbol) of the group. */
  async function edit(): Promise<void> {
    await tick()
    ui.groupEditor = { path: node.path }
  }

  function canDrop(): boolean {
    return (
      drag.paths.length > 0 &&
      !drag.paths.some((p) => p === node.path || node.path.startsWith(`${p}/`))
    )
  }

  function onDragOver(event: DragEvent): void {
    if (!canDrop()) return
    event.preventDefault()
    dropTarget.path = node.path
    dropTarget.position = isRoot
      ? 'inside'
      : dropPosition(event, event.currentTarget as HTMLElement, true)
  }

  async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    const paths = [...drag.paths]
    const position = isRoot
      ? 'inside'
      : dropPosition(event, event.currentTarget as HTMLElement, true)
    clearDrag()
    if (!paths.length || paths.some((p) => p === node.path || node.path.startsWith(`${p}/`))) return
    if (position === 'inside') return project.move(paths, node.path)
    const parent = dirname(node.path)
    const siblings = project.siblingsWithout(parent, paths)
    const at = siblings.indexOf(node.path) + (position === 'after' ? 1 : 0)
    await project.move(paths, parent, at)
  }
</script>

<ListRow
  bind:element={row}
  {selected}
  strong={isRoot}
  drop={marked}
  style="padding-left: calc(var(--sp-4) + {depth} * var(--sp-16))"
  role="treeitem"
  aria-selected={selected}
  aria-expanded={subgroups.length ? open : undefined}
  aria-level={depth + 1}
  tabindex={0}
  data-row
  data-path={node.path}
  draggable={!isRoot && project.renaming !== node.path}
  onclick={() => project.selectGroup(node.path)}
  oncontextmenu={(e) => {
    project.selectGroup(node.path)
    openContextMenu(e, menuItems())
  }}
  onkeydown={(e) => {
    rowNavigation(e)
    if (e.key === 'Enter') project.selectGroup(node.path)
    else if (e.key === 'F2' && !isRoot) project.renaming = node.path
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !isRoot)
      void project.remove([node.path])
    else if (e.key === 'ArrowRight' && subgroups.length) open = true
    else if (e.key === 'ArrowLeft' && subgroups.length) open = false
  }}
  ondragstart={(e) => {
    drag.paths = [node.path]
    e.dataTransfer?.setData('text/plain', node.name)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }}
  ondragend={clearDrag}
  ondragover={onDragOver}
  ondragleave={() => dropTarget.path === node.path && (dropTarget.path = null)}
  ondrop={onDrop}
>
  {#snippet leading()}
    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the disclosure triangle of a tree row -->
    <button
      class="chevron"
      tabindex="-1"
      aria-hidden="true"
      class:invisible={subgroups.length === 0}
      onclick={(e) => {
        e.stopPropagation()
        open = !open
      }}
    >
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
    </button>
    <span class="folder"><FolderIcon icon={node.icon} color={node.color} size={16} /></span>
  {/snippet}
  {#snippet content()}
    {#if project.renaming === node.path}
      <InlineName
        value={label}
        label={i18n.t('menu.rename')}
        oncommit={(name) => void project.commitRename(node.path, name)}
        oncancel={() => (project.renaming = null)}
      />
    {:else}
      <span class="name" class:root={isRoot}>{label}</span>
    {/if}
  {/snippet}
  {#snippet accessory()}
    {#if project.renaming !== node.path}
      <span class="count">{structureCount(node)}</span>
    {/if}
  {/snippet}
</ListRow>

{#if open && subgroups.length}
  <div role="group">
    {#each subgroups as child (child.path)}
      <GroupRow node={child} depth={depth + 1} />
    {/each}
  </div>
{/if}

<style>
  /* The row itself is the foundation's ListRow; only what sits in it is placed here. */
  .chevron {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--sp-12);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-label-tertiary);
  }
  .chevron.invisible {
    visibility: hidden;
  }
  .folder {
    display: inline-flex;
    flex: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .root {
    font: var(--type-emphasis);
  }
</style>
