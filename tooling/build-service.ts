import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Logger } from '@smarteverything/logging';
import { build } from 'esbuild';
import { z } from 'zod';
import {
  copyServiceAssets,
  VOICE_ASSET_PACKAGE_NAMES,
  VOICE_ASSET_PREFIX,
} from './copy-voice-assets.ts';
import {
  copyRuntimePackages,
  matchesPattern,
  otherTargetPrebuild,
  packageNameOf,
  ServiceRuntimeError,
} from './service-runtime.ts';
import {
  SERVICE_TARGET_NAME,
  SHARP_NATIVE,
  SHARP_WASM,
  type ServiceTarget,
  type ServiceTargetName,
  serviceTarget,
  targetIsHost,
  verifyServiceTarget,
} from './service-target.ts';

export interface Bundle {
  readonly entry: string;
  readonly file: string;
  readonly external: readonly string[];
  readonly banner?: string;
}

export interface Found {
  readonly imports: readonly string[];
  readonly requires: readonly string[];
}

const log = new Logger('tool.build-service');

const root = join(import.meta.dirname, '..');
const desktop = join(root, 'apps', 'desktop');
const hub = join(root, 'apps', 'hub');

const SERVICE_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; import { fileURLToPath as serviceFileUrlToPath } from "node:url"; import { dirname as serviceDirname } from "node:path"; const require = createServiceRequire(import.meta.url); const __filename = serviceFileUrlToPath(import.meta.url); const __dirname = serviceDirname(__filename);';
const OPTIONAL_UNSHIPPED = ['x11', 'usocket', 'cpu-features'];
const EVERY_TARGET_ROOTS = ['@anthropic-ai/claude-agent-sdk'];
const LOADED_AT_RUNTIME = [
  /createLazyRequire\w*\(\s*"([^"]+)"/gu,
  /createRequire\w*\(import\.meta\.url\)\(\s*"([^"]+)"/gu,
];
const VOICE_EXTERNALS = ['ffmpeg-static', `${VOICE_ASSET_PREFIX}*`, '*.node'];
const SERVICE_EXTERNALS = [
  '@deepseek-ai/*',
  '@earendil-works/*',
  'jose',
  '@anthropic-ai/claude-agent-sdk',
  'ts-json-schema-generator',
  'x11',
  'usocket',
  'cpu-features',
  'sharp',
  ...VOICE_EXTERNALS,
];
const BUNDLES: readonly Bundle[] = [
  {
    entry: join(hub, 'src', 'service.ts'),
    file: 'service.mjs',
    external: SERVICE_EXTERNALS,
    banner: SERVICE_BANNER,
  },
  {
    entry: join(hub, 'src', 'plugins', 'builtin', 'discord', 'voice', 'isolated', 'worker.ts'),
    file: 'voice-worker.mjs',
    external: VOICE_EXTERNALS,
    banner: SERVICE_BANNER,
  },
  { entry: join(hub, 'src', 'claude', 'hook-helper.ts'), file: 'hook-helper.mjs', external: [] },
  {
    entry: join(hub, 'src', 'plugins', 'builtin', 'printer', 'raster-worker.ts'),
    file: 'raster-worker.mjs',
    external: [],
  },
];

function isBareExternal(path: string, patterns: readonly string[]): boolean {
  if (path.startsWith('.') || path.startsWith('/')) return false;
  if (builtinModules.includes(path.replace(/^node:/u, ''))) return false;
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

export async function bundle(item: Bundle, out: string): Promise<Found> {
  const outfile = join(out, item.file);
  const started = Date.now();
  log.debug('bundle.started', { file: item.file, externals: item.external.length });
  const result = await build({
    entryPoints: [item.entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: [...item.external],
    banner: item.banner === undefined ? {} : { js: item.banner },
    metafile: true,
    logLevel: 'warning',
  });
  const emitted = Object.values(result.metafile.outputs)[0]?.imports ?? [];
  const externals = emitted.filter(
    (entry) => entry.external === true && isBareExternal(entry.path, item.external),
  );
  const text = readFileSync(outfile, 'utf8');
  const lazy = LOADED_AT_RUNTIME.flatMap((pattern) =>
    [...text.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])),
  );
  const found = {
    imports: externals.filter((entry) => entry.kind !== 'require-call').map((entry) => entry.path),
    requires: [
      ...externals.filter((entry) => entry.kind === 'require-call').map((entry) => entry.path),
      ...lazy,
    ],
  };
  log.debug('bundle.finished', () => ({
    file: item.file,
    bytes: text.length,
    imports: found.imports.length,
    requires: found.requires.length,
    lazyRequires: lazy.length,
    durationMs: Date.now() - started,
  }));
  return found;
}

export function isShipped(specifier: string): boolean {
  const name = packageNameOf(specifier);
  return (
    !OPTIONAL_UNSHIPPED.includes(name) &&
    !VOICE_ASSET_PACKAGE_NAMES.includes(name) &&
    !name.startsWith(VOICE_ASSET_PREFIX)
  );
}

export function runtimePackageNames(found: readonly Found[]): readonly string[] {
  const specifiers = found.flatMap((item) => [...item.imports, ...item.requires]);
  return [...new Set(specifiers.filter(isShipped).map(packageNameOf))].sort();
}

const RESOLVE_SCRIPT = `
  import { createRequire } from 'node:module';
  const { imports, requires } = JSON.parse(process.argv[1]);
  const require = createRequire(process.cwd() + '/service.mjs');
  const missing = [];
  for (const name of imports) { try { import.meta.resolve(name); } catch { missing.push(name); } }
  for (const name of requires) { try { require.resolve(name); } catch { missing.push(name); } }
  process.stdout.write(JSON.stringify(missing));
`;

