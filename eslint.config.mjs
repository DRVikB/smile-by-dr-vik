import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '.next/**', 'dist/**', 'next-env.d.ts'] },
  { files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'scripts/**/*.ts'], extends: [js.configs.recommended, ...tseslint.configs.recommended] }
);
