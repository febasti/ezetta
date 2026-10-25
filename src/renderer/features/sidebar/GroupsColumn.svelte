<script lang="ts">
  import { MATERIAL } from '@core/project/paths'
  import { i18n } from '../../i18n/i18n.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import { clearDrag, drag, dropTarget } from '../../lib/dnd.svelte'
  import { openContextMenu, openDropdown } from '../../lib/menu.svelte'
  import { setOutlineVisible } from '../../lib/ui.svelte'
  import Icon from '../../ui/Icon.svelte'
  import GroupRow from './GroupRow.svelte'
  import { project } from './project.svelte'
  import { projectMenuItems } from './projectMenu'

  let overMaterial = $state(false)
  /** Only folders can be dropped in the material. */
  const droppable = (): boolean =>
    drag.paths.length > 0 && drag.paths.every((path) => project.node(path)?.kind === 'group')

  function onHeadingOver(event: DragEvent): void {
    if (!droppable()) return
    event.preventDefault()
    dropTarget.path = null
    overMaterial = true
  }

  async function onHeadingDrop(event: DragEvent): Promise<void> {
    event.preventDefault()
    const paths = [...drag.paths]
    overMaterial = false
    clearDrag()
    if (paths.length) await project.move(paths, MATERIAL)
  }
</script>

<section class="column" aria-label={i18n.t('sidebar.groups')}>
  <header>
    <!-- The project and its settings: the project menu opens from here. -->
    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- the project’s name and menu at the top of the sidebar, a title that opens a menu -->
    <button
      class="project"
      type="button"
      aria-haspopup="menu"
      aria-label={i18n.t('project.menu')}
      onclick={(e) => openDropdown(e.currentTarget, projectMenuItems())}
    >
      <span class="project-name">{project.snapshot?.title}</span>
      <Icon name="chevron-down" size={14} />
    </button>
    <IconButton
      icon="list-tree"
      label={i18n.t('outline.title')}
      onclick={() => setOutlineVisible(true)}
    />
    <IconButton
      icon="plus"
      label={i18n.t('sidebar.newGroup')}
      onclick={() => void project.createGroup()}
    />
  </header>
  <div class="rows" role="tree" aria-label={i18n.t('sidebar.groups')} data-rows>
    {#if project.tree}
      <GroupRow node={project.tree} depth={0} />
    {/if}
    <!-- The material: folders outside the export, side by side under a heading, which is no folder
         of its own; a folder dropped on the heading takes its place among them. -->
    {#if project.outside.length}
      <div class="outside" role="group" aria-label={i18n.t('sidebar.material')}>
        <div
          class="material-heading"
          class:over={overMaterial}
          role="presentation"
          ondragover={onHeadingOver}
          ondragleave={() => (overMaterial = false)}
          ondrop={onHeadingDrop}
          oncontextmenu={(e) =>
            openContextMenu(e, [
              {
                label: i18n.t('sidebar.newMaterialFolder'),
                onselect: () => void project.createGroup(MATERIAL),
              },
            ])}
        >
          <h3>{i18n.t('sidebar.material')}</h3>
        </div>
        {#each project.outside as group (group.path)}
          <GroupRow node={group} depth={0} />
        {/each}
      </div>
    {:else if droppable()}
      <!-- Without material there is nothing here, until a folder is being dragged: then this is
           where it can be put, and the material begins with it. -->
      <div
        class="drop-zone"
        class:over={overMaterial}
        role="presentation"
        ondragover={onHeadingOver}
        ondragleave={() => (overMaterial = false)}
        ondrop={onHeadingDrop}
      >
        {i18n.t('sidebar.dropMaterial')}
      </div>
    {/if}
  </div>
</section>

<style>
  /* A pane of the sidebar, flat and full height (the sidebar draws the line to the next one). */
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
    min-height: var(--bar-height);
    padding: var(--sp-4) var(--sp-8);
  }
  /* The project: its name, as plain text, which breaks into lines when it is long; the project menu
     opens from it. Hovered, it gets a control's quiet ground. */
  .project {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-8);
    min-width: 0;
    min-height: var(--control-lg);
    padding: var(--sp-4) var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label);
    text-align: left;
    cursor: default;
    transition: background var(--duration);
  }
  .project:hover {
    background: var(--color-control);
  }
  .project:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .project-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    font: var(--type-emphasis);
    /* A very long title stops after three lines. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
  .outside {
    margin-top: var(--sp-16);
    padding-top: var(--sp-8);
    border-top: 1px solid var(--color-separator);
  }
  .drop-zone {
    margin-top: var(--sp-16);
    padding: var(--sp-12) var(--sp-8);
    border: 1px dashed var(--color-field-border);
    border-radius: var(--r-md);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
    text-align: center;
  }
  .drop-zone.over {
    border-color: var(--color-accent);
    background: var(--color-selection);
    color: var(--color-label);
  }
  .material-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--sp-4) 0 var(--sp-8);
    border-radius: var(--r-md);
  }
  .material-heading.over {
    background: var(--color-selection);
  }
  .outside h3 {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .rows {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-4) var(--sp-8) var(--sp-16);
  }
</style>
