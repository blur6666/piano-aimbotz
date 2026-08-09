import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import prettier from 'eslint-config-prettier'

// Uses @typescript-eslint/parser and @typescript-eslint/eslint-plugin
// directly rather than the `typescript-eslint` meta package, which hard-
// refuses to run against TypeScript 7 (this project's pinned compiler).
// The lower-level packages only warn on unsupported TS versions.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'client/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        window: 'readonly',
        document: 'readonly',
        AudioContext: 'readonly',
        MIDIInput: 'readonly',
        MIDIMessageEvent: 'readonly',
        URL: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      'no-unused-vars': 'off',
      'no-undef': 'off'
    }
  },
  {
    // Node-only maintenance scripts (report data export, chart rendering,
    // HTML export). They never reach the browser bundle, so they get Node
    // globals rather than the DOM set declared above.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2022,
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly'
      }
    }
  },
  prettier
]
