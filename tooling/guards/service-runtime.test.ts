import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assertIsolated,
  bundle,
  type Found,
  missingFromOutput,
  publishStage,
  runtimePackageNames,
} from '../build-service.ts';
import {
  copyRuntimePackages,
  matchesPattern,
  otherTargetPrebuild,
  packageNameOf,
  type RuntimeCopyOptions,
  ServiceRuntimeError,
} from '../service-runtime.ts';

let scratch = '';

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'service-runtime-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function install(
  base: string,
  name: string,
  manifest: Readonly<Record<string, unknown>>,
  version = '1.0.0',
): string {
  const directory = join(base, 'node_modules', name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version, ...manifest }));
  writeFileSync(join(directory, 'index.js'), `export default '${name}@${version}';\n`);
  return directory;
}

function copyOptions(overrides: Partial<RuntimeCopyOptions> = {}): RuntimeCopyOptions {
  mkdirSync(join(scratch, 'hub'), { recursive: true });
  return {
    installedFrom: join(scratch, 'hub'),
    modules: join(scratch, 'out', 'node_modules'),
    roots: [],
    everyTargetRoots: [],
    platform: 'linux',
    arch: 'x64',
    ...overrides,
  };
}

function shipped(name: string): boolean {
  return existsSync(join(scratch, 'out', 'node_modules', name, 'package.json'));
}

function versionAt(path: string): string {
  const manifest = z.object({ version: z.string() });
  return manifest.parse(JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))).version;
}

describe('package names and patterns', () => {
  it('names the package behind plain, scoped and sub-path specifiers', () => {
    expect(packageNameOf('jose')).toBe('jose');
    expect(packageNameOf('dsh-plugin-codegraph-tree-sitter/grammar')).toBe(
      'dsh-plugin-codegraph-tree-sitter',
    );
    expect(packageNameOf('@deepseek-ai/dsh-web-fetch-http/lib/index.js')).toBe(
      '@deepseek-ai/dsh-web-fetch-http',
    );
  });

  it('matches external patterns as whole specifiers with * as a wildcard', () => {
    expect(matchesPattern('@deepseek-ai/dsh-tool-web', '@deepseek-ai/*')).toBe(true);
    expect(matchesPattern('@deepseek-ai', '@deepseek-ai/*')).toBe(false);
    expect(matchesPattern('jose', 'jose')).toBe(true);
    expect(matchesPattern('jose-extra', 'jose')).toBe(false);
    expect(matchesPattern('a/b.node', '*.node')).toBe(true);
    expect(matchesPattern('a/b.nodes', '*.node')).toBe(false);
  });
});

describe('prebuilt folders of other targets', () => {
  it('recognises the folder and the files inside a prebuild for another platform or architecture', () => {
    expect(otherTargetPrebuild('prebuilds/darwin-arm64', 'linux', 'arm64')).toBe(true);
    expect(otherTargetPrebuild('prebuilds/win32-x64/pty.node', 'linux', 'arm64')).toBe(true);
    expect(otherTargetPrebuild('prebuilds/linux-x64/pty.node', 'linux', 'arm64')).toBe(true);
    expect(otherTargetPrebuild('lib/prebuilds/linux-x64', 'linux', 'arm64')).toBe(true);
  });

  it('keeps the prebuild of the target and everything that is not a prebuild folder', () => {
    expect(otherTargetPrebuild('prebuilds/linux-arm64/pty.node', 'linux', 'arm64')).toBe(false);
    expect(otherTargetPrebuild('prebuilds', 'linux', 'arm64')).toBe(false);
    expect(otherTargetPrebuild('lib/index.js', 'linux', 'arm64')).toBe(false);
    expect(otherTargetPrebuild('prebuilds-notes/win32-x64.txt', 'linux', 'arm64')).toBe(false);
  });
});

