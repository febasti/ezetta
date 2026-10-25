<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { shortcutLabel } from '../../lib/commands'
  import { openDropdown } from '../../lib/menu.svelte'
  import { setGroupsVisible, setSheetsVisible, toggleRightSidebar, ui } from '../../lib/ui.svelte'
  import ToolButton from '../../ui/kit/ToolbarButton.svelte'
  import { nextHeadingStyle } from '@core/typst/edit'
  import type { IconName } from '../../ui/Icon.svelte'
  import { editorCommands, styleCommandId } from '../editor/editorCommands'
  import type { EditorCommandId } from '../editor/editorCommands'
  import { editor } from '../editor/editorSession.svelte'
  import { project } from '../sidebar/project.svelte'

  /** Text tools need an open sheet in the editor. */
  const canEdit = $derived(project.mode === 'editor' && editor.path !== null)

  /** The formats in the format menu, with the key of each in the caret's format state. */
  const FORMAT_TOOLS = [
    { id: 'superscript', formats: 'superscript' },
    { id: 'subscript', formats: 'subscript' },
    { id: 'smallcaps', formats: 'smallcaps' },
  ] as const

  /** The heading button shows the level of the heading the caret is in. */
  const headingIcon = $derived<IconName>(
    editor.paragraph.kind === 'heading' && editor.paragraph.level >= 1
      ? (`heading-${Math.min(editor.paragraph.level, 4)}` as IconName)
      : 'heading',
  )

  /** Name of a command with its shortcut, for the tooltip. */
  function tip(id: EditorCommandId): string {
    const command = editorCommands.find((c) => c.id === id)!
    return command.shortcut
      ? `${command.label()} (${shortcutLabel(command.shortcut)})`
      : command.label()
  }
</script>

