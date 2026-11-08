import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { z } from 'zod';
import { COMPUTER_DATA_DIRECTORY_VARIABLE } from '@smarteverything/domain';
import { computerNodeExecutable } from '../apps/desktop/src/package-layout.ts';
import { copyComputerNodeRuntime } from './computer-node-runtime.ts';
import { Logger } from '@smarteverything/logging';
import {
  assertIsolated,
  bundle,
  missingFromOutput,
  publishStage,
  runtimePackageNames,
  type Bundle,
} from './build-service.ts';
import { copyComputerWakeAssets, VOICE_ASSET_PACKAGE_NAMES } from './copy-voice-assets.ts';
import {
  copyRuntimePackages,
  otherTargetPrebuild,
  ServiceRuntimeError,
} from './service-runtime.ts';

const log = new Logger('tool.build-computer');
const root = resolve(import.meta.dirname, '..');
const desktop = join(root, 'apps', 'desktop');
const hub = join(root, 'apps', 'hub');
const COMPUTER_VERSION = z
  .object({ version: z.string().min(1) })
  .parse(JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'))).version;
const DEFINE = { SMARTEVERYTHING_COMPUTER_VERSION: JSON.stringify(COMPUTER_VERSION) };
const BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; import { fileURLToPath as serviceFileUrlToPath } from "node:url"; import { dirname as serviceDirname } from "node:path"; const require = createServiceRequire(import.meta.url); const __filename = serviceFileUrlToPath(import.meta.url); const __dirname = serviceDirname(__filename);';
const CLAUDE = '@anthropic-ai/claude-agent-sdk';
const EXTERNALS = [
  '@deepseek-ai/*',
  '@earendil-works/*',
  'jose',
  CLAUDE,
  'x11',
  'usocket',
  'cpu-features',
  '*.node',
];
const MAIN: Bundle = {
  entry: join(desktop, 'packaging', 'computer', 'entry.ts'),
  file: 'computer.mjs',
  external: EXTERNALS,
  banner: BANNER,
  define: DEFINE,
};
const BUNDLES: readonly Bundle[] = [
  MAIN,
  {
    entry: join(hub, 'src', 'node', 'ear', 'process', 'worker.ts'),
    file: 'ear-process.mjs',
    external: EXTERNALS,
    banner: BANNER,
    define: DEFINE,
  },
  {
    entry: join(hub, 'src', 'service', 'loop-watchdog', 'worker.ts'),
    file: 'loop-watchdog.mjs',
    external: [],
  },
  { entry: join(hub, 'src', 'claude', 'hook-helper.ts'), file: 'hook-helper.mjs', external: [] },
  {
    entry: join(desktop, 'src', 'drive-sync', 'blocks-worker.ts'),
    file: 'drive-blocks.mjs',
    external: [],
  },
];
const CENTRAL_HUB =
  /^apps\/hub\/src\/(?:main\.ts|start\.ts|service\.ts|service\/runner\.ts|store\/|server\/(?!(?:http|request-trace|handlers\/claude-link)\.ts$))/u;

async function assertComputerGraph(): Promise<void> {
  const { metafile } = await build({
    absWorkingDir: root,
    entryPoints: [MAIN.entry],
    bundle: true,
    external: [...MAIN.external],
    define: DEFINE,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    write: false,
    metafile: true,
  });
  const central = Object.values(metafile.outputs)
    .flatMap((output) => Object.keys(output.inputs))
    .find((file) => CENTRAL_HUB.test(file));
  if (central !== undefined)
    throw new ServiceRuntimeError(`The computer bundle includes central Hub source ${central}.`);
}

function checkClaudeRuntime(stage: string, platform: string, arch: string): void {
  const manifest = z.object({ version: z.string() });
  const modules = join(stage, 'node_modules');
  const sdk = manifest.parse(
    JSON.parse(readFileSync(join(modules, CLAUDE, 'package.json'), 'utf8')),
  );
  const target = join(modules, `${CLAUDE}-${platform}-${arch}`);
  const binary = join(target, platform === 'win32' ? 'claude.exe' : 'claude');
  try {
    const native = manifest.parse(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')));
    if (sdk.version !== native.version || !statSync(binary).isFile()) {
      throw new ServiceRuntimeError('The target binary must match the installed SDK.');
    }
  } catch (cause) {
    throw new ServiceRuntimeError(
      `Install Claude SDK ${sdk.version} for ${platform}-${arch} before packaging Desktop.`,
      { cause },
    );
  }
}

function checkPairing(out: string): void {
  const scratch = mkdtempSync(join(tmpdir(), 'computer-smoke-'));
  try {
    const result = spawnSync(
      join(out, computerNodeExecutable(process.platform)),
      [join(out, MAIN.file), '--pair-node'],
      {
        cwd: scratch,
        encoding: 'utf8',
        env: { HOME: scratch, [COMPUTER_DATA_DIRECTORY_VARIABLE]: scratch },
      },
    );
    if (result.status !== 1 || !result.stderr.includes('NodeSetupArgumentsError')) {
      throw new ServiceRuntimeError(
        `Computer pairing did not reach argument validation. ${result.stderr}`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, platform: { type: 'string' }, arch: { type: 'string' } },
  });
  const platform = values.platform ?? process.platform;
  const arch = values.arch ?? process.arch;
  const stage = mkdtempSync(join(tmpdir(), 'desktop-computer-build-'));
  const out = values.out === undefined ? join(desktop, 'dist', 'computer') : resolve(values.out);
  try {
    assertIsolated(stage);
    await assertComputerGraph();
    const found = await Promise.all(BUNDLES.map((item) => bundle(item, stage)));
    const count = copyRuntimePackages({
      installedFrom: hub,
      modules: join(stage, 'node_modules'),
      roots: [...runtimePackageNames(found), ...VOICE_ASSET_PACKAGE_NAMES],
      everyTargetRoots: [],
      platform,
      arch,
      omitPath: (path) => otherTargetPrebuild(path, platform, arch),
    });
    await copyComputerNodeRuntime(
      stage,
      join(root, 'tmp', 'computer-node-runtime'),
      platform,
      arch,
    );
    copyComputerWakeAssets(stage);
    checkClaudeRuntime(stage, platform, arch);
    const missing = missingFromOutput(found, stage);
    if (missing.length > 0)
      throw new ServiceRuntimeError(`Missing computer runtime packages: ${missing.join(', ')}`);
    if (platform === process.platform && arch === process.arch) checkPairing(stage);
    publishStage(stage, out);
    log.info('computer.built', { out, platform, arch, packages: count });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
