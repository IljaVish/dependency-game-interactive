import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './mcp/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript best practices
      ...tseslint.configs['recommended'].rules,

      // Project-specific rules
      '@typescript-eslint/no-explicit-any': 'error',       // keep types strict
      '@typescript-eslint/explicit-function-return-type': 'warn', // all functions typed
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }], // no stray console.log
    },
  },
]
