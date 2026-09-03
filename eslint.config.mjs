import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      '.wrangler/',
      'test/fixtures/',
      // Generated files: `pnpm cf-typegen` and `pnpm build:templates` own these.
      'worker-configuration.d.ts',
      'src/render/templates.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused args are fine when they document a signature; prefix with _.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // Parsed HTML is untyped by nature; we narrow it by hand.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Build tooling runs in Node, not in the Worker, and is plain JS.
    files: ['scripts/**/*.mjs', 'eslint.config.mjs', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