export function missingFromOutput(found: readonly Found[], out: string): readonly string[] {
  const request = {
    imports: found.flatMap((item) => item.imports.filter(isShipped)),
    requires: found.flatMap((item) => item.requires.filter(isShipped)),
  };
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', RESOLVE_SCRIPT, JSON.stringify(request)],
    { cwd: out, encoding: 'utf8' },
  );
  log.debug('resolve.checked', {
    imports: request.imports.length,
    requires: request.requires.length,
    exitCode: result.status,
  });
  if (result.status !== 0)
    throw new ServiceRuntimeError(
      `Checking the shipped packages failed (exit ${String(result.status)}):\n${result.stderr.slice(0, 2000)}`,
    );
  return z.array(z.string()).parse(JSON.parse(result.stdout));
}

export function assertIsolated(directory: string): void {
  for (let parent = dirname(directory); ; parent = dirname(parent)) {
    if (existsSync(join(parent, 'node_modules')))
      throw new ServiceRuntimeError(
        `${directory} sits below ${join(parent, 'node_modules')}, so Node would resolve packages from outside the build and the packaging check would prove nothing.`,
      );
    if (parent === dirname(parent)) return;
  }
}

function startServiceBundle(out: string): void {
  const scratch = mkdtempSync(join(tmpdir(), 'service-smoke-'));
  const started = Date.now();
  log.debug('smoke.started', { bundle: 'service.mjs' });
  try {
    const result = spawnSync(process.execPath, [join(out, 'service.mjs'), '--pair-node'], {
      cwd: scratch,
      encoding: 'utf8',
      env: { HOME: scratch, SMARTEVERYTHING_DATA_DIRECTORY: scratch },
    });
    const output = `${result.stdout}${result.stderr}`;
    log.debug('smoke.finished', () => ({
      exitCode: result.status,
      outputBytes: output.length,
      reachedArgumentCheck: output.includes('NodeSetupArgumentsError'),
      durationMs: Date.now() - started,
    }));
    if (!output.includes('NodeSetupArgumentsError') || output.includes('ERR_MODULE_NOT_FOUND'))
      throw new ServiceRuntimeError(
        `The service bundle did not reach its argument check:\n${output.slice(0, 2000)}`,
      );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function publishStage(stage: string, out: string): void {
  log.debug('publish.started', { out });
  rmSync(out, { recursive: true, force: true });
  mkdirSync(dirname(out), { recursive: true });
  cpSync(stage, out, { recursive: true, verbatimSymlinks: true });
  log.debug('publish.finished', { out });
}

function copyPackages(
  stage: string,
  names: readonly string[],
  target: ServiceTarget | undefined,
): number {
  const platform = target?.platform ?? process.platform;
  const arch = target?.arch ?? process.arch;
  const copying = log.operation('service.packages', { roots: names.length, platform, arch });
  const count = copyRuntimePackages({
    installedFrom: hub,
    modules: join(stage, 'node_modules'),
    roots: [...names, SHARP_WASM],
    omit: (name) => SHARP_NATIVE.test(name),
    omitPath: (path) => otherTargetPrebuild(path, platform, arch),
    everyTargetRoots: EVERY_TARGET_ROOTS,
    platform,
    arch,
  });
  copying.succeeded({ copied: count });
  return count;
}

function checkStage(stage: string, targetName: ServiceTargetName | undefined): void {
  if (targetName !== undefined) verifyServiceTarget(stage, targetName, { binaries: false });
  if (targetName === undefined || targetIsHost(serviceTarget(targetName)))
    startServiceBundle(stage);
}

async function buildStage(
  stage: string,
  targetName: ServiceTargetName | undefined,
): Promise<{ names: number; count: number }> {
  const target = targetName === undefined ? undefined : serviceTarget(targetName);
  const bundling = log.operation('service.bundle', { bundles: BUNDLES.length });
  const found = await Promise.all(BUNDLES.map((item) => bundle(item, stage)));
  bundling.succeeded();
  const names = runtimePackageNames(found);
  log.debug('packages.named', { roots: names.length });
  const count = copyPackages(stage, names, target);
  copyServiceAssets(stage, target);
  log.debug('assets.copied');
  const missing = missingFromOutput(found, stage);
  if (missing.length > 0)
    log.error('service.packages_missing', undefined, { count: missing.length, names: missing });
  if (missing.length > 0)
    throw new ServiceRuntimeError(
      `The service bundles import packages that are not in the build: ${missing.join(', ')}`,
    );
  checkStage(stage, targetName);
  return { names: names.length, count };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, target: { type: 'string' } },
  });
  const targetName =
    values.target === undefined ? undefined : SERVICE_TARGET_NAME.parse(values.target);
  const out = values.out === undefined ? join(desktop, 'dist', 'service') : resolve(values.out);
  const stage = mkdtempSync(join(tmpdir(), 'service-build-'));
  const building = log.operation('service.build', {
    out,
    target: targetName ?? `${process.platform}-${process.arch}`,
  });
  try {
    assertIsolated(stage);
    const { names, count } = await buildStage(stage, targetName);
    publishStage(stage, out);
    building.succeeded({ packages: count, roots: names });
    process.stdout.write(
      `Built ${String(BUNDLES.length)} service bundles and ${String(count)} runtime packages from ${String(names)} roots into ${out}.\n`,
    );
  } catch (error) {
    building.failed(error);
    throw error;
  } finally {
    rmSync(stage, { recursive: true, force: true });
    log.debug('stage.removed');
  }
}

if (import.meta.main) await main();
