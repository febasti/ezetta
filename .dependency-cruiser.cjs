/**
 * Import boundaries between the layers: `core` imports no other layer, `main` and `renderer` never
 * import each other, `preload` imports only `shared`. Run: npm run check:boundaries
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'core-imports-nothing-internal',
      comment: 'core is pure domain logic: it may not import main, preload, renderer, or shared.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(main|preload|renderer|shared)/' },
    },
    {
      name: 'core-no-node-or-electron',
      comment:
        'core has no Electron or Node built-in imports; it reaches the outside through ports.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-no-electron-package',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^node_modules/electron/' },
    },
    {
      name: 'main-not-renderer-or-preload',
      comment: 'main may import core and shared only.',
      severity: 'error',
      from: { path: '^src/main/' },
      to: { path: '^src/(renderer|preload)/' },
    },
    {
      name: 'renderer-not-main-or-preload',
      comment:
        'renderer may import core and shared only. It reaches the system through window.api.',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^src/(main|preload)/' },
    },
    {
      name: 'preload-only-shared',
      comment: 'preload imports only shared (plus electron).',
      severity: 'error',
      from: { path: '^src/preload/' },
      to: { path: '^src/(core|main|renderer)/' },
    },
    {
      name: 'shared-imports-nothing-internal',
      comment: 'shared (the IPC contract) stays free of every other layer.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(core|main|preload|renderer)/' },
    },
    {
      name: 'shared-no-node-or-electron',
      comment:
        'shared is bundled into the preload and the renderer: no Node built-ins, no Electron.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'shared-no-electron-package',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^node_modules/electron/' },
    },
    {
      name: 'renderer-no-electron-or-node',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'renderer-no-electron-package',
      severity: 'error',
      from: { path: '^src/renderer/' },
      to: { path: '^node_modules/electron/' },
    },
    {
      name: 'no-circular',
      comment: 'No import cycles. GroupRow renders itself for nested groups, which is intended.',
      severity: 'error',
      from: { pathNot: 'features/sidebar/GroupRow\\.svelte$' },
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.base.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
