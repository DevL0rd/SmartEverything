import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const reactNative = fileURLToPath(
  new URL('./apps/app/src/test-support/react-native.ts', import.meta.url),
);

const flashList = fileURLToPath(
  new URL('./apps/app/src/test-support/flash-list.ts', import.meta.url),
);

const expoCore = createRequire(createRequire(import.meta.url).resolve('expo/package.json')).resolve(
  'expo-modules-core',
);

const expoNativeView = fileURLToPath(
  new URL('./apps/app/src/test-support/expo-native-view.ts', import.meta.url),
);

const EXPO_RUNTIME_ID = '\0expo-test-runtime';

const expoRuntime: Plugin = {
  name: 'expo-test-runtime',
  enforce: 'pre',
  resolveId(source) {
    return source === 'expo' ? EXPO_RUNTIME_ID : null;
  },
  load(id) {
    if (id !== EXPO_RUNTIME_ID) return null;
    return `export * from ${JSON.stringify(expoCore)};\nexport { requireNativeView } from ${JSON.stringify(expoNativeView)};\n`;
  },
};

const expoRouter = fileURLToPath(
  new URL('./apps/app/src/test-support/expo-router.ts', import.meta.url),
);

const expoRouterHead = fileURLToPath(
  new URL('./apps/app/src/test-support/expo-router-head.ts', import.meta.url),
);

const expoRouterJsTabs = fileURLToPath(
  new URL('./apps/app/src/test-support/expo-router-js-tabs.ts', import.meta.url),
);

const expoRouterNavigation = fileURLToPath(
  new URL('./apps/app/src/test-support/expo-router-react-navigation.ts', import.meta.url),
);

const reactNativeWebrtc = fileURLToPath(
  new URL('./apps/app/src/test-support/react-native-webrtc.ts', import.meta.url),
);

const expoNotifications = fileURLToPath(
  new URL('./apps/app/src/test-support/expo-notifications.ts', import.meta.url),
);

const appRequire = createRequire(new URL('./apps/app/package.json', import.meta.url));

const moduleBuild = (name: string): string =>
  resolve(dirname(appRequire.resolve(`${name}/package.json`)), 'lib/module/index.js');

const swipeable = resolve(
  dirname(appRequire.resolve('react-native-gesture-handler/package.json')),
  'lib/module/components/ReanimatedSwipeable/index.js',
);

const WEB_SUFFIXES = ['.web.ts', '.web.tsx', '.web.js', '.web.mjs'];

const packageWebBuilds: Plugin = {
  name: 'package-web-builds',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer === undefined || !importer.includes('/node_modules/') || !source.startsWith('.')) {
      return null;
    }
    const base = resolve(dirname(importer), source);
    const candidates = WEB_SUFFIXES.flatMap((suffix) => [
      `${base}${suffix}`,
      `${base}/index${suffix}`,
    ]);
    return candidates.find((path) => existsSync(path)) ?? null;
  },
};

export default defineConfig({
  test: {
    maxWorkers: 4,
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
          name: 'ipp',
          root: './packages/ipp',
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
          name: 'shelly',
          root: './packages/shelly',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'flow',
          root: './packages/flow',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'harness',
          root: './packages/harness',
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
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        plugins: [expoRuntime, packageWebBuilds],
        define: { __DEV__: 'true', 'process.env.EXPO_OS': '"android"' },
        resolve: {
          alias: [
            { find: /^react-native$/, replacement: reactNative },
            { find: /^@shopify\/flash-list$/, replacement: flashList },
            { find: /^expo-notifications$/, replacement: expoNotifications },
            { find: /^react-native-webrtc$/, replacement: reactNativeWebrtc },
            { find: /^expo-router$/, replacement: expoRouter },
            { find: /^expo-router\/head$/, replacement: expoRouterHead },
            { find: /^expo-router\/js-tabs$/, replacement: expoRouterJsTabs },
            { find: /^expo-router\/react-navigation$/, replacement: expoRouterNavigation },
            {
              find: /^react-native-safe-area-context$/,
              replacement: moduleBuild('react-native-safe-area-context'),
            },
            { find: /^react-native-svg$/, replacement: moduleBuild('react-native-svg') },
            {
              find: /^react-native-keyboard-controller$/,
              replacement: moduleBuild('react-native-keyboard-controller'),
            },
            { find: /^react-native-gesture-handler\/ReanimatedSwipeable$/, replacement: swipeable },
            {
              find: /^react-native-gesture-handler$/,
              replacement: moduleBuild('react-native-gesture-handler'),
            },
          ],
        },
        test: {
          name: 'app',
          root: './apps/app',
          environment: 'node',
          include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          server: {
            deps: {
              inline: [
                'react-native-reanimated',
                'react-native-worklets',
                'uniwind',
                'lucide-react-native',
              ],
            },
          },
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
          name: 'claude-hook',
          root: './tooling/claude-hook',
          environment: 'node',
          include: ['*.test.ts'],
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
      include: ['packages/{logging,domain,xiaomi,ble,ipp,tuya,smartthings,shelly,flow}/src/**/*.ts'],
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
