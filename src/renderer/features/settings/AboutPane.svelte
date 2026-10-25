<script lang="ts">
  import { onMount } from 'svelte'
  import { call } from '../../lib/api'
  import { i18n } from '../../i18n/i18n.svelte'
  import Section from '../../ui/kit/Section.svelte'

  /**
   * What the app is: its name and version, the license it is released under, and the notices of the
   * software that ships with it (Typst, LanguageTool, the Java runtime, the thesaurus files, the
   * libraries and fonts). The text is the file THIRD-PARTY-NOTICES.txt, read by the main process.
   */
  let version = $state('')
  /** Null while it loads; empty when the file could not be read. */
  let notices = $state<string | null>(null)

  onMount(async () => {
    const info = await call(window.api.app.about({}))
    version = info?.version ?? ''
    notices = info?.notices ?? ''
  })
</script>

<Section>
  <div class="identity">
    <h2 class="name">{i18n.t('app.title')}</h2>
    {#if version}<p class="version">{i18n.t('about.version', { version })}</p>{/if}
  </div>
  <p class="free">{i18n.t('about.free')}</p>
</Section>
<Section title={i18n.t('about.licenses')}>
  <p class="hint">{i18n.t('about.licenses.hint')}</p>
  {#if notices === ''}
    <p class="hint">{i18n.t('about.licenses.missing')}</p>
  {:else if notices !== null}
    <pre class="notices" aria-label={i18n.t('about.licenses')}>{notices}</pre>
  {/if}
</Section>

<style>
  .identity {
    display: flex;
    align-items: baseline;
    gap: var(--sp-12);
  }
  .name {
    margin: 0;
    font: var(--type-title);
  }
  .version {
    margin: 0;
    color: var(--color-label-secondary);
    font: var(--type-body);
    font-variant-numeric: tabular-nums;
  }
  .free {
    margin: var(--sp-8) 0 0;
    font: var(--type-body);
  }
  .hint {
    margin: var(--sp-4) 0 var(--sp-8);
    color: var(--color-label-secondary);
    font: var(--type-caption);
  }
  .notices {
    max-height: 260px;
    margin: 0;
    padding: var(--sp-8) var(--sp-12);
    overflow: auto;
    border-radius: var(--r-md);
    background: var(--color-field);
    border: 1px solid var(--color-field-border);
    color: var(--color-label);
    font: var(--type-caption);
    font-family: var(--font-mono);
    white-space: pre-wrap;
    user-select: text;
  }
</style>