<div class="toolbar" role="toolbar" aria-label={i18n.t('toolbar.label')}>
  <div class="side left">
    <div class="group" role="group" aria-label={i18n.t('toolbar.panels')}>
      <ToolButton
        icon="folder"
        label={i18n.t('sidebar.groups')}
        title={i18n.t('toolbar.groupsTitle')}
        pressed={ui.groupsVisible && !ui.outlineVisible}
        onclick={() => setGroupsVisible(ui.outlineVisible || !ui.groupsVisible)}
      />
      <ToolButton
        icon="file"
        label={i18n.t('sidebar.sheets')}
        title={i18n.t('toolbar.sheetsTitle')}
        pressed={ui.sheetsVisible && !ui.outlineVisible}
        onclick={() => setSheetsVisible(ui.outlineVisible || !ui.sheetsVisible)}
      />
    </div>
    <div class="group" role="group" aria-label={i18n.t('toolbar.history')}>
      <ToolButton
        icon="undo"
        label={i18n.t('toolbar.undo')}
        title={tip('undo')}
        disabled={!canEdit || !editor.canUndo}
        onclick={() => editor.run('undo')}
      />
      <ToolButton
        icon="redo"
        label={i18n.t('toolbar.redo')}
        title={tip('redo')}
        disabled={!canEdit || !editor.canRedo}
        onclick={() => editor.run('redo')}
      />
    </div>
  </div>
  <div class="center">
    <div class="group" role="group" aria-label={i18n.t('toolbar.text')}>
      <ToolButton
        icon={headingIcon}
        label={i18n.t('toolbar.heading')}
        title={i18n.t('toolbar.headingTitle')}
        disabled={!canEdit}
        pressed={canEdit && editor.paragraph.kind === 'heading'}
        onclick={() => editor.run(styleCommandId(nextHeadingStyle(editor.paragraph)))}
      />
      <ToolButton
        icon="italic"
        label={i18n.t('toolbar.emphasis')}
        title={tip('emphasis')}
        disabled={!canEdit}
        pressed={canEdit && editor.formats.emphasis}
        onclick={() => editor.run('emphasis')}
      />
      <ToolButton
        icon="bold"
        label={i18n.t('toolbar.strong')}
        title={tip('strong')}
        disabled={!canEdit}
        pressed={canEdit && editor.formats.strong}
        onclick={() => editor.run('strong')}
      />
      <ToolButton
        icon="typography"
        label={i18n.t('toolbar.format')}
        title={i18n.t('toolbar.formatTitle')}
        menu
        disabled={!canEdit}
        pressed={canEdit &&
          (editor.formats.subscript || editor.formats.superscript || editor.formats.smallcaps)}
        onclick={(event) =>
          openDropdown(
            event.currentTarget as HTMLElement,
            FORMAT_TOOLS.map(({ id, formats }) => ({
              label: editorCommands.find((c) => c.id === id)!.label(),
              checked: editor.formats[formats],
              onselect: () => editor.run(id),
            })),
          )}
      />
      <ToolButton
        icon="link"
        label={i18n.t('toolbar.link')}
        title={tip('link')}
        disabled={!canEdit}
        onclick={() => editor.run('link')}
      />
      <ToolButton
        icon="list-numbers"
        label={i18n.t('toolbar.list')}
        title={i18n.t('toolbar.listTitle')}
        menu
        disabled={!canEdit}
        pressed={canEdit &&
          (editor.paragraph.kind === 'bullet' || editor.paragraph.kind === 'numbered')}
        onclick={(event) =>
          openDropdown(event.currentTarget as HTMLElement, [
            {
              label: i18n.t('list.bullet'),
              checked: editor.paragraph.kind === 'bullet',
              shortcut: editorCommands.find((c) => c.id === 'style-bullet')?.shortcut,
              onselect: () => editor.run('style-bullet'),
            },
            {
              label: i18n.t('list.numbered'),
              checked: editor.paragraph.kind === 'numbered',
              shortcut: editorCommands.find((c) => c.id === 'style-numbered')?.shortcut,
              onselect: () => editor.run('style-numbered'),
            },
          ])}
      />
    </div>
    <div class="group" role="group" aria-label={i18n.t('toolbar.sources')}>
      <ToolButton
        icon="quote"
        label={i18n.t('toolbar.quote')}
        title={tip('quote-inline')}
        menu
        disabled={!canEdit}
        pressed={canEdit &&
          (editor.paragraph.kind === 'quote' ||
            editor.paragraph.kind === 'epigraph' ||
            editor.inlineQuote)}
        onclick={(event) =>
          openDropdown(event.currentTarget as HTMLElement, [
            {
              label: i18n.t('quote.inline'),
              checked: editor.inlineQuote,
              onselect: () => editor.run('quote-inline'),
            },
            {
              label: i18n.t('quote.block'),
              checked: editor.paragraph.kind === 'quote',
              onselect: () => editor.run('style-quote'),
            },
            {
              label: i18n.t('quote.epigraph'),
              checked: editor.paragraph.kind === 'epigraph',
              onselect: () => editor.run('style-epigraph'),
            },
          ])}
      />
      <ToolButton
        icon="citation"
        showLabel
        label={i18n.t('toolbar.citation')}
        title={tip('citation')}
        disabled={!canEdit}
        onclick={() => editor.run('citation')}
      />
      <ToolButton
        icon="tag"
        showLabel
        label={i18n.t('toolbar.crossRef')}
        title={tip('cross-reference')}
        disabled={!canEdit}
        onclick={() => editor.run('cross-reference')}
      />
      <ToolButton
        icon="asterisk"
        showLabel
        label={i18n.t('toolbar.footnote')}
        title={tip('footnote')}
        disabled={!canEdit}
        onclick={() => editor.run('footnote')}
      />
    </div>
    <div class="group" role="group" aria-label={i18n.t('toolbar.insert')}>
      <ToolButton
        icon="table"
        label={i18n.t('toolbar.table')}
        title={i18n.t('cmd.table')}
        menu
        disabled={!canEdit}
        onclick={(event) => {
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
          ui.tablePicker = {
            x: rect.left,
            y: rect.bottom + 2,
            pick: (rows, columns) => editor.insertTable(rows, columns),
          }
        }}
      />
      <ToolButton
        icon="image"
        label={i18n.t('toolbar.image')}
        title={tip('figure')}
        menu
        disabled={!canEdit}
        onclick={(event) =>
          openDropdown(event.currentTarget as HTMLElement, [
            { label: i18n.t('image.insertFigure'), onselect: () => editor.run('figure') },
            { label: i18n.t('image.insertInline'), onselect: () => editor.run('inline-image') },
          ])}
      />
      <ToolButton
        icon="formula"
        label={i18n.t('toolbar.formula')}
        title={tip('formula')}
        menu
        disabled={!canEdit}
        onclick={(event) =>
          openDropdown(event.currentTarget as HTMLElement, [
            { label: i18n.t('formula.insertInline'), onselect: () => editor.run('formula') },
            {
              label: i18n.t('formula.insertDisplay'),
              onselect: () => editor.run('formula-display'),
            },
          ])}
      />
    </div>
    <div class="group" role="group" aria-label={i18n.t('toolbar.check')}>
      <ToolButton
        icon="highlighter"
        label={i18n.t('toolbar.highlight')}
        title={tip('highlight')}
        disabled={!canEdit}
        pressed={canEdit && editor.formats.highlight}
        onclick={() => editor.run('highlight')}
      />
      <ToolButton
        icon="comment"
        label={i18n.t('toolbar.comment')}
        title={tip('comment')}
        disabled={!canEdit}
        onclick={() => editor.run('comment')}
      />
    </div>
  </div>
  <div class="side right">
    <div class="group" role="group" aria-label={i18n.t('toolbar.view')}>
      <ToolButton
        icon="panel-right"
        label={i18n.t('toolbar.sidebar')}
        title={i18n.t('cmd.sidebar')}
        pressed={ui.rightSidebarVisible}
        onclick={toggleRightSidebar}
      />
    </div>
  </div>
</div>

<style>
  /* The toolbar is the title bar on macOS: its tools stand on the window's ground, without cards,
     and its empty space moves the window (base.css). A short hairline between two groups. */
  .toolbar {
    display: grid;
    /* The sides take equal room, so the tools between them are centred on the toolbar; in a window
       too narrow for that, each side keeps what its tools need and the toolbar scrolls. */
    grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
    flex: none;
    align-items: center;
    gap: var(--sp-8);
    height: calc(var(--titlebar-height) + 1px);
    padding: 0 var(--sp-12);
    border-bottom: 1px solid var(--color-separator);
    background: var(--color-window);
    overflow-x: auto;
    -webkit-app-region: drag;
  }
  .toolbar :global(button),
  .toolbar :global(select),
  .toolbar :global(input) {
    -webkit-app-region: no-drag;
  }
  .side {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .side.right {
    justify-content: flex-end;
  }
  /* The traffic lights (macOS) sit before the left tools. The room is inside the left side, whose
     column is as wide as the right one, so the tools between them stay centred on the window. */
  .side:not(.right) {
    padding-left: max(0px, calc(var(--chrome-inset, 0px) - var(--sp-12)));
  }
  .center {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-8);
  }
  .group {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-4);
  }
  .group + .group::before {
    content: '';
    width: 1px;
    height: var(--sp-16);
    margin: 0 var(--sp-4) 0 0;
    background: var(--color-separator);
  }
</style>
