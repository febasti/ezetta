<script lang="ts">
  import { tick } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import type { IconName } from '../../ui/Icon.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { search } from './search.svelte'

  // Opening the bar, or Cmd+F while it is open, puts the caret in the query field.
  $effect(() => {
    if (search.focusTick > 0) {
      void tick().then(() => {
        const field = document.getElementById('search-find') as HTMLInputElement | null
        field?.focus()
        field?.select()
      })
    }
  })

  const status = $derived.by(() => {
    if (search.query === '') return ''
    if (search.invalid) return i18n.t('search.invalid')
    if (search.count === 0) return i18n.t('search.none')
    const total = search.truncated ? `${search.count}+` : String(search.count)
    return `${search.position} / ${total}`
  })

  function onQueryKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      search.next(!event.shiftKey)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      search.close()
    }
  }
  function onReplaceKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.metaKey || event.ctrlKey) search.replaceEverything()
      else search.replaceOne()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      search.close()
    }
  }
</script>

{#snippet toggle(name: IconName, label: string, pressed: boolean, flip: () => void)}
  <IconButton
    icon={name}
    {label}
    {pressed}
    onclick={() => {
      flip()
      search.apply()
    }}
  />
{/snippet}

{#if search.open}
  <div class="bar" role="search" aria-label={i18n.t('search.label')}>
    <div class="line">
      <IconButton
        icon={search.replaceOpen ? 'chevron-down' : 'chevron-right'}
        label={i18n.t('search.toggleReplace')}
        expanded={search.replaceOpen}
        onclick={() => (search.replaceOpen = !search.replaceOpen)}
      />
      <span class="entry">
        <TextField
          id="search-find"
          value={search.query}
          onvalue={(v) => {
            search.query = v
            search.apply()
          }}
          invalid={search.invalid || (search.query !== '' && search.count === 0)}
          placeholder={i18n.t('search.find')}
          label={i18n.t('search.find')}
          onkeydown={onQueryKeydown}
        />
      </span>
      <span class="tools">
        {@render toggle(
          'letter-case',
          i18n.t('search.caseSensitive'),
          search.caseSensitive,
          () => (search.caseSensitive = !search.caseSensitive),
        )}
        {@render toggle(
          'whole-word',
          i18n.t('search.wholeWord'),
          search.wholeWord,
          () => (search.wholeWord = !search.wholeWord),
        )}
        {@render toggle(
          'regex',
          i18n.t('search.regexp'),
          search.regexp,
          () => (search.regexp = !search.regexp),
        )}
        <span class="status" aria-live="polite">{status}</span>
        <IconButton
          icon="arrow-up"
          label={i18n.t('search.previous')}
          disabled={search.count === 0}
          onclick={() => search.next(false)}
        />
        <IconButton
          icon="arrow-down"
          label={i18n.t('search.next')}
          disabled={search.count === 0}
          onclick={() => search.next(true)}
        />
        <IconButton icon="x" label={i18n.t('search.close')} onclick={() => search.close()} />
      </span>
    </div>
    {#if search.replaceOpen}
      <div class="line replace">
        <span class="entry">
          <TextField
            value={search.replacement}
            onvalue={(v) => (search.replacement = v)}
            placeholder={i18n.t('search.replaceWith')}
            label={i18n.t('search.replaceWith')}
            onkeydown={onReplaceKeydown}
          />
        </span>
        <span class="tools">
          <Button size="sm" onclick={() => search.replaceOne()}>{i18n.t('search.replace')}</Button>
          <Button size="sm" onclick={() => search.replaceEverything()}
            >{i18n.t('search.replaceAll')}</Button
          >
        </span>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The foundation's popover, floating at the top right of the text. A line wraps when the text is
   * narrow (the preview beside it), so the fields never shrink to nothing. */
  .bar {
    position: absolute;
    z-index: 3;
    top: var(--sp-12);
    /* The text is centered left of the scrollbar: stay off it. */
    right: calc(var(--sp-16) + var(--scrollbar-w, 0px));
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    width: min(520px, calc(100% - var(--sp-32) - var(--scrollbar-w, 0px)));
    padding: var(--sp-8);
    border-radius: var(--r-lg);
    background: var(--color-window);
    box-shadow: var(--shadow-float);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
  }
  /* The replace line starts under the field, past the button that opens it. */
  .replace {
    padding-left: calc(var(--control-md) + var(--sp-4));
  }
  .entry {
    flex: 1 1 160px;
    min-width: 140px;
  }
  .tools {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }
  .status {
    min-width: 5ch;
    padding: 0 var(--sp-4);
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
</style>
