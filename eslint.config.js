import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config({ ignores: ['node_modules/**', '.wrangler/**', '.tasks/**'] },
  eslint.configs.recommended, ...tseslint.configs.recommended,
  { files: ['src/**/*.ts', 'test/**/*.{ts,js}'], languageOptions: { globals: {
    fetch: 'readonly', console: 'readonly', crypto: 'readonly', URL: 'readonly', Headers: 'readonly',
    Response: 'readonly', Request: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
    AbortController: 'readonly', AbortSignal: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
    D1Database: 'readonly', ScheduledController: 'readonly', ExecutionContext: 'readonly', RequestInit: 'readonly',
  } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error' } });
