import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const alias = {
  '@core': resolve('src/core'),
  '@shared': resolve('src/shared'),
}

// Main and preload are built as CommonJS on purpose: a sandboxed preload script cannot be an ES
// module. All dependencies live in devDependencies and are bundled, so the packaged app needs no
// node_modules. Only `electron` and Node built-ins stay external.
export default defineConfig({
  main: {
    resolve: { alias },
    build: { externalizeDeps: false, rollupOptions: { input: resolve('src/main/index.ts') } },
  },
  preload: {
    resolve: { alias },
    build: { externalizeDeps: false, rollupOptions: { input: resolve('src/preload/index.ts') } },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [svelte({ configFile: resolve('svelte.config.mjs') })],
    build: {
      modulePreload: { polyfill: false },
      // electron-vite leaves the renderer unminified; minified it is half the size (1.5 MB to
      // 740 KB), which the window parses at every start.
      minify: 'esbuild',
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
  },
})
