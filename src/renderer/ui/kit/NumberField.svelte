<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../Icon.svelte'

  /**
   * A field for one number within a range, with its unit after the number, inside the field (as
   * the lengths of a template have theirs). Typing is committed with Return
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
    /** What the number counts, after the number: "px", "×". */
    unit?: string
    onchange: (value: number) => void
  }
  let { value, min, max, step, id, label, unit, onchange }: Props = $props()

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
  <input
    {id}
    type="text"
    inputmode="decimal"
    aria-label={label}
    value={shown}
    oninput={(event) => (draft = event.currentTarget.value)}
    onchange={commit}
    onkeydown={onKeydown}
  />
  <span class="unit" aria-hidden="true">{unit ?? ''}</span>
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
    display: inline-flex;
    align-items: center;
    width: 96px;
    height: var(--control-md);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    box-sizing: border-box;
  }
  .number:focus-within {
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  /* The number as wide as its text, so its unit follows it with a small space. */
  input {
    flex: none;
    field-sizing: content;
    min-width: 1ch;
    max-width: 100%;
    height: 100%;
    padding: 0 0 0 var(--sp-8);
    border: 0;
    background: none;
    color: var(--color-label);
    font: var(--type-body);
    outline: none;
  }
  .unit {
    flex: 1;
    min-width: 0;
    padding-left: var(--sp-4);
    overflow: hidden;
    color: var(--color-label-tertiary);
    font: var(--type-body);
    white-space: nowrap;
    pointer-events: none;
  }
  /* The steppers: a narrow column at the end, set off by a hairline. */
  .steppers {
    display: flex;
    flex: none;
    flex-direction: column;
    align-self: stretch;
    width: var(--sp-16);
    border-left: 1px solid var(--color-field-border);
    border-radius: 0 var(--r-sm) var(--r-sm) 0;
    background: var(--color-control);
  }
  button {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
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
