import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import { HUB_SERVICE_VERSION_FILE, readReleaseVersion } from './release-version.ts';
import { OPENVINO_PACKAGE, PLACES_DATASET } from './service-target.ts';
import { stageVisionModels } from './vision-models.ts';
import { BUNDLES, type Bundle } from './service-bundles.ts';
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

export interface Found {
  readonly imports: readonly string[];
  readonly requires: readonly string[];
}

const log = new Logger('tool.build-service');

const root = join(import.meta.dirname, '..');

const hub = join(root, 'apps', 'hub');

const WS_MASKING = join(hub, 'src', 'server', 'ws-masking.ts');

const OPTIONAL_UNSHIPPED = ['x11', 'usocket', 'cpu-features'];
const OPENVINO_LINK_COPIES = [
  /^bin\/pkgconfig(?:\/|$)/u,
  /^bin\/lib(?:openvino|openvino_c|openvino_\w+_frontend|tbb\w*|hwloc)\.so$/u,
  /^bin\/lib\w+\.so\.\d+\.\d+(?:\.\d+)?$/u,
];
const EVERY_TARGET_ROOTS = ['@anthropic-ai/claude-agent-sdk'];
const LOADED_AT_RUNTIME = [
  /createLazyRequire\w*\(\s*"([^"]+)"/gu,
  /createRequire\w*\(import\.meta\.url\)\(\s*"([^"]+)"/gu,
  /createRequire\w*\(import\.meta\.url\)\.resolve\(\s*"([^"]+)"/gu,
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
    define: { ...item.define },
    alias: { bufferutil: WS_MASKING },
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
    const result = spawnSync(process.execPath, [join(out, 'service.mjs')], {
      cwd: scratch,
      encoding: 'utf8',
      env: { HOME: scratch, SMARTEVERYTHING_HUB_HOME: scratch },
    });
    const output = `${result.stdout}${result.stderr}`;
    log.debug('smoke.finished', () => ({
      exitCode: result.status,
      outputBytes: output.length,
      reachedConfigurationCheck: output.includes('LocationError'),
      durationMs: Date.now() - started,
    }));
    if (
      result.status !== 1 ||
      !output.includes('LocationError') ||
      output.includes('ERR_MODULE_NOT_FOUND')
    )
      throw new ServiceRuntimeError(
        `The service bundle did not reach its configuration check:\n${output.slice(0, 2000)}`,
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

function copyPackages(stage: string, names: readonly string[], target: ServiceTarget): number {
  const { platform, arch } = target;
  const copying = log.operation('service.packages', { roots: names.length, platform, arch });
  const count = copyRuntimePackages({
    installedFrom: hub,
    modules: join(stage, 'node_modules'),
    roots: [...names, SHARP_WASM],
    omit: (name) => SHARP_NATIVE.test(name) || name.startsWith(VOICE_ASSET_PREFIX),
    omitPath: (path, name) =>
      otherTargetPrebuild(path, platform, arch) ||
      (name === OPENVINO_PACKAGE && OPENVINO_LINK_COPIES.some((pattern) => pattern.test(path))),
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

function stagePlacesDataset(stage: string): void {
  const target = join(stage, PLACES_DATASET);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, 'apps', 'hub', 'assets', PLACES_DATASET), target);
}

async function buildStage(
  stage: string,
  targetName: ServiceTargetName,
): Promise<{ names: number; count: number }> {
  const target = serviceTarget(targetName);
  const bundling = log.operation('service.bundle', { bundles: BUNDLES.length });
  const found = await Promise.all(BUNDLES.map((item) => bundle(item, stage)));
  bundling.succeeded();
  const names = runtimePackageNames(found);
  log.debug('packages.named', { roots: names.length });
  const count = copyPackages(stage, names, target);
  copyServiceAssets(stage, target);
  stageVisionModels(stage);
  stagePlacesDataset(stage);
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

async function assertToolSchemasCurrent(): Promise<void> {
  const { renderMcpToolSchemas, TOOL_SCHEMAS_FILE } =
    await import('./generate-mcp-tool-schemas.ts');
  if (readFileSync(TOOL_SCHEMAS_FILE, 'utf8') !== renderMcpToolSchemas())
    throw new ServiceRuntimeError(
      `The generated MCP tool schemas in ${TOOL_SCHEMAS_FILE} do not match the tools; run node --import tsx tooling/generate-mcp-tool-schemas.ts`,
    );
}

export async function buildService(out: string, targetName: ServiceTargetName): Promise<void> {
  await assertToolSchemasCurrent();
  const stage = mkdtempSync(join(tmpdir(), 'service-build-'));
  const building = log.operation('service.build', {
    out,
    target: targetName,
  });
  try {
    assertIsolated(stage);
    const { names, count } = await buildStage(stage, targetName);
    const version = readReleaseVersion('hub');
    writeFileSync(join(stage, HUB_SERVICE_VERSION_FILE), `${JSON.stringify({ version })}\n`);
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

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, target: { type: 'string' } },
  });
  const target = SERVICE_TARGET_NAME.parse(values.target ?? `${process.platform}-${process.arch}`);
  const out = resolve(values.out ?? join(root, 'tmp', 'hub-service'));
  await buildService(out, target);
}

if (import.meta.main) await main();
