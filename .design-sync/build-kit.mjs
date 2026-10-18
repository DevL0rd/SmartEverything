import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(join(REPO, '.ds-sync', 'package.json'));
const { build, transform } = require('esbuild');
const babel = require(join(REPO, 'node_modules/@babel/core'));
const { Project, Node, ts } = require('ts-morph');
const { reactShim } = await import(new URL('../.ds-sync/lib/bundle.mjs', import.meta.url).href);

const APP = join(REPO, 'apps/app');
const COMPONENTS = join(APP, 'src/components');
const PKG_OUT = join(REPO, '.design-sync/.cache/kit-pkg');
const EXCLUDE = new Set(
  JSON.parse(readFileSync(join(REPO, '.design-sync/kit-exclude.json'), 'utf8')),
);

rmSync(PKG_OUT, { recursive: true, force: true });
mkdirSync(join(PKG_OUT, 'dist'), { recursive: true });

const files = [];
(function walk(d) {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (
      /\.tsx?$/.test(f) &&
      !/\.(test|d)\./.test(f) &&
      !/^index\.ts$/.test(f) &&
      !/\.native\./.test(f)
    )
      files.push(p);
  }
})(COMPONENTS);

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX },
});
const owner = new Map();
for (const file of files) {
  const sf = project.addSourceFileAtPath(file);
  for (const [name, decls] of sf.getExportedDeclarations()) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || /^[A-Z0-9_]+$/.test(name) || EXCLUDE.has(name))
      continue;
    const d = decls[0];
    const isFn = Node.isFunctionDeclaration(d) || Node.isClassDeclaration(d);
    const isVar = Node.isVariableDeclaration(d);
    if (!isFn && !isVar) continue;
    if (!owner.has(name)) owner.set(name, file);
  }
}
const byFile = new Map();
for (const [name, file] of owner) byFile.set(file, [...(byFile.get(file) ?? []), name]);

const entryDir = join(PKG_OUT, 'src-entry');
mkdirSync(entryDir, { recursive: true });
const lines = [];
for (const [file, names] of [...byFile].sort()) {
  lines.push(
    `export { ${names.sort().join(', ')} } from ${JSON.stringify(file.replace(/\.tsx?$/, ''))};`,
  );
}
const extras = join(REPO, '.design-sync/kit-extras.tsx');
if (existsSync(extras))
  lines.push(`export * from ${JSON.stringify(extras.replace(/\.tsx?$/, ''))};`);
const entry = join(entryDir, 'entry.ts');
writeFileSync(entry, lines.join('\n') + '\n');
console.error(`kit: ${owner.size} exports from ${byFile.size} files`);

const SUPPORTED = new Set([
  'ActivityIndicator',
  'Button',
  'FlatList',
  'Image',
  'ImageBackground',
  'InputAccessoryView',
  'KeyboardAvoidingView',
  'Modal',
  'Pressable',
  'RefreshControl',
  'SafeAreaView',
  'ScrollView',
  'SectionList',
  'Switch',
  'Text',
  'TextInput',
  'TouchableHighlight',
  'TouchableNativeFeedback',
  'TouchableOpacity',
  'TouchableWithoutFeedback',
  'View',
  'VirtualizedList',
]);
const nm = join(REPO, 'node_modules');
const uniwindDir = dirname(require.resolve(join(nm, 'uniwind/package.json')));
const rnwDir = join(nm, 'react-native-web');
const uniwindWeb = (m) => join(uniwindDir, 'dist/module/components/web', m + '.js');

