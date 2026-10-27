<script lang="ts">
  import type { MissingNodeDto, SheetNodeDto } from '@shared/project'
  import { editor } from '../editor/editorSession.svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import { clearDrag, drag, dropPosition, dropTarget } from '../../lib/dnd.svelte'
  import { formatNumber } from '../../lib/format'
  import { openContextMenu } from '../../lib/menu.svelte'
  import type { MenuItem } from '../../lib/menu.svelte'
  import { rowNavigation } from '../../lib/rowNav'
  import { dirname, isMaterial } from '@core/project/paths'
  import Icon from '../../ui/Icon.svelte'
  import { project } from './project.svelte'

  interface Props {
    node: SheetNodeDto | MissingNodeDto
  }
  let { node }: Props = $props()

  const selected = $derived(project.selection.includes(node.path))
  /** A sheet that is excluded from the export itself is a scratchpad in its place: no status. */
  const scratch = $derived(node.kind === 'sheet' && !node.export)
  const isOpen = $derived(node.kind === 'sheet' && editor.path === node.path)
  const marked = $derived(dropTarget.path === node.path ? dropTarget.position : null)
  /** The first lines of the sheet, as the row draws them: a heading is one bold line, a paragraph
   * gets what is left of three lines. */
  const shown = $derived.by(() => {
    if (node.kind !== 'sheet') return []
    const entries = node.preview.slice(0, 2)
    let budget = 3
    return entries.map(([level, text], index) => {
      if (level > 0) {
        budget -= 1
        return { level, text, clamp: 1 }
      }
      const later = entries.slice(index + 1).some(([next]) => next > 0)
      return { level, text, clamp: Math.max(1, budget - (later ? 1 : 0)) }
    })
  })
  /** What a context-menu action applies to: the whole selection if this row is part of it. */
  const targets = $derived(selected ? project.selection : [node.path])

  function menuItems(): MenuItem[] {
    if (node.kind === 'missing') {
      return [
        ...project.relinkCandidates(node.path).map((candidate) => ({
          label: i18n.t('menu.relink', { name: candidate.name }),
          onselect: () => void project.relink(node.path, candidate.path),
        })),
        { label: i18n.t('menu.remove'), onselect: () => void project.removeMissing(node.path) },
      ]
    }
    const nodes = targets.map((p) => project.node(p))
    const onlySheets = nodes.every((n) => n?.kind === 'sheet')
    const allExcluded = nodes.every((n) => n !== null && n.kind !== 'missing' && !n.export)
    const anyScratch = nodes.some((n) => n?.kind === 'sheet' && !n.export)
    return [
      ...(onlySheets && !anyScratch
        ? (['draft', 'revised', 'final'] as const).map((status) => ({
            label: i18n.t('menu.setStatus', { status: i18n.t(`status.${status}`) }),
            checked: nodes.every((n) => n?.kind === 'sheet' && n.status === status),
            onselect: () => void project.setStatus(targets, status),
          }))
        : []),
      ...(onlySheets && targets.length === 1
        ? [{ label: i18n.t('menu.setGoal'), onselect: () => void project.setGoal(node.path) }]
        : []),
      { separator: true },
      ...(targets.some(isMaterial)
        ? []
        : [
            {
              label: allExcluded
                ? i18n.t('menu.includeExport')
                : onlySheets
                  ? i18n.t('menu.markScratchpad')
                  : i18n.t('menu.excludeExport'),
              onselect: () => void project.setExport(targets, allExcluded),
            },
          ]),
      // A sheet has no name to change: the list shows its first lines. A missing file
      // is shown by the name it had.
      { separator: true },
      { label: i18n.t('menu.delete'), danger: true, onselect: () => void project.remove(targets) },
    ]
  }

  function activate(event: MouseEvent | KeyboardEvent): void {
    if (node.kind === 'missing') return project.select(node.path)
    void project.clickRow(node.path, {
      extend: event.shiftKey,
      toggle: event.metaKey || event.ctrlKey,
    })
  }

  const draggedPaths = (): string[] => (selected ? [...project.selection] : [node.path])
  const canDrop = (): boolean =>
    drag.paths.length > 0 &&
    !drag.paths.some((p) => p === node.path || node.path.startsWith(`${p}/`))

  function onDragOver(event: DragEvent): void {
    if (!canDrop()) return
    event.preventDefault()
    dropTarget.path = node.path
    dropTarget.position = dropPosition(event, event.currentTarget as HTMLElement, false)
  }

  async function onDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    const paths = [...drag.paths]
    const position = dropPosition(event, event.currentTarget as HTMLElement, false)
    clearDrag()
    if (!paths.length || paths.some((p) => p === node.path || node.path.startsWith(`${p}/`))) return
    if (position === 'inside') return project.move(paths, node.path)
    const parent = dirname(node.path)
    const siblings = project.siblingsWithout(parent, paths)
    await project.move(paths, parent, siblings.indexOf(node.path) + (position === 'after' ? 1 : 0))
  }
</script>

