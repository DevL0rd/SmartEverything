import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'logging',
          root: './packages/logging',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'domain',
          root: './packages/domain',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'xiaomi',
          root: './packages/xiaomi',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'tuya',
          root: './packages/tuya',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'smartthings',
          root: './packages/smartthings',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
});
