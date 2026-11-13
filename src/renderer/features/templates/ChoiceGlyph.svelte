<script lang="ts">
  /**
   * A choice of the template editor as a small picture, 22 × 16, in the colour of the text: where a
   * caption stands, where a figure stands, where the source of a block quote stands, where a translation stands, the rules of a table, the line above the footnotes, the
   * mark of a divider. The choices of the page (a
   * page upright or across, one page or two, the columns) are the app's icons instead, as wide. The
   * segmented control around it says the choice's name.
   */
  import Icon from '../../ui/Icon.svelte'
  import type { IconName } from '../../ui/Icon.svelte'

  let { prop, value }: { prop: string; value: string } = $props()

  /** The choices of the page that the app's icons show (two facing pages is one of its own). */
  const ICON_OF: Readonly<Record<string, Readonly<Record<string, IconName>>>> = {
    orientation: { portrait: 'page', landscape: 'page-horizontal' },
    facing: { single: 'page', facing: 'pages' },
    columns: { '1': 'columns-1', '2': 'columns-2', '3': 'columns-3' },
  }
  const icon = $derived(ICON_OF[prop]?.[value])
</script>

{#if icon}
  <span class="glyph icon"><Icon name={icon} size={18} /></span>
{:else}
  <svg class="glyph" viewBox="0 0 22 16" width="22" height="16" aria-hidden="true">
    {#if prop === 'justify'}
      {#if value === 'justified'}
        <path class="stroke" d="M4 4.5h14M4 8h14M4 11.5h14" />
      {:else}
        <path class="stroke" d="M4 4.5h12M4 8h14M4 11.5h9" />
      {/if}
    {:else if prop === 'figure_align'}
      <!-- A picture standing at the left, in the middle or at the right of the lines of text around it. -->
      {@const x = value === 'left' ? 3 : value === 'right' ? 11 : 7}
      <path class="stroke thin" d="M3 2.5h16M3 13.5h16" />
      <rect class="stroke" x={x + 0.5} y="5.5" width="7" height="5" rx="0.5" />
      <path class="stroke" d="M{x + 1.5} 9.5l1.5 -2 1.5 1.5 1 -1 1 1.5" />
    {:else if prop === 'break_before'}
      {#if value === 'none'}
        <path class="stroke thin" d="M3 3h16M3 13h16" />
        <rect class="fill" x="3" y="6.5" width="10" height="3" rx="1" />
      {:else if value === 'page'}
        <rect class="stroke" x="6.5" y="1.5" width="9" height="13" rx="1" />
        <rect class="fill" x="8.5" y="4" width="5" height="2" rx="0.5" />
        <path class="stroke thin" d="M8.5 8.5h5M8.5 11h5" />
      {:else}
        <path class="stroke faint" d="M2.5 2.5h8.5v12h-8.5z" />
        <path class="stroke" d="M11 2.5h8.5v12h-8.5z" />
        <rect class="fill" x="13" y="5" width="4.5" height="2" rx="0.5" />
      {/if}
    {:else if prop === 'caption_position'}
      <rect class="fill soft" x="5" y={value === 'above' ? 6 : 2} width="12" height="8" rx="1" />
      <rect class="fill" x="5" y={value === 'above' ? 2 : 12} width="12" height="2" rx="1" />
    {:else if prop === 'source_position'}
      <!-- The lines of a quote and its source: after the last word, or on a line of its own at the right. -->
      <path class="stroke thin" d="M3 3h16M3 6.5h16" />
      {#if value === 'after'}
        <path class="stroke thin" d="M3 10h9" />
        <rect class="fill" x="13.5" y="9" width="5.5" height="2" rx="1" />
      {:else}
        <path class="stroke thin" d="M3 10h9" />
        <rect class="fill" x="13.5" y="12.5" width="5.5" height="2" rx="1" />
      {/if}
    {:else if prop === 'translation_position'}
      <!-- The original and its translation (faint): one under the other, or side by side. -->
      {#if value === 'below'}
        <path class="stroke" d="M3 3h16M3 6h12" />
        <path class="stroke thin" d="M3 10.5h16M3 13.5h12" />
      {:else}
        <path class="stroke" d="M3 4h7M3 7.5h7M3 11h5" />
        <path class="stroke thin" d="M12 4h7M12 7.5h7M12 11h5" />
      {/if}
    {:else if prop === 'border_style'}
      {#if value === 'rows'}
        <path class="stroke" d="M3 2.5h16M3 6.5h16M3 10h16M3 13.5h16" />
      {:else if value === 'booktabs'}
        <path class="stroke heavy" d="M3 2.5h16M3 13.5h16" />
        <path class="stroke thin" d="M3 6h16" />
      {:else if value === 'grid'}
        <path
          class="stroke thin"
          d="M3.5 2.5h15v11h-15zM3.5 6h15M3.5 9.75h15M8.5 2.5v11M13.5 2.5v11"
        />
      {:else}
        {#each [0, 1, 2] as r (r)}
          {#each [0, 1, 2] as c (c)}
            <rect class="fill soft" x={4 + c * 5} y={3 + r * 4} width="4" height="2" rx="0.5" />
          {/each}
        {/each}
      {/if}
    {:else if prop === 'placement'}
      <rect class="stroke" x="5.5" y="1.5" width="11" height="13" rx="1" />
      {#if value === 'bottom'}
        <path class="stroke thin" d="M7.5 4.5h7M7.5 7h7" />
        <rect class="fill" x="7.5" y="10.5" width="7" height="2" rx="0.5" />
      {:else}
        <path class="stroke thin" d="M7.5 4.5h4.5M7.5 7h4.5M7.5 9.5h4.5M7.5 12h4.5" />
        <rect class="fill" x="13" y="4" width="2" height="5" rx="0.5" />
      {/if}
    {:else if prop === 'number_style'}
      <rect class="fill" x="3" y="3" width="4" height="4" rx="0.5" />
      <rect class="fill soft" x="9" y="4" width="10" height="2.5" rx="1" />
      <rect
        class="fill soft"
        x={value === 'hanging' ? 9 : 3}
        y="10"
        width="9"
        height="2.5"
        rx="1"
      />
    {:else if prop === 'marker'}
      {#if value === 'default'}
        <circle class="fill" cx="4.5" cy="4" r="1.5" />
        <path class="fill" d="M8 8.2l2.6 1.5-2.6 1.5z" />
        <rect class="fill" x="4" y="13" width="3" height="1.2" />
        <path class="stroke thin" d="M8 4h11M13 9.7h6M9.5 13.6h9.5" />
      {:else}
        {#if value === 'bullet'}
          <circle class="fill" cx="5" cy="8" r="2" />
        {:else if value === 'dash'}
          <rect class="fill" x="3" y="7.3" width="4.5" height="1.5" />
        {:else if value === 'circle'}
          <circle class="stroke" cx="5" cy="8" r="2" />
        {:else}
          <rect class="fill" x="3.2" y="6.2" width="3.6" height="3.6" />
        {/if}
        <path class="stroke thin" d="M10 8h9" />
      {/if}
    {:else if prop === 'divider_mark'}
      <!-- A break between two passages of text: what stands in it. -->
      <rect class="fill soft" x="3" y="1.5" width="16" height="2" rx="1" />
      <rect class="fill soft" x="3" y="12.5" width="16" height="2" rx="1" />
      {#if value === 'asterisks'}
        {#each [7, 11, 15] as x (x)}
          <circle class="fill" cx={x} cy="8" r="1" />
        {/each}
      {:else if value === 'asterism'}
        <circle class="fill" cx="11" cy="6.6" r="1" />
        <circle class="fill" cx="9.4" cy="9.4" r="1" />
        <circle class="fill" cx="12.6" cy="9.4" r="1" />
      {:else if value === 'line'}
        <path class="stroke" d="M7 8h8" />
      {/if}
    {/if}
  </svg>
{/if}

<style>
  .glyph {
    display: block;
  }
  /* An icon in the place of a picture: as wide, and centred in it. */
  .glyph.icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 18px;
  }
  .stroke {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
  }
  .stroke.thin {
    stroke-width: 1;
    opacity: 0.45;
  }
  .stroke.heavy {
    stroke-width: 1.6;
  }
  .stroke.faint {
    opacity: 0.4;
  }
  .fill {
    fill: currentColor;
  }
  .fill.soft {
    opacity: 0.35;
  }
</style>
