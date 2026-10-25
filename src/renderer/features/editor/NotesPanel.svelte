<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import { editor } from './editorSession.svelte'
  import { mountNoteEditor } from './footnoteEditor'
  import { mountNoteText } from './noteText'

  /** Writes the open note in its row: the small editor takes the place of the text. */
  function write(host: HTMLElement) {
    const view = editor.view
    const handle = view ? mountNoteEditor(host, view) : null
    handle?.focus()
    host.scrollIntoView({ block: 'nearest' })
    return { destroy: () => handle?.destroy() }
  }

  /** Draws a note's words with the markup of the text; an empty note shows its word instead. */
  function draw(host: HTMLElement, source: string) {
    const view = editor.view
    const text =
      view && source.trim() !== ''
        ? mountNoteText(host, view, source, { wrap: false, onSize: () => undefined })
        : null
    if (!text) host.textContent = i18n.t('footnote.empty')
    return {
      update: (next: string) => void text?.update(next),
      destroy: () => text?.destroy(),
    }
  }
</script>

<!-- Lists the footnotes of the open sheet in order, and writes each one in place (mode "Fußnotenliste").
     It also takes the place of the margin column when the window is too narrow for it. -->
<section class="panel" aria-label={i18n.t('footnote.panel')}>
  <h2>
    {i18n.t('footnote.panel')} <span class="count">{editor.notes.length}</span>
  </h2>
  <ol>
    {#each editor.notes as note, index (index)}
      <li>
        {#if editor.activeNote === index}
          <!-- The open note: a row on the selection's ground with the small editor in it (not a
               ListRow, which would keep its text from being selected). -->
          <div class="editing">
            <span class="number">{note.number}</span>
            <div
              class="write"
              use:write
              aria-label={i18n.t('footnote.editor', { number: note.number })}
            ></div>
          </div>
        {:else}
          <ListRow
            role="button"
            tabindex={0}
            aria-selected={undefined}
            aria-label={i18n.t('footnote.edit', { number: note.number })}
            onclick={() => editor.openNote(index)}
            onkeydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                editor.openNote(index)
              }
            }}
          >
            {#snippet leading()}<span class="number">{note.number}</span>{/snippet}
            {#snippet content()}
              <span class="text note-words" class:empty={note.text === ''} use:draw={note.source}
              ></span>
            {/snippet}
          </ListRow>
        {/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  /* Under the text, behind a hairline: a caption with the count, then a row per note. */
  .panel {
    flex: none;
    max-height: 30vh;
    overflow-y: auto;
    padding: var(--sp-8) var(--inset-pane) var(--sp-12);
    border-top: 1px solid var(--color-separator);
    background: var(--color-window);
  }
  h2 {
    margin: 0 0 var(--sp-4);
    padding: 0 var(--sp-8);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .count {
    margin-left: var(--sp-4);
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .number {
    min-width: 1.5em;
    color: var(--color-accent);
    font: var(--type-emphasis);
    font-variant-numeric: tabular-nums;
  }
  /* A note's words are part of the text: they are set like it. */
  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-label-secondary);
    font-family: var(--font-writing);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty {
    color: var(--color-label-tertiary);
  }
  .editing {
    display: flex;
    align-items: baseline;
    gap: var(--sp-8);
    padding: var(--sp-4) var(--sp-8);
    border-radius: var(--r-md);
    background: var(--color-selection);
  }
  .write {
    flex: 1;
    min-width: 0;
    color: var(--color-label);
  }
</style>
