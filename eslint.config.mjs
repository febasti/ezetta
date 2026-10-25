import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'
import svelte from 'eslint-plugin-svelte'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'out',
      'out-gallery',
      'dist',
      '_build',
      'coverage',
      'test-results',
      'tests/fixtures',
      '.*/', // local tool folders
      'tools/ulysses2typst',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    // The design foundation (docs/DESIGN.md, "Foundation"): screens are made of the kit's blocks, so
    // a feature does not draw its own button, field or menu. A control of a kind the kit has no block
    // for (a colour swatch, a grid of symbols, the picture of a template) says why in a disable
    // comment; plain DOM shared with the editor uses the kit's DOM classes (ui/kit/dom.css).
    files: ['src/renderer/features/**/*.svelte'],
    rules: {
      'svelte/no-restricted-html-elements': [
        'error',
        {
          elements: ['button', 'input', 'select', 'textarea'],
          message:
            'Use a block from ui/kit (docs/DESIGN.md, "Foundation"). A control the kit has no block for needs a disable comment that says why.',
        },
      ],
    },
  },
  {
    // `core` stays free of Electron, Node and the other layers. A backstop for the import-boundary
    // check (.dependency-cruiser.cjs), which is the real enforcement.
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'electron',
            'node:*',
            '@main/*',
            '@shared/*',
            '**/main/**',
            '**/preload/**',
            '**/renderer/**',
            '**/shared/**',
          ],
        },
      ],
    },
  },
)
