import { defineConfig } from 'vitest/config';

const include = (process.env['CORE_MUTATION_TESTS'] ?? '').split(',');
const hub = include.some((file) => file.startsWith('apps/hub'));

export default defineConfig({
  test: {
    projects: [
      hub
        ? {
            test: {
              name: 'hub',
              root: './apps/hub',
              environment: 'node',
              include: include.map((file) => file.replace('apps/hub/', '')),
              testTimeout: 30_000,
              hookTimeout: 30_000,
            },
          }
        : {
            test: {
              name: 'domain',
              root: './packages/domain',
              environment: 'node',
              include: include.map((file) => file.replace('packages/domain/', '')),
            },
          },
    ],
  },
});
