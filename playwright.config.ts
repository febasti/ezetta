import { defineConfig } from '@playwright/test'

// End-to-end tests drive the real, built Electron app (run `npm run build` first, or use
// `npm run test:e2e`). Browser-only component tests for the gallery are added later.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // Every test has its own sandbox and its own app, so the tests of a file can run on different
  // workers; the long files then no longer decide when the run ends.
  fullyParallel: true,
  reporter: [['list']],
  projects: [
    { name: 'app', grepInvert: /@pointer/ },
    // The tests whose pointer rests on an element (`POINTER` in helpers.ts), one at a time. On
    // Windows and Linux, where the test windows are shown, CI runs this project after the other,
    // so no window of another test opens or closes under the screen's cursor meanwhile.
    { name: 'pointer', grep: /@pointer/, workers: 1 },
  ],
})
