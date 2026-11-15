import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { KeyObject } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  APP_UPDATE_PLATFORMS,
  MACHINE_UPDATE_ARCHES,
  RELEASE_NOTES,
  type ReleaseManifest,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { applyDeveloperHost, pnpmProgram } from './build-host.ts';
import { runInBuildScope, type BuildKind } from './build-scope.ts';
import {
  buildApk,
  buildDesktop,
  buildHub,
  buildUi,
  hostTarget,
  type BuildRequest,
  type Built,
} from './provide-release-build.ts';
import {
  moveInto,
  packedBundle,
  releaseManifestOf,
  signBundle,
  tarName,
  unsignedBundleOf,
  writeManifest,
  writeTar,
} from './provide-release-bundle.ts';
import { gitIn, pushedCleanCommit } from './provide-release-git.ts';
import { initReleaseKey, loadSigningKey, releaseKeyDirectory } from './provide-release-keys.ts';
import { hubTransport, readHubConnection, uploadRelease } from './provide-release-upload.ts';
import { runCommand } from './publish-app-update-shared.ts';
import { releaseServer } from './release-process.ts';
import { SERVICE_TARGET_NAME } from './service-target.ts';

const log = new Logger('tool.provide-release');

const ROOT = join(import.meta.dirname, '..');

const COMMANDS = ['hub', 'app', 'ui', 'desktop'] as const;

const KINDS: Readonly<Record<(typeof COMMANDS)[number], BuildKind>> = {
  hub: 'hub',
  app: 'app',
  ui: 'ui',
  desktop: 'desktop',
};

const USAGE = [
  'provide-release.ts --init-key',
  'provide-release.ts <hub|app|ui|desktop> --notes <text> [--target <linux-x64|linux-arm64|android|desktop>] [--arches <x64,arm64>] [--server <https url>] [--above <versionCode>] [--out <folder> [--unsigned] | --hub <url>]',
  'provide-release.ts sign <bundle.tar> --out <folder>',
].join('\n');

export class ProvideUsageError extends Error {
  override readonly name = 'ProvideUsageError';

  constructor(message: string) {
    super(`${message}\n${USAGE}`);
  }
}

const ARCHES = z
  .string()
  .transform((value) => value.split(',').map((part) => part.trim()))
  .pipe(z.array(z.enum(MACHINE_UPDATE_ARCHES)).min(1));

const BUILD_ARGUMENTS = z.object({
  command: z.enum(COMMANDS),
  notes: RELEASE_NOTES,
  target: z.string().optional(),
  arches: ARCHES.optional(),
  server: z.url({ protocol: /^https$/u }).optional(),
  above: z.coerce.number().int().min(0).optional(),
  out: z.string().min(1).optional(),
  hub: z.url().optional(),
  unsigned: z.boolean(),
});

export type BuildArguments = z.infer<typeof BUILD_ARGUMENTS>;

export type Arguments =
  | { readonly mode: 'init-key' }
  | { readonly mode: 'sign'; readonly tar: string; readonly out: string }
  | { readonly mode: 'build'; readonly build: BuildArguments };

function requireCombination(values: { out?: string; hub?: string; unsigned?: boolean }): void {
  if (values.out !== undefined && values.hub !== undefined)
    throw new ProvideUsageError('Use --out or --hub, not both');
  if (values.unsigned === true && values.out === undefined)
    throw new ProvideUsageError('--unsigned only works with --out');
}

export function parseArguments(argv: readonly string[]): Arguments {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      'init-key': { type: 'boolean' },
      notes: { type: 'string' },
      target: { type: 'string' },
      arches: { type: 'string' },
      server: { type: 'string' },
      above: { type: 'string' },
      out: { type: 'string' },
      hub: { type: 'string' },
      unsigned: { type: 'boolean' },
    },
  });
  if (values['init-key'] === true) return { mode: 'init-key' };
  const [command, tar] = positionals;
  if (command === 'sign') {
    if (tar === undefined || values.out === undefined)
      throw new ProvideUsageError('sign needs a bundle .tar and --out');
    return { mode: 'sign', tar: resolve(tar), out: resolve(values.out) };
  }
  requireCombination(values);
  const parsed = BUILD_ARGUMENTS.safeParse({
    ...values,
    command,
    out: values.out === undefined ? undefined : resolve(values.out),
    unsigned: values.unsigned === true,
  });
  if (!parsed.success)
    throw new ProvideUsageError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  return { mode: 'build', build: parsed.data };
}

function requiredServer(server: string | undefined): string {
  if (server === undefined)
    throw new ProvideUsageError('Set --server or EXPO_PUBLIC_SERVER_URL to the Hub https address');
  return server;
}

