<script lang="ts">
  import { basename } from '@core/project/paths'
  import { i18n } from '../../i18n/i18n.svelte'
  import { ui } from '../../lib/ui.svelte'
  import { project } from '../sidebar/project.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import Editor from './Editor.svelte'
  import FlowView from './FlowView.svelte'
  import NotesPanel from './NotesPanel.svelte'
  import SearchBar from './SearchBar.svelte'
  import SheetBadge from './SheetBadge.svelte'
  import { editor } from './editorSession.svelte'

  const name = $derived(editor.path ? basename(editor.path).replace(/\.typ$/i, '') : '')
</script>

<main
  class="pane"
  style:--scrollbar-w="{ui.scrollbarWidth}px"
  style:--col-left={ui.column ? `${ui.column.left}px` : undefined}
  style:--col-width={ui.column ? `${ui.column.width}px` : undefined}
>
  {#if editor.conflict}
    <div class="banner">
      <Callout tone="warning">
        <div class="conflict">
          <span>{i18n.t('editor.externalChange')}</span>
          <Button size="sm" onclick={() => editor.keepMine()}>{i18n.t('editor.keepMine')}</Button>
          <Button size="sm" variant="primary" onclick={() => void editor.reload()}
            >{i18n.t('editor.reload')}</Button
          >
        </div>
      </Callout>
    </div>
  {/if}
  {#if editor.orphaned}
    <div class="banner"><Callout tone="warning">{i18n.t('editor.orphaned')}</Callout></div>
  {/if}

  {#if project.mode === 'flow' || editor.path}
    <SheetBadge />
  {/if}
  {#if project.mode === 'editor' && editor.path}
    <SearchBar />
  {/if}

  {#if project.mode === 'flow'}
    <FlowView />
  {:else if editor.path}
    {#key editor.mountKey}
      <Editor
        initial={editor.initial}
        label={i18n.t('editor.label', { name })}
        lang={project.snapshot?.language ?? 'de'}
        cursor={editor.initialCursor}
      />
    {/key}
  {:else}
    <div class="empty"><p>{i18n.t('editor.empty')}</p></div>
  {/if}

  {#if project.mode === 'editor' && editor.path && editor.notes.length > 0 && (ui.footnoteMode === 'list' || editor.notesLayout === 'panel')}
    <NotesPanel />
  {/if}
</main>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background: var(--color-window);
    /* The badge floats in the corner. */
    position: relative;
  }
  /* A message about the sheet above the text: a callout with its buttons (the main one last). */
  .banner {
    flex: none;
    margin: var(--sp-12) var(--sp-24) 0;
  }
  .conflict {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-8);
  }
  .conflict span {
    flex: 1;
  }
  .empty {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    color: var(--color-label-tertiary);
  }
</style>
