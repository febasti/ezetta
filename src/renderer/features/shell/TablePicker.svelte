<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { ui } from '../../lib/ui.svelte'

  const ROWS = 8
  const COLUMNS = 8

  let rows = $state(3)
  let columns = $state(3)

  $effect(() => {
    if (ui.tablePicker) {
      rows = 3
      columns = 3
    }
  })

  function close(): void {
    ui.tablePicker = null
  }
  function pick(r: number, c: number): void {
    const request = ui.tablePicker
    close()
    request?.pick(r, c)
  }
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close()
    else if (event.key === 'ArrowRight') columns = Math.min(COLUMNS, columns + 1)
    else if (event.key === 'ArrowLeft') columns = Math.max(1, columns - 1)
    else if (event.key === 'ArrowDown') rows = Math.min(ROWS, rows + 1)
    else if (event.key === 'ArrowUp') rows = Math.max(1, rows - 1)
    else if (event.key === 'Enter') pick(rows, columns)
    else return
    event.preventDefault()
    event.stopPropagation()
  }
  function focusOnMount(node: HTMLElement): void {
    node.focus()
  }
</script>

{#if ui.tablePicker}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}>
    <div
      class="picker"
      role="dialog"
      tabindex="-1"
      aria-label={i18n.t('table.pickerTitle')}
      style:left="{ui.tablePicker.x}px"
      style:top="{ui.tablePicker.y}px"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKeydown}
      use:focusOnMount
    >
      <div class="grid" role="grid" aria-label={i18n.t('table.pickerGrid')}>
        {#each { length: ROWS } as _, r (r)}
          <div class="line" role="row">
            {#each { length: COLUMNS } as _, c (c)}
              <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a cell of the size grid -->
              <button
                type="button"
                role="gridcell"
                tabindex="-1"
                class:on={r < rows && c < columns}
                aria-label={i18n.t('table.size', { rows: r + 1, columns: c + 1 })}
                onpointerenter={() => {
                  rows = r + 1
                  columns = c + 1
                }}
                onclick={() => pick(r + 1, c + 1)}
              ></button>
            {/each}
          </div>
        {/each}
      </div>
      <p class="size" aria-live="polite">{i18n.t('table.size', { rows, columns })}</p>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-popover);
  }
  /* A small popover of cells: the ones the table would have are tinted in the accent. */
  .picker {
    position: fixed;
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .line {
    display: flex;
    gap: var(--sp-4);
  }
  button {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    cursor: default;
  }
  button.on {
    border-color: var(--color-accent);
    background: var(--color-selection);
  }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .size {
    margin: var(--sp-8) 0 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
    text-align: center;
  }
</style>