const rnwPlugin = {
  name: 'rn-web-uniwind',
  setup(b) {
    b.onResolve({ filter: /^react-native$/ }, (args) => {
      if (args.importer.startsWith(uniwindDir)) return { path: join(rnwDir, 'dist/index.js') };
      return { path: join(uniwindDir, 'dist/module/components/web/index.js') };
    });
    b.onResolve({ filter: /^react-native\// }, (args) => {
      const sub = args.path.slice('react-native/'.length);
      return b.resolve(join(rnwDir, 'dist', sub), { kind: args.kind, resolveDir: args.resolveDir });
    });
    b.onResolve({ filter: /react-native-web\/dist\/(cjs\/)?exports\/[A-Za-z]+\/index/ }, (args) => {
      if (args.importer.startsWith(uniwindDir)) return undefined;
      const m = args.path.match(/exports\/([A-Za-z]+)\/index/)[1];
      if (!SUPPORTED.has(m) || args.importer.endsWith(`${m}/index.js`)) return undefined;
      return { path: uniwindWeb(m) };
    });
    b.onResolve({ filter: /createOrderedCSSStyleSheet(\.js)?$/ }, (args) => {
      if (args.importer.startsWith(uniwindDir) || !args.importer.startsWith(rnwDir))
        return undefined;
      return { path: uniwindWeb('createOrderedCSSStyleSheet') };
    });
    b.onResolve({ filter: /^\.\/exports\/[A-Za-z]+\/index/ }, (args) => {
      if (!args.importer.startsWith(rnwDir) || args.importer.startsWith(uniwindDir))
        return undefined;
      const m = args.path.match(/exports\/([A-Za-z]+)\/index/)[1];
      if (!SUPPORTED.has(m)) return undefined;
      return { path: uniwindWeb(m) };
    });
  },
};

const headSafe = {
  name: 'uniwind-head-safe',
  setup(b) {
    b.onLoad(
      { filter: /uniwind[\\/]dist[\\/]module[\\/]core[\\/]web[\\/]getWebStyles\.js$/ },
      (args) => ({
        contents: readFileSync(args.path, 'utf8').replace(
          'document.body.appendChild(dummyParent)',
          '(document.body ?? document.documentElement).appendChild(dummyParent)',
        ),
        loader: 'js',
      }),
    );
    b.onLoad({ filter: /expo[\\/]src[\\/]async-require[\\/]setup\.ts$/ }, () => ({
      contents: 'export {};',
      loader: 'js',
    }));
  },
};

const workletPlugin = {
  name: 'worklets',
  setup(b) {
    b.onLoad({ filter: /apps[\\/]app[\\/]src[\\/].*\.tsx?$/ }, async (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (
        !/react-native-reanimated|react-native-worklets|react-native-gesture-handler/.test(source)
      )
        return undefined;
      const js = await transform(source, {
        loader: args.path.endsWith('x') ? 'tsx' : 'ts',
        jsx: 'automatic',
        format: 'esm',
        target: 'esnext',
        sourcefile: args.path,
      });
      const out = await babel.transformAsync(js.code, {
        filename: args.path,
        babelrc: false,
        configFile: false,
        plugins: ['react-native-worklets/plugin'],
        sourceType: 'module',
      });
      return { contents: out.code, loader: 'js' };
    });
  },
};

