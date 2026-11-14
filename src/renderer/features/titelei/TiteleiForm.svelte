<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Form from '../../ui/kit/Form.svelte'
  import FormRow from '../../ui/kit/FormRow.svelte'
  import IconButton from '../../ui/kit/IconButton.svelte'
  import Section from '../../ui/kit/Section.svelte'
  import Switch from '../../ui/kit/Switch.svelte'
  import TextField from '../../ui/kit/TextField.svelte'
  import { project } from '../sidebar/project.svelte'
  import { scrollbar } from '../../ui/scrollbar'

  /**
   * The title page fields: the title, the authors (name and affiliation, in the order they print),
   * the date and the version. Every field is saved when it is left (Return or the focus moving on);
   * what is typed is kept as a draft until then, and a snapshot that comes back does not replace it.
   */
  interface Author {
    name: string
    affiliation: string
  }

  const titelei = $derived(project.titelei)
  let title = $state(project.snapshot?.title ?? '')
  let subtitle = $state(project.titelei?.subtitle ?? '')
  let version = $state(project.titelei?.version ?? '')
  let date = $state(project.titelei?.date ?? '')
  let authors = $state<Author[]>(structuredClone($state.snapshot(project.titelei?.authors ?? [])))

  // A change that comes from outside (the file edited by hand, a version restored) replaces the
  // draft, but only when it is a change: an echo of what was just saved leaves what is typed.
  let seen: Record<'title' | 'subtitle' | 'version' | 'date' | 'authors', string> | null = null
  $effect(() => {
    const next = {
      title: project.snapshot?.title ?? '',
      subtitle: titelei?.subtitle ?? '',
      version: titelei?.version ?? '',
      date: titelei?.date ?? '',
      authors: JSON.stringify(titelei?.authors ?? []),
    }
    if (seen !== null) {
      if (next.title !== seen.title) title = next.title
      if (next.subtitle !== seen.subtitle) subtitle = next.subtitle
      if (next.version !== seen.version) version = next.version
      if (next.date !== seen.date) date = next.date
      if (next.authors !== seen.authors) authors = JSON.parse(next.authors) as Author[]
    }
    seen = next
  })

  /** A save is what the snapshot that comes back will say: it is not a change from outside. */
  const sent = (patch: Partial<NonNullable<typeof seen>>): void => {
    if (seen !== null) seen = { ...seen, ...patch }
  }
  const saveTitle = async (): Promise<void> => {
    sent({ title: title.trim() })
    await project.renameProject(title)
    // An empty title is refused: the field shows the one the project has.
    if (title.trim() === '') title = project.snapshot?.title ?? ''
  }
  const save = (patch: { subtitle?: string; version?: string; date?: string }): void => {
    sent(
      Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [key, value.trim()]),
      ) as Partial<NonNullable<typeof seen>>,
    )
    void project.setTitelei(patch)
  }
  const saveAuthors = (): Promise<void> => {
    const list = $state.snapshot(authors).map((a) => ({
      name: a.name.trim(),
      affiliation: a.affiliation.trim(),
    }))
    sent({ authors: JSON.stringify(list) })
    return project.setTitelei({ authors: list })
  }
  const move = (index: number, by: -1 | 1): void => {
    const next = [...authors]
    const [author] = next.splice(index, 1)
    next.splice(index + by, 0, author!)
    authors = next
    void saveAuthors()
  }
  const today = (): string => new Date().toISOString().slice(0, 10)
  const setDate = (value: string): void => {
    date = value
    save({ date: value })
  }
</script>

