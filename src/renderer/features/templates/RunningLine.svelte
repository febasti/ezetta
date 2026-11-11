<script lang="ts">
  import PageSheet from './PageSheet.svelte'
  import type { Snippet } from 'svelte'
  import { PROPS, propLabel } from '@core/export/elements'
  import type { ElementDef } from '@core/export/elements'
  import { i18n } from '../../i18n/i18n.svelte'

  /**
   * The editor of a header or a footer: a page, as large as the panel, with the three places where
   * its text stands on it (a menu in each: left, centre, right), the divider line between them and
   * the text (drawn where it prints, its switch beside it), and the distance to the text, each where
   * it is on the page. The look of the line is set in rows under the page. Where the header is
   * mirrored, the page on the left is shown under the right one, with the places the other way
   * round and only named, since they follow the right one's.
   */
  interface Props {
    element: ElementDef
    values: Readonly<Record<string, unknown>>
    /** The pages face each other: only then is a header mirrored. */
    facing: boolean
    /** The control of one value, as the panel draws it (a menu for a place). */
    control: Snippet<[ElementDef, string]>
    /** The distance, drawn as a span between two things with its field beside it. */
    space: Snippet<[ElementDef, string]>
  }
  let { element, values, facing, control, space }: Props = $props()

  const lang = $derived(i18n.locale)
  const footer = $derived(element.id === 'footer')
  const mirrored = $derived(facing && values['mirror'] === true)
  const divider = $derived(values['divider'] === true)
  const PLACES = ['slot_left', 'slot_center', 'slot_right'] as const
  /** What a place holds, as its menu names it. */
  const named = (prop: string): string => {
    const kind = values[prop]
    return typeof kind === 'string' ? (PROPS[prop]?.valueLabels?.[kind]?.[lang] ?? kind) : ''
  }
</script>

{#snippet band(editable: boolean)}
  <div class="band">
    {#each PLACES as prop, i (prop)}
      <!-- On the page on the left of a mirrored pair the outer places change sides. -->
      {@const shown = editable ? prop : PLACES[2 - i]!}
      <div class="place {['left', 'centre', 'right'][i]}">
        {#if editable}
          {@render control(element, prop)}
        {:else}
          <span class="named" class:empty={values[shown] === 'none'}>{named(shown)}</span>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

{#snippet text()}
  <div class="text" aria-hidden="true">
    <span style:width="100%"></span>
    <span style:width="94%"></span>
    <span style:width="100%"></span>
    <span style:width="58%"></span>
  </div>
{/snippet}

{#snippet line()}
  <!-- The divider: drawn where it is printed, its switch on it; its look is set under the page. -->
  <div class="toggle">
    {@render control(element, 'divider')}
    <label for="prop-{element.id}-divider">{propLabel(element.id, PROPS['divider']!, lang)}</label>
  </div>
{/snippet}

{#snippet sheet(editable: boolean)}
  <PageSheet top={footer ? 'torn' : 'edge'} bottom={footer ? 'edge' : 'torn'} gap="small">
    {#if footer}
      {@render text()}
      {#if editable}{@render space(element, 'distance')}{:else}<div class="gap"></div>{/if}
      {#if editable}{@render line()}{/if}
      {#if divider}<div class="rule"></div>{/if}
      {@render band(editable)}
    {:else}
      {@render band(editable)}
      {#if divider}<div class="rule"></div>{/if}
      {#if editable}{@render line()}{/if}
      {#if editable}{@render space(element, 'distance')}{:else}<div class="gap"></div>{/if}
      {@render text()}
    {/if}
  </PageSheet>
{/snippet}

<div class="desk">
  {#if mirrored}<p class="caption">{i18n.t('templates.running.right')}</p>{/if}
  {@render sheet(true)}
  {#if mirrored}
    <p class="caption">{i18n.t('templates.running.left')}</p>
    {@render sheet(false)}
  {/if}
</div>

<style>
  /* The pages lie on the panel's ground, as on a desk. */
  .desk {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-12);
    border-radius: var(--r-lg);
    background: var(--color-panel);
  }
  .caption {
    margin: var(--sp-4) 0 0;
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .caption:first-child {
    margin-top: 0;
  }
  /* The three places in a row, each where its text stands: at the left, in the middle, at the right. */
  .band {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, max-content));
    justify-content: space-between;
    gap: var(--sp-8);
    align-items: center;
  }
  .place {
    display: flex;
    min-width: 0;
  }
  .place.centre {
    justify-content: center;
  }
  .place.right {
    justify-content: flex-end;
  }
  .place :global(.select) {
    max-width: 100%;
  }
  .place :global(select) {
    field-sizing: content;
    width: auto;
  }
  .named {
    min-width: 0;
    overflow: hidden;
    color: var(--color-label-secondary);
    font: var(--type-caption);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .named.empty {
    color: var(--color-label-tertiary);
  }
  .rule {
    height: 1px;
    background: var(--color-label-secondary);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-8);
    color: var(--color-label);
    font: var(--type-body);
  }
  .gap {
    height: var(--sp-24);
  }
  /* The text of the page, as grey bars: it is the preview's job to show the real one. */
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }
  .text span {
    display: block;
    height: var(--sp-4);
    border-radius: var(--r-sm);
    background: var(--color-control-pressed);
  }
</style>
