import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// A simulated year of versions (`npm run bench:history`): the files and bytes of the version store,
// and the time taken by versions and the list. Takes about four minutes.
export default defineConfig({
  resolve: { alias: { '@core': resolve('src/core'), '@shared': resolve('src/shared') } },
  test: {
    include: ['tests/perf/history.perf.ts'],
    environment: 'node',
    testTimeout: 3 * 3600 * 1000,
  },
})
