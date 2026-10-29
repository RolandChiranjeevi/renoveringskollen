import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'server/drizzle/**','e2e/.report/**',
      'e2e/.results/**',
      'e2e/.tmp/**',] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['web/**/*.{ts,tsx}'], ...reactHooks.configs.flat.recommended },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);

//added comment so I can push changes, yolo.
