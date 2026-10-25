<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../Icon.svelte'
  import TextField from './TextField.svelte'

  /**
   * A field for one number within a range, with its unit after it. Typing is committed with Return
   * or when the focus leaves: the number is read with the language's decimal mark, brought into the
   * range and rounded to the step, and the field shows what was kept. The arrow keys change it by
   * one step, as do the two small buttons at its end. Whatever is typed in between is left alone.
   */
  interface Props {
    value: number
    min: number
    max: number
    step: number
    id?: string
    label?: string
    onchange: (value: number) => void
  }
  let { value, min, max, step, id, label, onchange }: Props = $props()

  const decimals = $derived(String(step).split('.')[1]?.length ?? 0)
  const format = (n: number): string =>
    n.toFixed(decimals).replace('.', i18n.locale === 'de' ? ',' : '.')
  const keep = (n: number): number => {
    const stepped = Math.round(n / step) * step
    return Math.min(max, Math.max(min, Number(stepped.toFixed(decimals))))
  }

  /** What is being typed, until it is committed. */
  let draft = $state<string | null>(null)
  const shown = $derived(draft ?? format(value))

  function commit(): void {
    if (draft === null) return
    const text = draft.trim().replace(',', '.')
    draft = null
    const typed = text === '' ? NaN : Number(text)
    if (Number.isFinite(typed)) onchange(keep(typed))
  }

  /** One step up or down from what is typed, or from the value. */
  function nudge(direction: 1 | -1): void {
    const current = draft === null ? value : Number(draft.trim().replace(',', '.'))
    draft = null
    onchange(keep((Number.isFinite(current) ? current : value) + direction * step))
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') commit()
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      nudge(event.key === 'ArrowUp' ? 1 : -1)
    }
  }
</script>

<span class="number">
  <TextField
    {id}
    {label}
    inputmode="numeric"
    value={shown}
    onvalue={(text) => (draft = text)}
    onchange={commit}
    onkeydown={onKeydown}
  />
  <span class="steppers">
    <button
      type="button"
      tabindex="-1"
      aria-label="+"
      disabled={value >= max}
      onclick={() => nudge(1)}
    >
      <Icon name="chevron-up" size={12} />
    </button>
    <button
      type="button"
      tabindex="-1"
      aria-label="−"
      disabled={value <= min}
      onclick={() => nudge(-1)}
    >
      <Icon name="chevron-down" size={12} />
    </button>
  </span>
</span>

<style>
  .number {
    position: relative;
    display: inline-block;
    width: 80px;
  }
  .number :global(.text-field) {
    padding-right: var(--sp-24);
  }
  .steppers {
    position: absolute;
    inset: 2px 2px 2px auto;
    display: flex;
    flex-direction: column;
    width: var(--sp-16);
  }
  button {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--color-label-secondary);
    cursor: default;
  }
  button:hover:not(:disabled) {
    background: var(--color-control-hover);
  }
  button:active:not(:disabled) {
    background: var(--color-control-pressed);
  }
  button:disabled {
    color: var(--color-label-tertiary);
  }
</style>
