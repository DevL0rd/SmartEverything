const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const REPLACED_ON_WEB = [
  {
    original: /react-native-web[\\/]dist[\\/](cjs[\\/])?modules[\\/]useElementLayout[\\/]index\.js$/,
    replacement: require.resolve('./src/platform/hidden-aware-element-layout.ts'),
  },
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
