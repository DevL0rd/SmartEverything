const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UNWATCHED = [
  '(?:tmp|coverage|reports|docs|tooling|\\.git|\\.stryker-tmp|ds-bundle|\\.ds-sync|\\.design-sync|\\.cache|\\.aws|\\.github|\\.claude|\\.agents)',
  'apps/(?:hub|desktop|optimization)',
  'apps/app/(?:android|dist|dist-types)',
  'apps/app/modules/[^/]+/(?:android|ios)',
];

const unwatchedPattern = new RegExp(
  `^(?:${escapeForRegExp(workspaceRoot)}/)?(?:${UNWATCHED.join('|')})(?:/|$)`,
);

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.blockList = [].concat(config.resolver.blockList, unwatchedPattern);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const REPLACED_ON_WEB = [
  {
    original:
      /react-native-web[\\/]dist[\\/](cjs[\\/])?modules[\\/]useElementLayout[\\/]index\.js$/,
    replacement: require.resolve('./src/platform/hidden-aware-element-layout.ts'),
  },
];

const baseTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const base = await baseTransformOptions(...args);
  return {
    ...base,
    transform: {
      ...base.transform,
      inlineRequires: true,
      nonInlinedRequires: [
        'React',
        'react',
        'react/jsx-dev-runtime',
        'react/jsx-runtime',
        'react/compiler-runtime',
        'react-compiler-runtime',
        'react-native',
      ],
    },
  };
};

const basePolyfills = config.serializer.getPolyfills;
config.serializer.getPolyfills = (options) => [
  ...basePolyfills(options),
  require.resolve('./src/dev/require-timing.js'),
];

const withUniwind = withUniwindConfig(config, {
  cssEntryFile: './global.css',
});

const resolveWithUniwind = withUniwind.resolver.resolveRequest;

withUniwind.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveWithUniwind ?? context.resolveRequest;
  const resolution = resolve(context, moduleName, platform);
  if (platform !== 'web' || resolution.type !== 'sourceFile') {
    return resolution;
  }
  const swap = REPLACED_ON_WEB.find((entry) => entry.original.test(resolution.filePath));
  return swap === undefined ? resolution : { type: 'sourceFile', filePath: swap.replacement };
};

module.exports = withUniwind;
