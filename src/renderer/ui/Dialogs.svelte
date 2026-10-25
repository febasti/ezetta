<script lang="ts">
  import { tick } from 'svelte'
  import { i18n } from '../i18n/i18n.svelte'
  import { ui } from '../lib/ui.svelte'
  import Alert from './kit/Alert.svelte'
  import Button from './kit/Button.svelte'
  import Form from './kit/Form.svelte'
  import FormRow from './kit/FormRow.svelte'
  import TextField from './kit/TextField.svelte'

  /** The small questions (a confirmation, a name to type), as the foundation's alerts. */
  let promptValue = $state('')

  $effect(() => {
    if (ui.prompt) {
      promptValue = ui.prompt.initial
      void tick().then(() =>
        (document.getElementById('prompt-field') as HTMLInputElement)?.select(),
      )
    }
  })
  $effect(() => {
    // The confirming button has the focus, so Enter confirms and Escape cancels.
    if (ui.confirm)
      void tick().then(() =>
        document
          .querySelector<HTMLButtonElement>('[role="alertdialog"] .actions button:last-child')
          ?.focus(),
      )
  })

  function answerConfirm(value: boolean): void {
    const request = ui.confirm
    ui.confirm = null
    request?.resolve(value)
  }
  function answerPrompt(value: string | null): void {
    const request = ui.prompt
    ui.prompt = null
    request?.resolve(value)
  }
</script>

{#if ui.confirm}
  <Alert
    role="alertdialog"
    title={ui.confirm.title}
    message={ui.confirm.message}
    onescape={() => answerConfirm(false)}
  >
    {#snippet actions()}
      <Button onclick={() => answerConfirm(false)}>{i18n.t('confirm.cancel')}</Button>
      <Button variant="primary" onclick={() => answerConfirm(true)}>
        {ui.confirm!.confirmLabel}
      </Button>
    {/snippet}
  </Alert>
{/if}

{#if ui.prompt}
  <Alert title={ui.prompt.title} onescape={() => answerPrompt(null)}>
    <form
      id="prompt-form"
      onsubmit={(e) => {
        e.preventDefault()
        answerPrompt(promptValue)
      }}
    >
      <Form stacked>
        <FormRow label={ui.prompt.label} for="prompt-field">
          <TextField
            id="prompt-field"
            value={promptValue}
            onvalue={(v) => (promptValue = v)}
            inputmode={ui.prompt.inputMode ?? 'text'}
          />
        </FormRow>
      </Form>
    </form>
    {#snippet actions()}
      {#if ui.prompt?.action}
        {@const action = ui.prompt.action}
        <span class="start">
          <Button
            variant="plain"
            onclick={() => {
              // Read before closing: the dialog's state is gone after it.
              const run = action.run
              answerPrompt(null)
              run()
            }}>{action.label}</Button
          >
        </span>
      {/if}
      <Button onclick={() => answerPrompt(null)}>{i18n.t('confirm.cancel')}</Button>
      <Button variant="primary" onclick={() => answerPrompt(promptValue)}>
        {i18n.t('prompt.ok')}
      </Button>
    {/snippet}
  </Alert>
{/if}

<style>
  /* A further action stands apart, on the left. */
  .start {
    display: flex;
    margin-right: auto;
  }
</style>
