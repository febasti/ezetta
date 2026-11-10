<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../../ui/Icon.svelte'

  /**
   * A length of the template editor: the number in the field, its unit after it in a quieter tone,
   * and two small buttons that step it up and down by an amount that suits the unit. Typing a number
   * keeps the unit; typing one with a unit (12pt, 2cm) takes that unit. An empty field takes the
   * value from the element above. The decimal mark is the language's.
   */
  interface Props {
    id: string
    /** The length as the style has it (1.2em, 12pt, 30%), or null when it is not set. */
    value: string | null
    label: string
    invalid?: boolean
    disabled?: boolean
    /** A length typed or stepped to, as text (2.5cm), or '' to take it from above. */
    oncommit: (text: string) => void
  }
  let { id, value, label, invalid = false, disabled = false, oncommit }: Props = $props()

  /** How far one step goes, by unit. */
  const STEP: Readonly<Record<string, number>> = {
    em: 0.1,
    pt: 0.5,
    cm: 0.1,
    mm: 1,
    in: 0.05,
    '%': 1,
  }
  const parts = (v: string | null): { n: number; unit: string } | null => {
    const m = v ? /^\s*(-?[\d.]+)\s*([a-z%]*)\s*$/i.exec(v) : null
    return m ? { n: Number(m[1]), unit: m[2] ?? '' } : null
  }
  const parsed = $derived(parts(value))
  const comma = $derived(i18n.locale === 'de')
  const show = (n: number): string => {
    const text = String(Number(n.toFixed(3)))
    return comma ? text.replace('.', ',') : text
  }

  /** What is being typed, until it is committed. */
  let draft = $state<string | null>(null)
  const shown = $derived(draft ?? (parsed ? show(parsed.n) : (value ?? '')))

  function commit(): void {
    if (draft === null) return
    const text = draft.trim().replace(',', '.')
    draft = null
    if (text === '') return oncommit('')
    const typed = parts(text)
    if (!typed) return oncommit(text)
    oncommit(`${Number(typed.n.toFixed(3))}${typed.unit || parsed?.unit || 'pt'}`)
  }
  function nudge(direction: 1 | -1): void {
    draft = null
    const p = parsed ?? { n: 0, unit: 'pt' }
    const step = STEP[p.unit] ?? 1
    const n = Math.max(0, Math.round((p.n + direction * step) / step) * step)
    oncommit(`${Number(n.toFixed(3))}${p.unit}`)
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') commit()
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      nudge(event.key === 'ArrowUp' ? 1 : -1)
    }
  }
</script>

<span class="length" class:invalid class:disabled>
  <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a number with its unit drawn inside the field -->
  <input
    {id}
    type="text"
    inputmode="decimal"
    aria-label={label}
    data-value={value ?? ''}
    placeholder="—"
    value={shown}
    {disabled}
    oninput={(e) => (draft = e.currentTarget.value)}
    onchange={commit}
    onkeydown={keydown}
  />
  <span class="unit" aria-hidden="true">{parsed && draft === null ? parsed.unit : ''}</span>
  <span class="steppers">
    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a step up, as in a number field -->
    <button type="button" tabindex="-1" aria-label="+" {disabled} onclick={() => nudge(1)}>
      <Icon name="chevron-up" size={12} />
    </button>
    <!-- eslint-disable-next-line svelte/no-restricted-html-elements -- a step down -->
    <button type="button" tabindex="-1" aria-label="−" {disabled} onclick={() => nudge(-1)}>
      <Icon name="chevron-down" size={12} />
    </button>
  </span>
</span>

<style>
  .length {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 72px;
    height: var(--control-md);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    box-sizing: border-box;
  }
  .length:focus-within {
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .length.invalid {
    border-color: var(--color-danger);
  }
  .length.disabled {
    background: var(--color-panel);
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
  input::placeholder {
    color: var(--color-label-tertiary);
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
    background: var(--color-control);
    border-radius: 0 var(--r-sm) var(--r-sm) 0;
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
</style>
