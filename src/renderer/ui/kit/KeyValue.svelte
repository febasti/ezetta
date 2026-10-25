<script lang="ts">
  /** One fact of a `KeyValues` list: its name, its value, and an optional quiet detail after it. */
  interface Props {
    label: string
    value: string
    detail?: string
  }
  let { label, value, detail }: Props = $props()
</script>

<dt>{label}</dt>
<dd>
  {value}
  {#if detail}<span class="detail">{detail}</span>{/if}
</dd>

<style>
  dt {
    min-width: 0;
    color: var(--color-label-secondary);
  }
  dd {
    margin: 0;
    color: var(--color-label);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .detail {
    margin-left: var(--sp-4);
    color: var(--color-label-tertiary);
    font: var(--type-caption);
  }
</style>
