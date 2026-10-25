import { defineConfig } from '@playwright/test'

// Measurements of the running app on a large project (`npm run bench:app`, after `npm run build`).
// One at a time, so the numbers are not disturbed; not part of the end-to-end tests.
export default defineConfig({
  testDir: 'tests/perf',
  testMatch: '**/*.perf.spec.ts',
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
})
