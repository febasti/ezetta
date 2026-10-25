<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import Icon from '../../ui/Icon.svelte'
  import { backup } from '../history/backup.svelte'
  import { project } from '../sidebar/project.svelte'

  const open = (path: string) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    void project.openRecent(path)
  }

  /** What can be started: a title and a line about it at the left, its button at the right. */
  const actions = [
    { id: 'new', primary: true, run: () => void project.createProject() },
    { id: 'open', primary: false, run: () => void project.openProject() },
    { id: 'restore', primary: false, run: () => void backup.restoreFromFile() },
  ] as const
</script>

<!-- As the source lists of the system and of note apps: the recent projects at the left, and at the
  right the name with what can be started, one row each between hairlines. -->
<main class="welcome">
  <nav class="recent" aria-label={i18n.t('welcome.recent')}>
    {#if project.recent.length}
      <ul>
        {#each project.recent as recent (recent.path)}
          <li>
            <ListRow
              title={recent.title}
              subtitle={recent.path}
              role="button"
              tabindex={0}
              aria-selected={undefined}
              onclick={() => void project.openRecent(recent.path)}
              onkeydown={open(recent.path)}
            />
          </li>
        {/each}
      </ul>
    {:else}
      <p class="none">{i18n.t('welcome.noRecent')}</p>
    {/if}
  </nav>
  <section class="start">
    <div class="column">
      <header>
        <span class="mark"><Icon name="notebook" size={40} /></span>
        <h1>{i18n.t('app.title')}</h1>
        <p class="subtitle">{i18n.t('welcome.subtitle')}</p>
      </header>
      <ul class="actions">
        {#each actions as action (action.id)}
          <li>
            <div class="text">
              <h2>{i18n.t(`welcome.${action.id}.title`)}</h2>
              <p>{i18n.t(`welcome.${action.id}.hint`)}</p>
            </div>
            <Button variant={action.primary ? 'primary' : 'secondary'} onclick={action.run}
              >{i18n.t(`welcome.${action.id}.button`)}</Button
            >
          </li>
        {/each}
      </ul>
    </div>
  </section>
</main>

<style>
  .welcome {
    display: flex;
    flex: 1;
    min-height: 0;
    background: var(--color-window);
  }
  .recent {
    flex: none;
    width: 240px;
    overflow-y: auto;
    padding: var(--titlebar-height) var(--sp-8) var(--sp-8);
    border-right: 1px solid var(--color-separator);
    background: var(--color-sidebar);
  }
  .recent ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .none {
    margin: 0;
    padding: var(--sp-8);
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .start {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: var(--sp-32);
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--sp-24);
    width: min(420px, 100%);
  }
  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    text-align: center;
  }
  .mark {
    display: flex;
    margin-bottom: var(--sp-8);
    color: var(--color-accent);
  }
  h1 {
    margin: 0;
    color: var(--color-label);
    font: var(--type-large-title);
  }
  .subtitle {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .actions {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .actions li {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-16);
    padding: var(--sp-12) 0;
    border-top: 1px solid var(--color-separator);
  }
  .text {
    min-width: 0;
  }
  h2 {
    margin: 0;
    color: var(--color-label);
    font: var(--type-emphasis);
  }
  .text p {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
</style>
