import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The component gallery runs in a plain browser, no Electron needed.
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [svelte({ configFile: resolve('svelte.config.mjs') })],
  resolve: { alias: { '@core': resolve('src/core'), '@shared': resolve('src/shared') } },
  server: { open: '/gallery.html' },
  // `vite build` makes the gallery as files for its screenshot tests (tests/gallery), opened from
  // disk, so the paths are relative.
  base: './',
  build: {
    outDir: resolve('out-gallery'),
    emptyOutDir: true,
    rollupOptions: { input: resolve('src/renderer/gallery.html') },
  },
})
