import { defineConfig } from '@playwright/test'

// Screenshot tests of the component gallery (tests/gallery), in Electron's own Chromium. Run with
// `npm run test:gallery`, which builds the gallery first.
export default defineConfig({
  testDir: 'tests/gallery',
  timeout: 60_000,
  // One window for all themes: the tests run one after the other in it.
  workers: 1,
  reporter: [['list']],
})