const assetExts = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'mp3',
  'wav',
  'mp4',
  'ico',
];
await build({
  entryPoints: [entry],
  outfile: join(PKG_OUT, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  conditions: ['browser', 'import', 'module'],
  mainFields: ['browser', 'module', 'main'],
  resolveExtensions: [
    '.web.tsx',
    '.web.ts',
    '.web.jsx',
    '.web.js',
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.mjs',
    '.cjs',
    '.json',
  ],
  nodePaths: [nm, join(APP, 'node_modules')],
  plugins: [reactShim, rnwPlugin, headSafe, workletPlugin],
  loader: Object.fromEntries(assetExts.map((e) => [`.${e}`, 'dataurl'])),
  define: {
    'process.env.NODE_ENV': '"development"',
    'process.env.EXPO_OS': '"web"',
    __DEV__: 'true',
    global: 'globalThis',
  },
  logLevel: 'warning',
  sourcemap: false,
  banner: {
    js: "if(typeof globalThis.process==='undefined'){globalThis.process={env:{NODE_ENV:'development',EXPO_OS:'web'},platform:'browser',browser:true,version:'',versions:{},argv:[],cwd:function(){return '/'},nextTick:function(f){var a=Array.prototype.slice.call(arguments,1);Promise.resolve().then(function(){f.apply(null,a)})},emitWarning:function(){}}}",
  },
});

const tsconfig = {
  extends: join(APP, 'tsconfig.json'),
  compilerOptions: {
    composite: false,
    incremental: false,
    declarationMap: false,
    sourceMap: false,
    declaration: true,
    emitDeclarationOnly: true,
    noEmit: false,
    noEmitOnError: false,
    rootDir: REPO,
    outDir: join(PKG_OUT, 'dist/types'),
    tsBuildInfoFile: null,
    noUnusedLocals: false,
    noUnusedParameters: false,
  },
  include: [entry, join(APP, 'types/**/*.d.ts'), join(APP, 'expo-env.d.ts')],
  references: [],
};
writeFileSync(join(PKG_OUT, 'tsconfig.dts.json'), JSON.stringify(tsconfig, null, 2));
try {
  execFileSync(join(nm, '.bin/tsc'), ['-p', join(PKG_OUT, 'tsconfig.dts.json')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: APP,
  });
} catch (e) {
  console.error('kit: tsc declaration emit reported diagnostics (declarations still emitted)');
}
const entryDts = relative(
  join(PKG_OUT, 'dist'),
  join(PKG_OUT, 'dist/types', relative(REPO, entry).replace(/\.ts$/, '')),
);
writeFileSync(
  join(PKG_OUT, 'dist/index.d.ts'),
  `export * from ${JSON.stringify('./' + entryDts)};\n`,
);
writeFileSync(
  join(PKG_OUT, 'package.json'),
  JSON.stringify(
    {
      name: 'smarteverything-kit',
      version: '0.1.0',
      type: 'module',
      module: 'dist/index.js',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
    },
    null,
    2,
  ),
);
const docsDir = join(PKG_OUT, 'docs');
mkdirSync(docsDir, { recursive: true });
const glyphSf = project.addSourceFileAtPath(join(COMPONENTS, 'icon-glyphs.ts'));
project.resolveSourceFileDependencies();
function keysOf(obj) {
  return obj.getProperties().flatMap((m) => {
    if (Node.isSpreadAssignment(m)) {
      const sym = m.getExpression().getSymbolOrThrow();
      const decl = (sym.getAliasedSymbol() ?? sym).getValueDeclarationOrThrow();
      return keysOf(decl.getFirstDescendantByKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression));
    }
    return [m.getName().replace(/^['"]|['"]$/g, '')];
  });
}
const glyphs = keysOf(
  glyphSf
    .getVariableDeclarationOrThrow('GLYPHS')
    .getFirstDescendantByKindOrThrow(ts.SyntaxKind.ObjectLiteralExpression),
);
const roleSf = project.addSourceFileAtPath(join(APP, 'src/design/tokens.ts'));
const roles = roleSf
  .getTypeAliasOrThrow('ColourRole')
  .getTypeNodeOrThrow()
  .getText()
  .match(/'([^']+)'/g)
  .map((t) => t.slice(1, -1));
writeFileSync(
  join(docsDir, 'icons-and-colours.md'),
  `---\ncategory: Reference\n---\n# Icon names and colour roles\n\nThe typed props \`icon\`, \`name\` and \`colour\` accept these literal values (the .d.ts files show them as \`unknown\` only because the union is long).\n\n## Icon names (\`IconName\`)\n\n${glyphs.join(', ')}\n\n## Colour roles (\`ColourRole\`, for \`colour\` props and \`useColour\`)\n\n${roles.join(', ')}\n`,
);
const exportDir = join(REPO, '.design-sync/.cache/kit-export');
rmSync(exportDir, { recursive: true, force: true });
execFileSync(join(nm, '.bin/expo'), ['export', '--platform', 'web', '--output-dir', exportDir], {
  cwd: APP,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, EXPO_OFFLINE: '1', CI: '1' },
});
const cssDir = join(exportDir, '_expo/static/css');
const cssFile = readdirSync(cssDir).find((f) => f.endsWith('.css'));
cpSync(join(cssDir, cssFile), join(PKG_OUT, 'dist/styles.css'));
console.error('kit: dist/index.js and dist/styles.css built');
