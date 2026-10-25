<script lang="ts">
  import { contextAround, lineOf } from '@core/bib/literature'
  import type { Use } from '@core/bib/literature'
  import { i18n } from '../../i18n/i18n.svelte'
  import { call } from '../../lib/api'
  import ListRow from '../../ui/kit/ListRow.svelte'
  import { project } from '../sidebar/project.svelte'

  interface Props {
    /** The work, or the kind of marker. */
    label: string
    /** The title of the work, shown dimmed. */
    detail?: string
    /** How often it is cited. */
    count: number
    uses: Use[]
    /** The open sheet cites it. */
    here?: boolean
    /** A problem: a key that is not in the bibliography, or a missing citation. */
    problem?: boolean
  }
  let { label, detail = '', count, uses, here = false, problem = false }: Props = $props()

  interface Place {
    use: Use
    sheet: string
    line: number
    text: string
  }

  let open = $state(false)
  let places = $state<Place[] | null>(null)

  /** Reads the sheets the work is cited in, once, to show where and what is around it. */
  async function load(): Promise<void> {
    const contents: Record<string, string> = {}
    for (const path of new Set(uses.map((use) => use.path))) {
      const result = await call(window.api.project.readSheet({ path }))
      contents[path] = result?.content ?? ''
    }
    places = uses.map((use) => {
      const text = contents[use.path] ?? ''
      return {
        use,
        sheet: project.sheetLabel(use.path),
        line: lineOf(text, use.at),
        text: contextAround(text, use.at),
      }
    })
  }

  function toggle(): void {
    open = !open
    if (open && places === null) void load()
  }
</script>

<div class="work" class:open>
  <ListRow
    role="button"
    tabindex={0}
    aria-selected={undefined}
    aria-expanded={open}
    onclick={toggle}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    }}
  >
    {#snippet leading()}<span class="dot" class:here aria-hidden="true"></span>{/snippet}
    {#snippet content()}
      <span class="label" class:problem>{label}</span>
      {#if detail}<span class="detail">{detail}</span>{/if}
    {/snippet}
    {#snippet accessory()}<span class="count">{count}×</span>{/snippet}
  </ListRow>
  {#if open}
    <ul class="uses">
      {#if places === null}
        <li class="loading">…</li>
      {:else}
        {#each places as place (`${place.use.path}:${place.use.at}`)}
          <li>
            <ListRow
              role="button"
              tabindex={0}
              aria-selected={undefined}
              aria-label={i18n.t('literature.open', { sheet: place.sheet, line: place.line })}
              title="{place.sheet} · {i18n.t('literature.line', { line: place.line })}"
              subtitle={place.text}
              onclick={() => void project.openSheet(place.use.path, place.use.at)}
              onkeydown={(e) => {
                if (e.key === 'Enter') void project.openSheet(place.use.path, place.use.at)
              }}
            />
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>

<style>
  /* The row is the foundation's ListRow; only what sits in it is placed here. */
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .dot.here {
    background: var(--color-accent);
  }
  /* How often, as a small tag, the same as in the list of works. */
  .count {
    padding: 0 var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control);
    color: var(--color-label-secondary);
    font: var(--type-caption);
    font-variant-numeric: tabular-nums;
    line-height: 18px;
  }
  .label {
    flex: none;
    max-width: 60%;
    overflow: hidden;
    font: var(--type-emphasis);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label.problem {
    color: var(--color-danger);
  }
  .detail {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--color-label-tertiary);
    font: var(--type-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Where it is cited: two-line rows under it, set in by a hairline. */
  .uses {
    margin: 0 0 var(--sp-8) var(--sp-12);
    padding: 0 0 0 var(--sp-4);
    border-left: 1px solid var(--color-separator);
    list-style: none;
  }
  .loading {
    padding: var(--sp-4) var(--sp-8);
    color: var(--color-label-tertiary);
  }
</style>
