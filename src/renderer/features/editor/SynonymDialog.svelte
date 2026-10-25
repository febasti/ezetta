<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Dialog from '../../ui/kit/Dialog.svelte'
  import EmptyState from '../../ui/kit/EmptyState.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { synonymDialog as dialog } from './thesaurus.svelte'
  import { ARTICLE } from './synonyms'

  /** Typing looks the word up after a short pause; Return looks it up at once. */
  let timer: ReturnType<typeof setTimeout> | undefined
  function typed(value: string): void {
    clearTimeout(timer)
    timer = setTimeout(() => void dialog.search(value), 350)
  }

  const groups = $derived(dialog.result?.ok ? dialog.result.groups : [])
  const several = $derived(groups.length > 1)
</script>

{#if dialog.shown}
  <Dialog
    title={i18n.t('thesaurus.title')}
    closeLabel={i18n.t('thesaurus.close')}
    width="medium"
    onclose={() => dialog.close()}
  >
    <div class="body">
      <div class="search">
        <TextField
          id="synonym-search"
          value={dialog.query}
          onvalue={typed}
          type="search"
          label={i18n.t('thesaurus.search')}
          placeholder={i18n.t('thesaurus.search')}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              clearTimeout(timer)
              void dialog.search((event.currentTarget as HTMLInputElement).value)
            }
          }}
        />
        <p class="replaces">{i18n.t('thesaurus.replaces', { word: dialog.word })}</p>
      </div>

      <div class="results" aria-live="polite" aria-busy={dialog.busy}>
        {#if dialog.busy && !dialog.result}
          <EmptyState icon="book" busy title={i18n.t('thesaurus.loading')} />
        {:else if dialog.failed}
          <EmptyState icon="warning" title={i18n.t('thesaurus.unavailable')} />
        {:else if dialog.result && !dialog.result.ok}
          <EmptyState icon="book" title={i18n.t('thesaurus.noneFor', { word: dialog.query })} />
        {:else}
          <div class:dim={dialog.busy}>
            {#each groups as group (group.lemma + group.pos)}
              <Section
                title={several
                  ? `${group.lemma} · ${i18n.t(`thesaurus.pos.${group.pos}`)}`
                  : undefined}
                level={4}
              >
                {#each group.senses as sense, index (index)}
                  <div
                    class="sense"
                    role="group"
                    aria-label={i18n.t('thesaurus.sense', { n: index + 1 })}
                  >
                    {#each sense.options as option (option.text)}
                      <Button size="sm" onclick={() => dialog.choose(option.text)}>
                        <span class="word">{option.text}</span>
                        {#if option.note || option.gender}
                          <span class="hint"
                            >{[option.note, option.gender ? ARTICLE[option.gender] : null]
                              .filter(Boolean)
                              .join(', ')}</span
                          >
                        {/if}
                      </Button>
                    {/each}
                  </div>
                {/each}
              </Section>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </Dialog>
{/if}

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-16);
  }
  .search {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .replaces {
    margin: 0;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
  .results {
    min-height: 160px;
    max-height: 50vh;
    overflow-y: auto;
  }
  .dim {
    opacity: 0.6;
  }
  /* One meaning: its words side by side, wrapping. */
  .sense {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
  }
  .hint {
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