<div class="scroll" use:scrollbar>
  <div class="page">
    <h1>{i18n.t('titelei.details')}</h1>

    <Section title={i18n.t('titelei.section.title')} region={false}>
      <Form>
        <FormRow label={i18n.t('titelei.field.title')} for="titelei-title">
          <TextField
            id="titelei-title"
            value={title}
            onvalue={(v) => (title = v)}
            onchange={() => void saveTitle()}
          />
        </FormRow>
        <FormRow label={i18n.t('titelei.field.subtitle')} for="titelei-subtitle">
          <TextField
            id="titelei-subtitle"
            value={subtitle}
            onvalue={(v) => (subtitle = v)}
            onchange={() => save({ subtitle })}
          />
        </FormRow>
      </Form>
    </Section>

    <Section title={i18n.t('titelei.section.authors')} region={false}>
      <ul class="authors">
        {#each authors as author, index (index)}
          <li>
            <div class="fields">
              <TextField
                label={i18n.t('titelei.authorName')}
                placeholder={i18n.t('titelei.authorName')}
                value={author.name}
                onvalue={(v) => (author.name = v)}
                onchange={() => void saveAuthors()}
              />
              <TextField
                label={i18n.t('titelei.authorAffiliation')}
                placeholder={i18n.t('titelei.authorAffiliation')}
                value={author.affiliation}
                onvalue={(v) => (author.affiliation = v)}
                onchange={() => void saveAuthors()}
              />
            </div>
            <span class="tools">
              <IconButton
                icon="chevron-up"
                size="sm"
                label={i18n.t('titelei.moveUp')}
                disabled={index === 0}
                onclick={() => move(index, -1)}
              />
              <IconButton
                icon="chevron-down"
                size="sm"
                label={i18n.t('titelei.moveDown')}
                disabled={index === authors.length - 1}
                onclick={() => move(index, 1)}
              />
              <IconButton
                icon="x"
                size="sm"
                label={i18n.t('titelei.removeAuthor')}
                onclick={() => {
                  authors = authors.filter((_, i) => i !== index)
                  void saveAuthors()
                }}
              />
            </span>
          </li>
        {/each}
      </ul>
      <div>
        <Button
          icon="plus"
          onclick={() => {
            authors = [...authors, { name: '', affiliation: '' }]
          }}>{i18n.t('titelei.addAuthor')}</Button
        >
      </div>
    </Section>

    <Section title={i18n.t('titelei.section.more')} region={false}>
      <Form>
        <FormRow label={i18n.t('titelei.field.date')}>
          <div class="date">
            {#if date === ''}
              <span class="today">{i18n.t('titelei.dateToday')}</span>
            {:else}
              <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a date picker: the kit has no block for a day -->
              <input
                class="day"
                type="date"
                aria-label={i18n.t('titelei.dateLabel')}
                value={date}
                onchange={(e) => {
                  if (e.currentTarget.value !== '') setDate(e.currentTarget.value)
                }}
              />
            {/if}
            <Switch checked={date !== ''} onchange={(on) => setDate(on ? today() : '')}
              >{i18n.t('titelei.dateFixed')}</Switch
            >
          </div>
        </FormRow>
        <FormRow label={i18n.t('titelei.field.version')} for="titelei-version">
          <TextField
            id="titelei-version"
            value={version}
            onvalue={(v) => (version = v)}
            onchange={() => save({ version })}
          />
        </FormRow>
      </Form>
    </Section>
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .page {
    max-width: 560px;
    margin: 0 auto;
    padding: var(--sp-32) var(--sp-24);
  }
  h1 {
    margin: 0 0 var(--sp-24);
    font: var(--type-large-title);
  }
  .authors {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .authors li {
    display: flex;
    align-items: center;
    gap: var(--sp-8);
  }
  .fields {
    display: grid;
    flex: 1;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-8);
    min-width: 0;
  }
  .tools {
    display: inline-flex;
    flex: none;
    gap: var(--sp-4);
  }
  .date {
    display: flex;
    align-items: center;
    gap: var(--sp-12);
    min-height: var(--control-md);
  }
  .today {
    color: var(--color-label-secondary);
    font: var(--type-body);
  }
  .day {
    height: var(--control-md);
    padding: 0 var(--sp-8);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    color: var(--color-label);
    font: var(--type-body);
  }
  .day:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
</style>