describe('copyRuntimePackages', () => {
  it('leaves out the files the caller says cannot load on the target', () => {
    const directory = install(scratch, 'native-pty', {});
    for (const folder of ['linux-arm64', 'linux-x64', 'win32-x64']) {
      mkdirSync(join(directory, 'prebuilds', folder), { recursive: true });
      writeFileSync(join(directory, 'prebuilds', folder, 'pty.node'), folder);
    }

    copyRuntimePackages(
      copyOptions({
        roots: ['native-pty'],
        arch: 'arm64',
        omitPath: (path) => otherTargetPrebuild(path, 'linux', 'arm64'),
      }),
    );

    const shippedPrebuilds = join(scratch, 'out', 'node_modules', 'native-pty', 'prebuilds');
    expect(readdirSync(shippedPrebuilds)).toStrictEqual(['linux-arm64']);
    expect(shipped('native-pty')).toBe(true);
  });

  it('ships a package with its dependencies and required peers but not optional peers', () => {
    install(scratch, 'root-pkg', {
      dependencies: { 'dep-a': '1.0.0' },
      peerDependencies: { 'peer-required': '1.0.0', 'peer-optional': '1.0.0' },
      peerDependenciesMeta: { 'peer-optional': { optional: true } },
    });
    for (const name of ['dep-a', 'peer-required', 'peer-optional']) install(scratch, name, {});

    const count = copyRuntimePackages(copyOptions({ roots: ['root-pkg'] }));

    expect(count).toBe(3);
    expect(shipped('root-pkg')).toBe(true);
    expect(shipped('dep-a')).toBe(true);
    expect(shipped('peer-required')).toBe(true);
    expect(shipped('peer-optional')).toBe(false);
  });

  it('skips a required peer the host did not install instead of failing the build', () => {
    install(scratch, 'root-pkg', { peerDependencies: { 'peer-missing': '1.0.0' } });

    const count = copyRuntimePackages(copyOptions({ roots: ['root-pkg'] }));

    expect(count).toBe(1);
    expect(shipped('peer-missing')).toBe(false);
  });

  it('ships optional dependencies only when installed and meant for the build target', () => {
    install(scratch, 'root-pkg', {
      optionalDependencies: { 'for-linux': '1', 'for-windows': '1', 'not-installed': '1' },
    });
    install(scratch, 'for-linux', { os: ['linux'], cpu: ['x64'] });
    install(scratch, 'for-windows', { os: ['win32'] });

    copyRuntimePackages(copyOptions({ roots: ['root-pkg'] }));

    expect(shipped('for-linux')).toBe(true);
    expect(shipped('for-windows')).toBe(false);
    expect(shipped('not-installed')).toBe(false);
  });

  it('ships every installed platform package for roots packaged for any target', () => {
    install(scratch, 'sdk', { optionalDependencies: { 'sdk-windows': '1' } });
    install(scratch, 'sdk-windows', { os: ['win32'] });

    copyRuntimePackages(copyOptions({ roots: ['sdk'], everyTargetRoots: ['sdk'] }));

    expect(shipped('sdk-windows')).toBe(true);
  });

  it('leaves out omitted packages and ships the portable one beside them', () => {
    install(scratch, 'img', { optionalDependencies: { 'img-native': '1' } });
    install(scratch, 'img-native', { os: ['linux'] });
    install(scratch, 'img-wasm', { dependencies: { runtime: '1.0.0' } });
    install(scratch, 'runtime', {});

    copyRuntimePackages(
      copyOptions({
        roots: ['img', 'img-wasm'],
        omit: (name) => name === 'img-native',
      }),
    );

    expect(shipped('img')).toBe(true);
    expect(shipped('img-native')).toBe(false);
    expect(shipped('img-wasm')).toBe(true);
    expect(shipped('runtime')).toBe(true);
  });

  it('keeps a second version of a package nested under the package that needs it', () => {
    install(scratch, 'root-pkg', { dependencies: { 'dep-a': '1.0.0', shared: '2.0.0' } });
    install(scratch, 'dep-a', { dependencies: { shared: '1.0.0' } });
    install(join(scratch, 'node_modules', 'dep-a'), 'shared', {}, '1.0.0');
    install(scratch, 'shared', {}, '2.0.0');

    copyRuntimePackages(copyOptions({ roots: ['root-pkg'] }));

    const modules = join(scratch, 'out', 'node_modules');
    expect(versionAt(join(modules, 'shared'))).toBe('1.0.0');
    expect(versionAt(join(modules, 'root-pkg', 'node_modules', 'shared'))).toBe('2.0.0');
  });

  it('keeps every root at the top level even when an earlier root needs another version', () => {
    install(scratch, 'first', { dependencies: { shared: '1.0.0' } });
    install(join(scratch, 'node_modules', 'first'), 'shared', {}, '1.0.0');
    install(scratch, 'shared', {}, '2.0.0');

    copyRuntimePackages(copyOptions({ roots: ['first', 'shared'] }));

    const modules = join(scratch, 'out', 'node_modules');
    expect(versionAt(join(modules, 'shared'))).toBe('2.0.0');
    expect(versionAt(join(modules, 'first', 'node_modules', 'shared'))).toBe('1.0.0');
    expect(existsSync(join(modules, 'node_modules'))).toBe(false);
  });

  it('removes packages left from an earlier build', () => {
    install(scratch, 'root-pkg', {});
    install(join(scratch, 'out'), 'stale', {});

    copyRuntimePackages(copyOptions({ roots: ['root-pkg'] }));

    expect(shipped('stale')).toBe(false);
  });

  it('fails naming the package and who needs it when a required dependency is not installed', () => {
    install(scratch, 'root-pkg', { dependencies: { 'missing-dep': '1.0.0' } });

    expect(() => copyRuntimePackages(copyOptions({ roots: ['root-pkg'] }))).toThrow(
      new ServiceRuntimeError('Runtime package missing-dep (needed by root-pkg) is not installed.'),
    );
  });
});