export function buildPlan(
  options: BuildArguments,
  request: BuildRequest,
  server: string | undefined,
): () => Promise<Built> {
  if (options.command === 'hub')
    return () =>
      Promise.resolve(buildHub(request, SERVICE_TARGET_NAME.parse(options.target ?? hostTarget())));
  if (options.command === 'app') {
    if (options.above === undefined)
      throw new ProvideUsageError(
        'app needs --above <versionCode of the newest published or installed build>',
      );
    const above = options.above;
    return () => buildApk(request, requiredServer(server), above);
  }
  if (options.command === 'ui') {
    const platform = z.enum(APP_UPDATE_PLATFORMS).parse(options.target ?? 'android');
    return () => buildUi(request, platform, requiredServer(server));
  }
  const arches =
    options.arches ??
    (options.target === undefined
      ? ['x64' as const]
      : ARCHES.parse(options.target.replace(/^linux-/u, '')));
  return () => buildDesktop(request, arches, requiredServer(server));
}

function typeCheck(): void {
  runCommand({
    title: 'type check the repository',
    program: pnpmProgram(),
    args: ['run', 'typecheck'],
    cwd: ROOT,
    environment: {},
  });
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function scratchFolder(): string {
  const base = join(ROOT, 'tmp', 'build-sources');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, 'provide-'));
}

function enterScope(kind: BuildKind): number | null {
  const cache = join(ROOT, 'tmp', 'build-sources', 'cache');
  mkdirSync(cache, { recursive: true });
  return runInBuildScope(kind, { cache: { buildHost: cache } }, (error) => {
    log.error('provide.scope_refused', error);
  });
}

interface Delivery {
  readonly options: BuildArguments;
  readonly bundle: string;
  readonly scratch: string;
  readonly manifest: ReleaseManifest;
  readonly key: KeyObject | undefined;
}

async function deliver(delivery: Delivery): Promise<void> {
  const { options, bundle, scratch, manifest, key } = delivery;
  const tar = join(scratch, tarName(manifest));
  if (key === undefined) {
    if (options.out === undefined) throw new ProvideUsageError('--unsigned needs --out');
    await writeTar(bundle, tar);
    say(`unsigned bundle ${await moveInto(tar, options.out, tarName(manifest))}`);
    return;
  }
  const fingerprint = await signBundle(bundle, key);
  const verified = await packedBundle(bundle, tar, scratch, key);
  log.info('provide.bundle_ready', {
    artifact: manifest.artifact,
    version: manifest.version,
    commit: manifest.commit,
    files: manifest.files.length,
    bytes: verified.bytes,
    fingerprint,
  });
  if (options.out !== undefined) {
    say(`signed bundle ${await moveInto(tar, options.out, tarName(manifest))}`);
    say(`signed with key ${fingerprint}`);
    return;
  }
  const connection = await readHubConnection(undefined, options.hub);
  const upload = await uploadRelease({
    connection,
    transport: hubTransport(connection),
    artifact: manifest.artifact,
    tar,
    progress: (sent, total) => {
      say(`uploaded ${String(Math.floor((sent / total) * 100))}%`);
    },
  });
  say(`upload ${upload.uploadId} is ${upload.state}`);
  say(`pass it to update_control as source provided with upload ${upload.uploadId}`);
}

async function build(options: BuildArguments): Promise<void> {
  const commit = pushedCleanCommit(gitIn(ROOT));
  const key = options.unsigned ? undefined : loadSigningKey();
  applyDeveloperHost();
  const status = enterScope(KINDS[options.command]);
  if (status !== null) {
    process.exitCode = status;
    return;
  }
  const scratch = scratchFolder();
  try {
    const bundle = join(scratch, 'bundle');
    const files = join(bundle, 'files');
    mkdirSync(files, { recursive: true });
    typeCheck();
    const built = await buildPlan(
      options,
      { root: ROOT, files, scratch },
      options.server ?? releaseServer(),
    )();
    const manifest = await releaseManifestOf(
      { ...built, commit, notes: options.notes, gate: { typeCheck: 'passed', commit } },
      files,
    );
    await writeManifest(bundle, manifest);
    await deliver({ options, bundle, scratch, manifest, key });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function sign(tar: string, out: string): Promise<void> {
  const key = loadSigningKey();
  const scratch = scratchFolder();
  try {
    const bundle = join(scratch, 'bundle');
    const manifest = await unsignedBundleOf(tar, bundle);
    const fingerprint = await signBundle(bundle, key);
    const packed = join(scratch, tarName(manifest));
    await packedBundle(bundle, packed, scratch, key);
    say(`signed bundle ${await moveInto(packed, out, tarName(manifest))}`);
    say(`signed with key ${fingerprint}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.mode === 'init-key') {
    const { identity, created } = initReleaseKey();
    say(created ? 'Made the machine release key.' : 'The machine release key already exists.');
    say(`key folder ${releaseKeyDirectory()}`);
    say(`fingerprint ${identity.fingerprint}`);
    say(`public key ${identity.publicKey}`);
    say('Trust it on the Hub with update_control release_keys trust, role machine.');
    return;
  }
  if (parsed.mode === 'sign') {
    await sign(parsed.tar, parsed.out);
    return;
  }
  await build(parsed.build);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
