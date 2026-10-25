<script lang="ts">
  import { onMount } from 'svelte'
  import EditorPane from './features/editor/EditorPane.svelte'
  import TablePicker from './features/shell/TablePicker.svelte'
  import GroupEditor from './features/sidebar/GroupEditor.svelte'
  import StatusBar from './features/shell/StatusBar.svelte'
  import Toolbar from './features/shell/Toolbar.svelte'
  import Welcome from './features/shell/Welcome.svelte'
  import { proof } from './features/proof/proof.svelte'
  import { project } from './features/sidebar/project.svelte'
  import Sidebar from './features/sidebar/Sidebar.svelte'
  import { allCommands, matches } from './lib/commands'
  import { fittedWidths, ui } from './lib/ui.svelte'
  import RightSidebar from './features/shell/RightSidebar.svelte'
  import ExportDialog from './features/export/ExportDialog.svelte'
  import { headingNumbering } from './features/export/numbering.svelte'
  import { backup } from './features/history/backup.svelte'
  import HistoryDialog from './features/history/HistoryDialog.svelte'
  import SynonymDialog from './features/editor/SynonymDialog.svelte'
  import SettingsDialog from './features/settings/SettingsDialog.svelte'
  import { settings } from './features/settings/settings.svelte'
  import Dialogs from './ui/Dialogs.svelte'
  import MenuHost from './ui/MenuHost.svelte'
  import Toast from './ui/Toast.svelte'
  import { initWindowChrome } from './lib/windowChrome'
  import { initAppMenu } from './lib/appMenu.svelte'

  onMount(() => {
    initWindowChrome()
    proof.init()
    backup.init()
    // The backup's state belongs to a project: on the welcome screen there is none to ask about.
    void project.init().then(() => {
      if (project.snapshot) void backup.refresh()
    })
    window.api.on.app.settingsRequested(() => settings.show())
    return initAppMenu()
  })

  // The cross-reference chips follow the numbering of the export's template: read when a project
  // opens (this depends on whether one is open, not on its changes).
  const hasProject = $derived(project.snapshot !== null)
  $effect(() => {
    if (hasProject) void headingNumbering.refresh()
    else headingNumbering.reset()
  })

  // Without a project the window is the small fixed launcher of the welcome page; main starts it so
  // when nothing is open, and this follows a project opening and closing.
  $effect(() => {
    if (project.ready) void window.api.app.setWindowMode({ launcher: !hasProject })
  })

  function onKeydown(event: KeyboardEvent): void {
    for (const command of allCommands()) {
      if (
        command.shortcut &&
        !command.inEditor &&
        (command.available?.() ?? true) &&
        matches(event, command.shortcut)
      ) {
        event.preventDefault()
        command.run()
        return
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if project.ready}
  {#if project.snapshot}
    <Toolbar />
    <div class="shell">
      {#if ui.outlineVisible || ui.groupsVisible || ui.sheetsVisible}
        <Sidebar />
      {/if}
      <EditorPane />
      {#if ui.rightSidebarVisible && fittedWidths().right !== null}
        <RightSidebar />
      {/if}
    </div>
    <StatusBar />
  {:else}
    <Welcome />
  {/if}
{/if}
{#if !project.snapshot}
  <!-- Without the toolbar, a strip at the top moves the window (macOS, title bar merged). -->
  <div class="drag-strip" aria-hidden="true"></div>
{/if}

<MenuHost />
<Dialogs />
<ExportDialog />
<HistoryDialog />
<SynonymDialog />
<SettingsDialog />
<Toast />
<TablePicker />
<GroupEditor />

<style>
  .shell {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  :global(#app) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
</style>
