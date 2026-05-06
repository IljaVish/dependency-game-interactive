import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  // ── JS / JSX (game UI) ────────────────────────────────────────────────────
  {
    files: ['**/*.js', '**/*.jsx'],
    ...js.configs.recommended,
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: 'readonly', document: 'readonly', console: 'readonly' },
    },
    settings: { react: { version: '18' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Project-specific
      'no-unused-vars':  ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console':      ['warn', { allow: ['warn', 'error'] }],
      'react/prop-types': 'off',   // we don't use PropTypes — TypeScript or trust is enough
      'react/react-in-jsx-scope': 'off', // not needed with React 18 JSX transform
    },
  },

  // ── TS / TSX (MCP server) ─────────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './mcp/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]
