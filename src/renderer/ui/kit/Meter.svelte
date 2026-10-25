<script lang="ts">
  /**
   * How far something is towards a goal: a thin bar in the accent on a control's track. The label
   * names it for screen readers; the numbers stand beside it as text.
   */
  interface Props {
    /** Between 0 and 1; more is drawn full. */
    value: number
    label: string
    size?: 'sm' | 'md'
  }
  let { value, label, size = 'md' }: Props = $props()
  const share = $derived(Math.max(0, Math.min(1, value)))
</script>

<span
  class="meter {size}"
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={Math.round(share * 100)}
>
  <span class="fill" style:width="{share * 100}%"></span>
</span>

<style>
  .meter {
    display: block;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--color-control);
    overflow: hidden;
  }
  .sm {
    height: var(--sp-4);
    border-radius: 2px;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--color-accent);
  }
</style>
