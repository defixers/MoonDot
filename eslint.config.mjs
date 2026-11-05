import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import { builtinModules } from 'node:module'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.pnpm-store/**',
      '.cache/**',
      '.tools/**',
      '.local/**',
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'docs/ui/**',
      'resources/ffmpeg/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: { window: 'readonly' },
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      // vue-tsc checks TypeScript identifiers, including DOM-only types.
      'no-undef': 'off',
      // Prettier owns whitespace; keep Vue's correctness rules enabled.
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,vue}', 'src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['node:*', 'electron/*', 'better-sqlite3/*'],
          paths: [...builtinModules, 'electron', 'better-sqlite3'],
        },
      ],
    },
  },
)
