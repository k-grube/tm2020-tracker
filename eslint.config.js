import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'coverage/', '.superpowers/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // core stays platform-neutral, tests may import anything
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'node:*',
            '../cli/*',
            '../web/*',
            '../test/*',
            '../../cli/*',
            '../../web/*',
            '../../test/*',
          ],
        },
      ],
    },
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      globals: {
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
      },
    },
  },
  prettier,
)
