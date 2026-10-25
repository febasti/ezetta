import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Timings of the core and the main-process services on a large project (`npm run bench:core`).
// Not part of `npm test`: it generates 80,000 words of text and prints a table.
export default defineConfig({
  resolve: { alias: { '@core': resolve('src/core'), '@shared': resolve('src/shared') } },
  test: {
    include: ['tests/perf/**/*.perf.ts'],
    environment: 'node',
    testTimeout: 300_000,
    fileParallelism: false,
  },
})
