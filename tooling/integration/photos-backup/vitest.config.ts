import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: /^@smarteverything\/domain$/, replacement: `${root}packages/domain/src/index.ts` },
      { find: /^@smarteverything\/logging$/, replacement: `${root}packages/logging/src/index.ts` },
    ],
  },
  test: {
    environment: 'node',
    include: ['tooling/integration/photos-backup/*.test.ts'],
    maxWorkers: 2,
  },
});
