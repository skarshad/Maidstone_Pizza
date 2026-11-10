import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Shared flat ESLint config for every package and app. */
export default tseslint.config(
  {
    ignores: ['.next/**', 'dist/**', 'node_modules/**', 'next-env.d.ts', '**/database.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
