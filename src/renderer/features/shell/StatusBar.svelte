<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { formatNumber, relativeTime } from '../../lib/format'
  import { openDropdown } from '../../lib/menu.svelte'
  import { proofActive, setShowSource, showRightTab, ui } from '../../lib/ui.svelte'
  import { proof, proofWaiting } from '../proof/proof.svelte'
  import Spinner from '../../ui/Spinner.svelte'
  import ToolbarButton from '../../ui/kit/ToolbarButton.svelte'
  import { paragraphLabel } from '../editor/editorCommands'
  import { editor } from '../editor/editorSession.svelte'
  import { backup } from '../history/backup.svelte'
  import { history } from '../history/history.svelte'
  import { project } from '../sidebar/project.svelte'

  const num = (n: number): string => formatNumber(n, i18n.locale)

  const sheet = $derived(editor.path ? project.node(editor.path) : null)
  const goal = $derived(sheet?.kind === 'sheet' ? sheet.goal : null)
  const sheetWords = $derived(editor.liveStats.words)
  const progress = $derived(goal ? Math.min(1, sheetWords / goal) : null)
  const flowSheets = $derived(project.mode === 'flow' ? project.flowPaths : [])
  const flowWords = $derived(
    flowSheets.reduce((sum, path) => {
      const node = project.node(path)
      return sum + (node?.kind === 'sheet' ? node.words : 0)
    }, 0),
  )
  const proofLabel = $derived.by(() => {
    if (!proofActive()) return i18n.t('statusbar.proof.idle')
    if (proofWaiting() && proof.state === 'ready') return i18n.t('statusbar.proof.checking')
    if (proof.state === 'ready') {
      const count = editor.issues.length
      return count === 0
        ? i18n.t('statusbar.proof.none')
        : i18n.t('statusbar.proof.count', { count: num(count) })
    }
    if (proof.state === 'missing') return i18n.t('statusbar.proof.missing')
    if (proof.state === 'failed') return i18n.t('statusbar.proof.failed')
    return i18n.t('statusbar.proof.starting')
  })
  const projectGoal = $derived(project.snapshot?.goalWords ?? null)

  /** The time, so "vor 5 Minuten" stays right while nothing else changes. */
  let now = $state(Date.now())
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000)
    return () => clearInterval(timer)
  })
  /** What the status bar says of the backup, and whether it needs the writer's attention. */
  const backupState = $derived.by((): { text: string; tone: 'ok' | 'warn' | 'bad' } | null => {
    const status = backup.status
    if (!status || !project.snapshot) return null
    if (status.running) return { text: i18n.t('statusbar.backup.running'), tone: 'ok' }
    if (!status.configured) return { text: i18n.t('statusbar.backup.none'), tone: 'warn' }
    if (!status.reachable || status.error)
      return { text: i18n.t('statusbar.backup.problem'), tone: 'bad' }
    const ago = status.lastAt === null ? null : relativeTime(status.lastAt, now, i18n.locale)
    return {
      text: i18n.t('statusbar.backup.last', {
        when: status.lastAt === null ? '–' : (ago ?? i18n.t('statusbar.backup.justNow')),
      }),
      tone: 'ok',
    }
  })
</script>

<!-- The few things worth seeing at all times: the words of the sheet and the project, and the
     switches and states of the text. Everything else is in the Statistik tab and the export. -->
<footer>
  <div class="group">
    {#if project.mode === 'flow'}
      <span class="item">
        {i18n.t('statusbar.flow', { sheets: num(flowSheets.length), words: num(flowWords) })}
      </span>
    {:else if editor.path}
      <span class="item">
        {goal
          ? i18n.t('statusbar.wordsOfGoal', { count: num(sheetWords), goal: num(goal) })
          : i18n.t('statusbar.words', { count: num(sheetWords) })}
      </span>
      {#if progress !== null}
        <span
          class="bar"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress * 100)}
        >
          <span class="fill" style:width="{progress * 100}%"></span>
        </span>
      {/if}
    {/if}
    {#if project.snapshot}
      <span class="item muted">
        {projectGoal
          ? i18n.t('statusbar.projectOfGoal', {
              count: num(project.snapshot.totalWords),
              goal: num(projectGoal),
            })
          : i18n.t('statusbar.project', { count: num(project.snapshot.totalWords) })}
      </span>
    {/if}
  </div>
  <div class="group">
    {#if project.snapshot}
      <ToolbarButton
        size="sm"
        label={i18n.t('toolbar.source')}
        title={i18n.t('cmd.showSource')}
        pressed={ui.showSource}
        onclick={() => setShowSource(!ui.showSource)}
      />
    {/if}
    {#if editor.path && project.mode === 'editor'}
      <span class="proof">
        {#if proofWaiting()}<Spinner size={12} />{/if}
        <ToolbarButton
          size="sm"
          label={proofLabel}
          title={proofActive()
            ? i18n.t(`proof.state.${proof.state}`)
            : i18n.t('statusbar.proof.open')}
          onclick={() => showRightTab('proof')}
        />
      </span>
      <ToolbarButton
        size="sm"
        menu
        label={i18n.t('statusbar.paragraph', { style: paragraphLabel(editor.paragraph) })}
        onclick={(e) => openDropdown(e.currentTarget as HTMLElement, editor.paragraphMenuItems())}
      />
    {/if}
    {#if backupState}
      <ToolbarButton
        size="sm"
        tone={backupState.tone === 'bad'
          ? 'danger'
          : backupState.tone === 'warn'
            ? 'warning'
            : 'quiet'}
        label={backupState.text}
        title={i18n.t('statusbar.backup.open')}
        onclick={() => void history.show('backup')}
      />
    {/if}
    {#if editor.path}
      <span class="item save {editor.saveState}" role="status"
        >{i18n.t(`save.${editor.saveState}`)}</span
      >
    {/if}
  </div>
</footer>

<style>
  /* The foot of the window: quiet facts on the left, the text's switches and states on the right. */
  footer {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-24);
    height: calc(var(--statusbar-height) + 1px);
    padding: 0 var(--sp-12) 0 var(--sp-16);
    border-top: 1px solid var(--color-separator);
    background: var(--color-window);
    color: var(--color-label);
    font: var(--type-body);
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    min-width: 0;
  }
  /* The facts on the left give way (and are cut with an ellipsis) before the switches on the right. */
  .group:first-child {
    flex: 0 1 auto;
    overflow: hidden;
  }
  .group:first-child .item {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group + .group {
    flex: none;
    gap: var(--sp-4);
  }
  .item {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--color-label-secondary);
  }
  .proof {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
  }
  /* How far the sheet is towards its goal. */
  .bar {
    width: 80px;
    height: var(--sp-4);
    border-radius: 2px;
    background: var(--color-control);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--color-accent);
  }
  .save {
    padding-left: var(--sp-8);
    color: var(--color-label-tertiary);
  }
  .save.error {
    color: var(--color-danger);
    font-weight: 600;
  }
</style>
