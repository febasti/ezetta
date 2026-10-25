<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import {
    allCommands,
    COMMAND_GROUPS,
    commandGroup,
    matchesQuery,
    shortcutLabel,
  } from '../../lib/commands'
  import { keybindings } from '../../lib/keybindings.svelte'
  import { isMac, isModifierKey, isReserved, sameShortcut, shortcutOf } from '../../lib/shortcut'
  import type { Shortcut } from '../../lib/shortcut'
  import Button from '../../ui/kit/Button.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import TextField from '../../ui/kit/TextField.svelte'

  /**
   * The shortcuts of the app's commands: each command with the shortcut it has now. A
   * click on the shortcut waits for the next key combination, which becomes the new one; Backspace
   * takes the shortcut off, Esc leaves it. A combination another command has is only taken over
   * when the writer says so, and the ones the system or the editor keep are refused.
   */
  let query = $state('')
  /** The command whose shortcut waits for a key combination. */
  let recording = $state<string | null>(null)
  /** A combination another command has, waiting for the writer's answer. */
  let pending = $state<{ id: string; shortcut: Shortcut; otherId: string } | null>(null)
  let problem = $state<string | null>(null)

  /** Undo and redo keep the system's keys (the editor's own history), so they are not listed. */
  const FIXED = new Set(['editor-undo', 'editor-redo'])

  const mod = (): string => (isMac() ? '⌘' : i18n.locale === 'de' ? 'Strg' : 'Ctrl')
  const commands = $derived(allCommands())
  const groups = $derived(
    COMMAND_GROUPS.map((group) => ({
      group,
      items: commands.filter(
        (command) =>
          !FIXED.has(command.id) &&
          commandGroup(command.id) === group &&
          matchesQuery(
            `${command.label()} ${command.shortcut ? shortcutLabel(command.shortcut) : ''}`,
            query,
          ),
      ),
    })).filter(({ items }) => items.length > 0),
  )
  const pendingNames = $derived(
    pending
      ? { other: commands.find((command) => command.id === pending!.otherId)?.label() ?? '' }
      : null,
  )

  function start(id: string): void {
    recording = id
    pending = null
    problem = null
  }

  function stop(): void {
    recording = null
    problem = null
  }

  function assign(id: string, shortcut: Shortcut | null): void {
    const command = commands.find((candidate) => candidate.id === id)
    if (!command) return
    if (shortcut === null) {
      keybindings.set(id, null, command.defaultShortcut)
      return stop()
    }
    if (isReserved(shortcut)) {
      problem = i18n.t('shortcuts.reserved', { keys: shortcutLabel(shortcut) })
      return
    }
    const other = commands.find((c) => c.id !== id && sameShortcut(c.shortcut, shortcut))
    if (other) {
      pending = { id, shortcut, otherId: other.id }
      return stop()
    }
    keybindings.set(id, shortcut, command.defaultShortcut)
    stop()
  }

  function takeOver(): void {
    if (!pending) return
    const { id, shortcut, otherId } = pending
    const command = commands.find((c) => c.id === id)
    const other = commands.find((c) => c.id === otherId)
    if (command && other) {
      keybindings.set(otherId, null, other.defaultShortcut)
      keybindings.set(id, shortcut, command.defaultShortcut)
    }
    pending = null
  }

  /** While a shortcut waits for its keys, they are for it alone: nothing else in the app sees them. */
  function onKeydown(event: KeyboardEvent): void {
    if (recording === null) return
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    // Tab leaves the button as it always does.
    if (plain && event.key === 'Tab') return stop()
    event.preventDefault()
    event.stopPropagation()
    if (isModifierKey(event)) return
    if (plain && event.key === 'Escape') return stop()
    if (plain && (event.key === 'Backspace' || event.key === 'Delete')) {
      return assign(recording, null)
    }
    const shortcut = shortcutOf(event)
    if (!shortcut) {
      problem = i18n.t('shortcuts.needMod', { mod: mod() })
      return
    }
    assign(recording, shortcut)
  }

  function onMousedown(event: MouseEvent): void {
    if (recording === null) return
    if (!(event.target as Element | null)?.closest('[data-recording="true"]')) stop()
  }
</script>

<svelte:window onkeydowncapture={onKeydown} onmousedowncapture={onMousedown} />

<div class="pane">
  <div class="top">
    <div class="search">
      <TextField
        type="search"
        size="sm"
        label={i18n.t('shortcuts.search')}
        placeholder={i18n.t('shortcuts.search')}
        value={query}
        onvalue={(value) => (query = value)}
      />
    </div>
    <Button size="sm" disabled={!keybindings.anyCustom} onclick={() => keybindings.resetAll()}>
      {i18n.t('shortcuts.resetAll')}
    </Button>
  </div>
  <p class="hint">{i18n.t('shortcuts.hint', { mod: mod() })}</p>

  {#if problem}
    <Callout tone="danger">{problem}</Callout>
  {/if}
  {#if pending && pendingNames}
    <Callout tone="warning">
      <p class="question">
        {i18n.t('shortcuts.taken', {
          keys: shortcutLabel(pending.shortcut),
          name: pendingNames.other,
        })}
      </p>
      <div class="answer">
        <Button size="sm" onclick={() => (pending = null)}>{i18n.t('shortcuts.cancel')}</Button>
        <Button size="sm" variant="primary" onclick={takeOver}>
          {i18n.t('shortcuts.takeOver')}
        </Button>
      </div>
    </Callout>
  {/if}

  <div class="list" tabindex="-1">
    {#each groups as { group, items } (group)}
      <Section title={i18n.t(`shortcuts.group.${group}`)}>
        <div role="list">
          {#each items as command (command.id)}
            <ListRow
              role="listitem"
              aria-selected={undefined}
              tabindex={undefined}
              title={command.label()}
            >
              {#snippet accessory()}
                <span class="keys" data-recording={recording === command.id}>
                  {#if keybindings.isCustom(command.id)}
                    <IconButton
                      icon="undo"
                      size="sm"
                      label={i18n.t('shortcuts.reset', { name: command.label() })}
                      onclick={() => keybindings.reset(command.id)}
                    />
                  {/if}
                  <Button
                    size="sm"
                    variant={recording === command.id ? 'primary' : 'secondary'}
                    onclick={() => (recording === command.id ? stop() : start(command.id))}
                  >
                    {recording === command.id
                      ? i18n.t('shortcuts.recording')
                      : command.shortcut
                        ? shortcutLabel(command.shortcut)
                        : i18n.t('shortcuts.none')}
                  </Button>
                </span>
              {/snippet}
            </ListRow>
          {/each}
        </div>
      </Section>
    {:else}
      <EmptyState icon="search" title={i18n.t('shortcuts.empty')} />
    {/each}
  </div>
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .top {
    display: flex;
    gap: var(--sp-8);
    align-items: center;
  }
  .search {
    flex: 1;
    min-width: 0;
  }
  .hint {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .question {
    margin: 0 0 var(--sp-8);
  }
  .answer {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-8);
  }
  /* The list scrolls on its own, so the search and the hint stay in sight. */
  .list {
    max-height: 46vh;
    overflow-y: auto;
  }
  .keys {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
  }
</style>
