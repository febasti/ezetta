<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A piece of a page, as the page editors draw one: where the piece is cut out of the page, its edge is
   * a row of teeth (`torn`); where it is the page's own edge, it is a straight one with rounded corners
   * (`edge`). The piece is clipped to its shape, and its outline is drawn round what is left, so it
   * follows the teeth. What stands in it keeps clear of them: the padding is deeper than they are.
   */
  interface Props {
    /** The edge at the top, and the one at the bottom. */
    top?: 'edge' | 'torn'
    bottom?: 'edge' | 'torn'
    /** The space between what stands in it, one under another. */
    gap?: 'none' | 'small' | 'medium'
    children: Snippet
  }
  let { top = 'torn', bottom = 'torn', gap = 'none', children }: Props = $props()

  const teeth = 24
  const depth = '6px'
  /** The shape of the piece: its top, then its bottom from the right to the left, the teeth where it is cut. */
  const shape = $derived.by(() => {
    const x = (i: number): string => `${(i * 100) / teeth}%`
    const upper =
      top === 'torn'
        ? Array.from({ length: teeth + 1 }, (_, i) => `${x(i)} ${i % 2 ? '0' : depth}`)
        : ['0 0', '100% 0']
    const lower =
      bottom === 'torn'
        ? Array.from({ length: teeth + 1 }, (_, k) => {
            const i = teeth - k
            return `${x(i)} ${i % 2 ? '100%' : `calc(100% - ${depth})`}`
          })
        : ['100% 100%', '0 100%']
    return `polygon(${[...upper, ...lower].join(', ')})`
  })
  const radius = (edge: 'edge' | 'torn'): string => (edge === 'edge' ? 'var(--r-md)' : '0')
</script>

<div class="cut">
  <div
    class="sheet {gap}"
    style:clip-path={shape}
    style:border-radius="{radius(top)}
    {radius(top)}
    {radius(bottom)}
    {radius(bottom)}"
  >
    {@render children()}
  </div>
</div>

<style>
  /* The outline is drawn round what is left of the page after the cut, so it follows the teeth. */
  .cut {
    filter: drop-shadow(1px 0 0 var(--color-field-border))
      drop-shadow(-1px 0 0 var(--color-field-border)) drop-shadow(0 1px 0 var(--color-field-border))
      drop-shadow(0 -1px 0 var(--color-field-border));
  }
  .sheet {
    display: flex;
    flex-direction: column;
    padding: var(--sp-12);
    background: var(--color-window);
  }
  .small {
    gap: var(--sp-8);
  }
  .medium {
    gap: var(--sp-12);
  }
</style>
