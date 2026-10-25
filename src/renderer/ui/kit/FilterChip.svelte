<script lang="ts">
  /**
   * A filter that is on or off, shown with a coloured dot, its name and how many it lets through
   * (the kinds of issues of a check). On, it stands on a control's fill; off, it is dimmed and
   * hides its count.
   */
  interface Props {
    label: string
    pressed: boolean
    count?: number
    /** The dot's colour, a foundation colour (`var(--color-…)`). */
    color?: string
    onclick: () => void
  }
  let { label, pressed, count, color, onclick }: Props = $props()
</script>

<button class="chip" type="button" aria-pressed={pressed} {onclick}>
  {#if color}<span class="dot" style:background={color}></span>{/if}
  {label}
  {#if pressed && count !== undefined}<span class="count">{count}</span>{/if}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-4);
    height: var(--control-sm);
    padding: 0 var(--sp-8);
    border: 0;
    border-radius: var(--r-md);
    background: var(--color-control);
    color: var(--color-label);
    font: var(--type-body);
    cursor: default;
    transition: background var(--duration);
  }
  .chip:hover {
    background: var(--color-control-hover);
  }
  .chip[aria-pressed='false'] {
    background: transparent;
    color: var(--color-label-tertiary);
    box-shadow: inset 0 0 0 1px var(--color-separator);
  }
  .chip[aria-pressed='false'] .dot {
    opacity: 0.4;
  }
  .chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .count {
    color: var(--color-label-secondary);
    font-variant-numeric: tabular-nums;
  }
</style>
