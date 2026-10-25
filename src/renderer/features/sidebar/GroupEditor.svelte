<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import { ui } from '../../lib/ui.svelte'
  import FolderIcon, { folderColor, folderIconLabel } from '../../ui/FolderIcon.svelte'
  import { FOLDER_COLORS, FOLDER_ICON_SECTIONS } from '../../ui/folderIcons'
  import { matchesQuery } from '../../lib/commands'
  import Dialog from '../../ui/kit/Dialog.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { project } from './project.svelte'

  /**
   * Edits a group of the sidebar in one place: its name, the colour of its symbol, and the
   * symbol. Colour and symbol apply at once, so the row shows them while choosing; the name applies
   * with Enter or when the popover closes (the ×, or a click outside), since renaming moves the
   * folder on disk. Escape keeps the old name. It opens in the middle of the window, without a scrim,
   * so the group's row stays in view.
   */

  const node = $derived.by(() => {
    const path = ui.groupEditor?.path
    const found = path === undefined ? null : project.node(path)
    return found?.kind === 'group' ? found : null
  })
  let name = $state('')
  let query = $state('')
  let symbols = $state<HTMLElement>()

  $effect(() => {
    // A new group to edit: its name in the field, and no search. Only the group decides; a new
    // symbol or colour (a new tree) must not put the old name back while it is being typed.
    const path = ui.groupEditor?.path
    if (path === undefined) return
    untrack(() => {
      name = project.node(path)?.name ?? ''
      query = ''
    })
    // The name is ready to type when it opens.
    void tick().then(() => {
      const field = document.getElementById('group-name') as HTMLInputElement | null
      field?.focus()
      field?.select()
    })
  })

  /** The plain folder is the symbol "folder": choosing it stores nothing. */
  const current = $derived(node?.icon ?? 'folder')
  const sections = $derived(
    FOLDER_ICON_SECTIONS.map((section) => ({
      id: section.id,
      icons: section.icons.filter(
        (icon) => query.trim() === '' || matchesQuery(`${folderIconLabel(icon)} ${icon}`, query),
      ),
    })).filter((section) => section.icons.length > 0),
  )

  function close(keepName = true): void {
    const editing = ui.groupEditor
    ui.groupEditor = null
    if (editing && keepName) void project.commitRename(editing.path, name)
  }

  function setIcon(icon: string): void {
    if (node) void project.setIcon(node.path, icon === 'folder' ? null : icon)
  }
  function setColor(color: string | null): void {
    if (node) void project.setColor(node.path, color)
  }

  /** The symbol buttons, in order, for the arrow keys. */
  const cells = (): HTMLButtonElement[] =>
    Array.from(symbols?.querySelectorAll<HTMLButtonElement>('[data-icon]') ?? [])

  /** The arrow keys move between the symbols, eight to a row. */
  function onSymbolKeydown(event: KeyboardEvent): void {
    if (!(event.target as HTMLElement).dataset['icon']) return
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[event.key]
    if (step === undefined) return
    const all = cells()
    const at = all.indexOf(event.target as HTMLButtonElement)
    all[Math.min(all.length - 1, Math.max(0, at + step))]?.focus()
    event.preventDefault()
  }
  const COLUMNS = 8
</script>

{#if ui.groupEditor && node}
  <Dialog
    title={i18n.t('groupEditor.title')}
    closeLabel={i18n.t('groupEditor.close')}
    width="narrow"
    position="center"
    onclose={() => close()}
    onescape={() => close(false)}
  >
    <Form stacked>
      <FormRow label={i18n.t('groupEditor.name')} for="group-name">
        <TextField
          id="group-name"
          value={name}
          onvalue={(v) => (name = v)}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              close()
            }
          }}
        />
      </FormRow>
      <FormRow label={i18n.t('groupEditor.color')}>
        <div class="colors" role="radiogroup" aria-label={i18n.t('groupEditor.color')}>
          {#each [null, ...FOLDER_COLORS] as color (color ?? 'default')}
            {@const chosen = (node.color ?? null) === color}
            <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a colour swatch -->
            <button
              type="button"
              class="swatch"
              class:chosen
              role="radio"
              aria-checked={chosen}
              title={i18n.t(color ? `color.${color}` : 'color.default')}
              aria-label={i18n.t(color ? `color.${color}` : 'color.default')}
              style:--swatch={folderColor(color) ?? 'var(--color-label-secondary)'}
              onclick={() => setColor(color)}
            ></button>
          {/each}
        </div>
      </FormRow>
      <FormRow label={i18n.t('groupEditor.icon')}>
        <TextField
          value={query}
          onvalue={(v) => (query = v)}
          type="search"
          size="sm"
          label={i18n.t('icon.find')}
          placeholder={i18n.t('icon.find')}
        />
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="scroll" bind:this={symbols} onkeydown={onSymbolKeydown}>
          {#each sections as section (section.id)}
            <div class="section" role="group" aria-label={i18n.t(`icon.section.${section.id}`)}>
              <span class="heading">{i18n.t(`icon.section.${section.id}`)}</span>
              <div class="grid">
                {#each section.icons as icon (icon)}
                  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a cell of the symbol grid -->
                  <button
                    type="button"
                    class="cell"
                    class:on={current === icon}
                    data-icon={icon}
                    title={folderIconLabel(icon)}
                    aria-label={folderIconLabel(icon)}
                    aria-pressed={current === icon}
                    onclick={() => setIcon(icon)}
                  >
                    <FolderIcon {icon} color={node.color} size={16} />
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <p class="none">{i18n.t('icon.noMatch')}</p>
          {/each}
        </div>
      </FormRow>
    </Form>
  </Dialog>
{/if}

<style>
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-8);
  }
  /* A swatch is the colour as a dot, with a ring when chosen. */
  .swatch {
    width: var(--control-sm);
    height: var(--control-sm);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--swatch);
    cursor: default;
  }
  .swatch.chosen {
    box-shadow:
      0 0 0 2px var(--color-window),
      0 0 0 4px var(--swatch);
  }
  .swatch:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--color-window),
      0 0 0 5px var(--color-focus);
  }
  .scroll {
    display: flex;
    flex-direction: column;
    gap: var(--sp-12);
    max-height: 280px;
    margin-top: var(--sp-4);
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .heading {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  /* Eight to a row, sharing the width beside the scrollbar. */
  .grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: var(--sp-4);
  }
  .cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: var(--control-md);
    padding: 0;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--color-label-secondary);
    cursor: default;
    transition: background var(--duration);
  }
  .cell:hover {
    background: var(--color-control);
  }
  .cell.on {
    background: var(--color-selection);
  }
  .cell:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--color-focus);
  }
  .none {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