<div
  class="row"
  class:selected
  class:open={isOpen}
  class:missing={node.kind === 'missing'}
  class:scratch
  class:before={marked === 'before'}
  class:after={marked === 'after'}
  class:inside={marked === 'inside'}
  role="option"
  aria-selected={selected}
  tabindex="0"
  data-row
  data-path={node.path}
  draggable={node.kind !== 'missing'}
  onclick={activate}
  oncontextmenu={(e) => {
    if (!selected) project.select(node.path)
    openContextMenu(e, menuItems())
  }}
  onkeydown={(e) => {
    rowNavigation(e)
    if (e.key === 'Enter') activate(e)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && node.kind !== 'missing')
      void project.remove(targets)
  }}
  ondragstart={(e) => {
    drag.paths = draggedPaths()
    e.dataTransfer?.setData(
      'text/plain',
      node.kind === 'sheet' ? project.sheetLabel(node.path) : node.name,
    )
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }}
  ondragend={clearDrag}
  ondragover={onDragOver}
  ondragleave={() => dropTarget.path === node.path && (dropTarget.path = null)}
  ondrop={onDrop}
>
  {#if node.kind === 'missing'}
    <span class="sheet-heading missing-name">{node.name}</span>
    <span class="sheet-text">{i18n.t('sidebar.missingHint')}</span>
  {:else}
    <span class="lines">
      {#each shown as entry, index (index)}
        {#if entry.level > 0}
          <span class="sheet-heading">{entry.text}</span>
        {:else}
          <span class="sheet-text" style:--clamp={entry.clamp}>{entry.text}</span>
        {/if}
      {:else}
        <span class="empty">{i18n.t('sidebar.emptySheet')}</span>
      {/each}
    </span>
  {/if}
  <div class="meta">
    {#if node.kind === 'sheet' && scratch}
      <span class="status scratchpad">
        <Icon name="note" size={13} />
        {i18n.t('sidebar.scratchpad')}
      </span>
    {:else if node.kind === 'sheet'}
      <span class="status">
        <span class="dot {node.status}"></span>
        {i18n.t(`status.${node.status}`)}
      </span>
    {:else}
      <span class="status warn">
        <Icon name="warning" size={13} />
        {i18n.t('sidebar.missing')}
      </span>
    {/if}
    {#if node.kind !== 'missing' && !node.inExport && !scratch && !isMaterial(node.path)}
      <span class="icon" title={i18n.t('sidebar.notInExport')}
        ><Icon name="eye-off" size={13} /></span
      >
      <span class="sr-only">{i18n.t('sidebar.notInExport')}</span>
    {/if}
    {#if node.kind === 'sheet'}
      <span class="count">{formatNumber(node.words, i18n.locale)}</span>
    {/if}
  </div>
</div>

<style>
  /* A sheet is a small card on the sidebar's ground: the first
     lines on top, its status and word count under them. The chosen one has a neutral ring, not a
     colour. Made of the foundation's values only. */
  .row {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    margin-bottom: var(--sp-8);
    padding: var(--sp-8) var(--sp-12);
    border: 1px solid var(--color-separator);
    border-radius: var(--r-md);
    background: var(--color-window);
    color: var(--color-label);
    cursor: default;
    user-select: none;
  }
  .row.selected {
    border-color: var(--color-label-secondary);
    box-shadow: inset 0 0 0 1px var(--color-label-secondary);
  }
  .row:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .row.selected:focus-visible {
    box-shadow:
      inset 0 0 0 1px var(--color-label-secondary),
      0 0 0 3px var(--color-focus);
  }
  .row.inside {
    border-color: var(--color-accent);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
  /* A scratchpad: a sheet that is not in the export, drawn as a note on the side, dashed, without a status. */
  .row.scratch {
    border-style: dashed;
    background: transparent;
  }
  .status.scratchpad {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    color: var(--color-label-secondary);
  }
  .row.missing {
    border-style: dashed;
    background: transparent;
  }
  /* The ring of a chosen or an inside row is a solid line: next to a dashed edge both would show. */
  .row.scratch.selected,
  .row.scratch.inside,
  .row.missing.selected,
  .row.missing.inside {
    border-style: solid;
  }
  .row.before::before,
  .row.after::after {
    content: '';
    position: absolute;
    right: var(--sp-8);
    left: var(--sp-8);
    height: 2px;
    border-radius: 1px;
    background: var(--color-accent);
  }
  .row.before::before {
    top: -6px;
  }
  .row.after::after {
    bottom: -6px;
  }
  .lines {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .sheet-heading,
  .sheet-text {
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .sheet-heading {
    font: var(--type-emphasis);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sheet-text {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--clamp, 3);
    line-clamp: var(--clamp, 3);
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .empty {
    color: var(--color-label-tertiary);
    font: var(--type-body);
    font-style: italic;
  }
  .missing-name {
    color: var(--color-label-tertiary);
    text-decoration: line-through;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .status {
    display: inline-flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-4);
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .status.warn {
    color: var(--color-warning);
  }
  .count {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-label-tertiary);
  }
  .dot.revised {
    background: var(--color-warning);
  }
  .dot.final {
    background: var(--color-success);
  }
  .icon {
    display: inline-flex;
    flex: none;
  }
</style>
