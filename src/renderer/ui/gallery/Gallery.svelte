<script lang="ts">
  import Segmented from '../kit/Segmented.svelte'
  import { appearance, THEMES } from '../theme.svelte'
  import type { Theme } from '../theme.svelte'
  import EditorGallery from './EditorGallery.svelte'
  import FoundationGallery from './FoundationGallery.svelte'

  /**
   * The component gallery (`npm run gallery`): the foundation's tokens and blocks, then what the
   * editor draws, in the theme chosen at the top. The screenshot tests (tests/gallery) shoot it in
   * every theme.
   */
  const NAMES: Record<Theme, string> = { light: 'Hell', dark: 'Dunkel', sepia: 'Sepia' }
</script>

<div class="gallery">
  <header>
    <span class="name">Ezetta · Galerie</span>
    <Segmented
      label="Design"
      size="sm"
      value={appearance.theme}
      options={THEMES.map((theme) => ({ value: theme, label: NAMES[theme] }))}
      onchange={(theme) => (appearance.theme = theme)}
    />
  </header>
  <div class="pages">
    <FoundationGallery />
    <EditorGallery />
  </div>
</div>

<style>
  .gallery {
    min-height: 100vh;
    background: var(--color-window);
    color: var(--color-label);
    font: var(--type-body);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--bar-height);
    padding: 0 var(--inset-pane);
    border-bottom: 1px solid var(--color-separator);
    background: var(--color-window);
  }
  .pages {
    max-width: 1100px;
    padding: 0 var(--sp-32);
  }
  .name {
    font: var(--type-emphasis);
  }
</style>
