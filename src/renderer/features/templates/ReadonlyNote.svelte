<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../../ui/kit/Button.svelte'
  import Callout from '../../ui/kit/Callout.svelte'
  import { exporting } from '../export/export.svelte'

  /**
   * Said once at the top of a panel of a built-in template: it cannot be changed, and what to do
   * about it, a button away.
   */
</script>

<Callout icon="lock">
  <div class="note">
    <p>{i18n.t('templates.readonly')}</p>
    <Button size="sm" disabled={exporting.busy} onclick={() => void exporting.duplicate()}>
      {i18n.t('templates.duplicate')}
    </Button>
  </div>
</Callout>

<style>
  .note {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-8);
  }
  p {
    margin: 0;
  }
</style>