describe('service bundle externals', () => {
  async function bundleFixture(source: string): Promise<Found> {
    const entry = join(scratch, 'entry.ts');
    writeFileSync(entry, source);
    return bundle(
      { entry, file: 'entry.mjs', external: ['@scope/*', 'lazy-pkg', 'x11'] },
      join(scratch, 'out'),
    );
  }

  it('finds packages the bundle imports, requires or loads lazily, and ignores the rest', async () => {
    const found = await bundleFixture(
      [
        "import { web } from '@scope/web';",
        "import { readFileSync } from 'node:fs';",
        'const createLazyRequire = (name: string, base: string) => () => name + base;',
        'const createRequire = (base: string) => (name: string) => name + base;',
        "export const load = createLazyRequire('lazy-pkg', import.meta.url);",
        "export const direct = createRequire(import.meta.url)('@scope/direct');",
        'export const used = [web, readFileSync];',
      ].join('\n'),
    );

    expect(found.imports).toEqual(['@scope/web']);
    expect(found.requires).toEqual(['lazy-pkg', '@scope/direct']);
  });

  it('lists the packages to ship without optional or asset-copied ones', () => {
    const names = runtimePackageNames([
      { imports: ['@scope/web/lib/a.js', 'jose'], requires: ['x11', 'sherpa-onnx', 'jose'] },
      { imports: ['@snazzah/davey-linux-x64-gnu'], requires: ['opusscript'] },
    ]);

    expect(names).toEqual(['@scope/web', 'jose', 'opusscript']);
  });

  it('reports every external package missing from the built service folder', () => {
    const out = join(scratch, 'out');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');
    const found = [{ imports: ['@scope/web'], requires: ['lazy-pkg'] }];

    expect(missingFromOutput(found, out)).toEqual(['@scope/web', 'lazy-pkg']);

    install(out, '@scope/web', { type: 'module', exports: './index.js' });
    install(out, 'lazy-pkg', { main: 'index.js' });
    writeFileSync(join(out, 'node_modules', 'lazy-pkg', 'index.js'), 'module.exports = 1;\n');

    expect(missingFromOutput(found, out)).toEqual([]);
  });
});

describe('packaging check isolation', () => {
  const found = [{ imports: ['@scope/web'], requires: [] }];

  it('resolves packages from folders above the build, which is why the build must be isolated', () => {
    install(scratch, '@scope/web', { type: 'module', exports: './index.js' });
    const out = join(scratch, 'apps', 'service');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');

    expect(missingFromOutput(found, out)).toEqual([]);
    expect(() => {
      assertIsolated(out);
    }).toThrow(ServiceRuntimeError);
  });

  it('accepts a folder with no node_modules above it and reports a missing package there', () => {
    const out = join(scratch, 'apps', 'service');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');

    expect(() => {
      assertIsolated(out);
    }).not.toThrow();
    expect(missingFromOutput(found, out)).toEqual(['@scope/web']);
  });

  it('replaces the published folder with the staged one and drops files from earlier builds', () => {
    const stage = join(scratch, 'stage');
    const out = join(scratch, 'published', 'service');
    mkdirSync(stage, { recursive: true });
    writeFileSync(join(stage, 'service.mjs'), 'new');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'old-worker.mjs'), 'old');

    publishStage(stage, out);

    expect(readFileSync(join(out, 'service.mjs'), 'utf8')).toBe('new');
    expect(existsSync(join(out, 'old-worker.mjs'))).toBe(false);
  });
});
