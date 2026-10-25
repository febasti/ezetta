<script lang="ts">
  import { onMount } from 'svelte'

  interface Props {
    value: string
    oncommit: (name: string) => void
    oncancel: () => void
    label: string
  }
  let { value, oncommit, oncancel, label }: Props = $props()

  let input = $state<HTMLInputElement>()
  // svelte-ignore state_referenced_locally
  let draft = $state(value)
  let finished = false

  onMount(() => {
    input?.focus()
    input?.select()
  })

  function commit(): void {
    if (finished) return
    finished = true
    oncommit(draft)
  }
  function cancel(): void {
    if (finished) return
    finished = true
    oncancel()
  }
</script>

<input
  bind:this={input}
  bind:value={draft}
  aria-label={label}
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => {
    e.stopPropagation()
    if (e.key === 'Enter') commit()
    else if (e.key === 'Escape') cancel()
  }}
  onblur={commit}
/>

<style>
  /* A text field of the foundation, small enough for a row. */
  input {
    flex: 1;
    min-width: 0;
    height: var(--control-sm);
    padding: 0 var(--sp-4);
    border: 1px solid var(--color-field-border);
    border-radius: var(--r-sm);
    background: var(--color-field);
    color: var(--color-label);
    font: var(--type-body);
    box-shadow: 0 0 0 3px var(--color-focus);
  }
  input:focus {
    outline: none;
  }
</style>
