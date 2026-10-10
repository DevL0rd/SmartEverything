import { fileURLToPath } from 'node:url';
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
          typecheck: {
            enabled: true,
            include: ['test/**/*.test-d.ts'],
          },
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
          name: 'ble',
          root: './packages/ble',
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
      {
        test: {
          name: 'hub',
          root: './apps/hub',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'app',
          root: './apps/app',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'desktop',
          root: './apps/desktop',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'contracts',
          root: './tooling/dependency-contracts',
          environment: 'node',
          include: ['**/*.contract.test.ts'],
          server: { deps: { inline: ['@react-native-community/netinfo'] } },
          alias: {
            '@react-native-community/netinfo': `${fileURLToPath(new URL('./node_modules/', import.meta.url))}@react-native-community/netinfo/lib/module/index.js`,
          },
        },
      },
      {
        test: {
          name: 'guards',
          root: './tooling/guards',
          environment: 'node',
          include: ['**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
