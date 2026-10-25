<script lang="ts">
  /**
   * A one-line text field: a white field with a hairline border and the focus ring around it. Its
   * label is given by the form row it stands in (or `label` for screen readers when it stands alone).
   *
   * The value goes one way, as a native field's: the field shows `value`, and reports what is typed
   * through `onvalue` (and `oninput`). A new `value` is shown only when it differs from the last
   * one, so what is being typed is never thrown away when the screen around the field is drawn
   * again (a save that comes back, say).
   */
  interface Props {
    value: string
    /** What is typed, at every keystroke. */
    onvalue?: (value: string) => void
    label?: string
    id?: string
    placeholder?: string
    size?: 'sm' | 'md'
    type?: 'text' | 'search' | 'url' | 'email'
    /** The keyboard a touch screen shows: `numeric` for a number. */
    inputmode?: 'text' | 'numeric'
    invalid?: boolean
    disabled?: boolean
    /** The id of a `datalist` whose values the field offers. */
    list?: string
    oninput?: (event: Event) => void
    /** When the value is committed: Return, or the focus leaving the field. */
    onchange?: (event: Event) => void
    onkeydown?: (event: KeyboardEvent) => void
  }
  let {
    value,
    onvalue,
    label,
    id,
    placeholder,
    size = 'md',
    type = 'text',
    inputmode = 'text',
    invalid = false,
    disabled = false,
    list,
    oninput,
    onchange,
    onkeydown,
  }: Props = $props()
</script>

<input
  class="text-field {size}"
  {id}
  {type}
  {inputmode}
  {placeholder}
  {disabled}
  {list}
  aria-label={label}
  aria-invalid={invalid || undefined}
  spellcheck="false"
  {value}
  oninput={(event) => {
    onvalue?.(event.currentTarget.value)
    oninput?.(event)
  }}
  {onchange}
  {onkeydown}
/>

<style>
  .text-field {
    width: 100%;
    min-width: 0;
    height: var(--control-md);
    padding: 0 var(--sp-8);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    color: var(--color-label);
    font: var(--type-body);
    transition: box-shadow var(--duration);
  }
  .sm {
    height: var(--control-sm);
    padding: 0 var(--sp-4);
  }
  .text-field::placeholder {
    color: var(--color-label-tertiary);
  }
  .text-field:focus {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  .text-field[aria-invalid='true'] {
    border-color: var(--color-danger);
  }
  .text-field:disabled {
    background: var(--color-panel);
    color: var(--color-label-tertiary);
  }
</style>
