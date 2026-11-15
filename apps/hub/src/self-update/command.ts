import { execFile, spawn } from 'node:child_process';
import { access, mkdir, open, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  HUB_UPDATE_HOST_PLATFORM,
  RELEASE_SOURCE,
  type HubUpdateOrigin,
  type PipelineComponent,
  type ReleaseSource,
} from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { buildSourceOf } from './build-source';
import { findCheckoutSource } from './update-source';

const execute = promisify(execFile);
const REPLY = z.record(z.string(), z.unknown());
const OUTPUT_BYTES = 1024 * 1024;
const LOCK_BUSY = 75;
const LOG_TAIL_LINES = 20;
const RUN_ID = z.uuid();
const RUN_INPUT = z.union([
  z.object({ input: z.object({ runId: RUN_ID }) }).transform((value) => value.input.runId),
  z.object({ runId: RUN_ID }).transform((value) => value.runId),
]);
const TSX_IMPORT = ['--import', 'tsx'];
const INSTALLED_HUB_COMMAND = fileURLToPath(new URL('./update/hub-command.mjs', import.meta.url));

type ConfiguredUpdateScript =
  | 'self-update-hub-command.ts'
  | 'self-update-app-command.ts'
  | 'self-update-desktop-command.ts'
  | 'self-update-push-plan-command.ts'
  | 'hub-update-source-command.ts'
  | 'hub-update-tip-command.ts'
  | 'hub-update-save-command.ts';

type BuildScript = 'self-update-app-command.ts' | 'self-update-desktop-command.ts';

const BUILD_SCRIPTS: ReadonlySet<ConfiguredUpdateScript> = new Set<BuildScript>([
  'self-update-app-command.ts',
  'self-update-desktop-command.ts',
]);

export class UpdateUnavailableError extends Error {
  override readonly name: string = 'UpdateUnavailableError';
}

export class HubBuildRefusedError extends UpdateUnavailableError {
  override readonly name: string = 'HubBuildRefusedError';
}

const ARTIFACT_NAMES: Readonly<Record<PipelineComponent, string>> = {
  hub: 'the Hub service',
  app: 'the Android app',
  ui: 'the app UI update',
  desktop: 'the Desktop release',
};

const SOURCE_GUIDANCE: Readonly<Record<Exclude<ReleaseSource, 'hub'>, string>> = {
  provided: 'Build it on a dev machine and provide that build to the Hub instead.',
  github: 'Publish it as a GitHub release for the Hub to download instead.',
};

const HUB_NON_BUILD = z.object({ action: z.enum(['recover', 'rollback', 'keep']) });
const HUB_RELEASE = z.object({ action: z.literal('hub'), source: RELEASE_SOURCE.optional() });
const PUBLICATION_STATUS = z.strictObject({ runId: z.uuid() });
const PUBLICATION_ACTION = z.object({
  input: z.object({ action: z.enum(['app', 'ui', 'desktop']) }),
});

export function hubBuildRefusal(layout: HubLayout, artifact: PipelineComponent): string | null {
  const source = buildSourceOf(layout, artifact);
  if (source === 'hub') return null;
  return `The Hub does not build ${ARTIFACT_NAMES[artifact]}: its build source is ${source}, not hub. ${SOURCE_GUIDANCE[source]}`;
}

export function requireHubBuild(layout: HubLayout, artifact: PipelineComponent): void {
  const refusal = hubBuildRefusal(layout, artifact);
  if (refusal !== null) throw new HubBuildRefusedError(refusal);
}

function builtArtifact(
  script: ConfiguredUpdateScript,
  layout: HubLayout,
  input: unknown,
): PipelineComponent | null {
  if (script === 'self-update-hub-command.ts') {
    if (HUB_NON_BUILD.safeParse(input).success) return null;
    const release = HUB_RELEASE.safeParse(input);
    if (!release.success) return 'hub';
    return (release.data.source ?? buildSourceOf(layout, 'hub')) === 'hub' ? 'hub' : null;
  }
  if (!BUILD_SCRIPTS.has(script) || PUBLICATION_STATUS.safeParse(input).success) return null;
  const publication = PUBLICATION_ACTION.safeParse(input);
  if (publication.success) return publication.data.input.action;
  return script === 'self-update-desktop-command.ts' ? 'desktop' : 'app';
}

export class UpdateBusyError extends Error {
  override readonly name = 'UpdateBusyError';
}

export class UpdateCommandError extends Error {
  override readonly name = 'UpdateCommandError';
}

interface Child {
  readonly code: number | null;
  readonly stdout: string;
}

function runChild(
  executable: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly stderr: number | 'ignore' },
): Promise<Child> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', options.stderr],
    });
    const chunks: Buffer[] = [];
    if (child.stdout === null) {
      child.kill();
      reject(new Error(`${executable} started without an output pipe`));
      return;
    }
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function logTail(file: string, from: number): Promise<string> {
  const text = await readFile(file).then(
    (bytes) => bytes.subarray(from).toString('utf8'),
    (cause: unknown) => {
      if (isMissing(cause)) return '';
      throw cause;
    },
  );
  return text.trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n');
}

async function runLocked(
  root: string,
  locked: readonly string[],
  logFile: string | undefined,
): Promise<string> {
  const handle = logFile === undefined ? undefined : await open(logFile, 'a', 0o600);
  const from = handle === undefined ? 0 : (await handle.stat()).size;
  try {
    const { code, stdout } = await runChild('flock', locked, {
      cwd: root,
      stderr: handle?.fd ?? 'ignore',
    });
    if (code === 0) return stdout;
    if (code === LOCK_BUSY)
      throw new UpdateBusyError(
        'Another update is being prepared. Check update_control status before retrying.',
      );
    const tail = logFile === undefined ? '' : await logTail(logFile, from);
    throw new UpdateCommandError(
      `The update process failed with exit code ${String(code)}.${tail.length === 0 ? '' : `\n${tail}`}`,
    );
  } finally {
    await handle?.close();
  }
}

function runLogFile(work: string, input: unknown): string | undefined {
  const run = RUN_INPUT.safeParse(input);
  return run.success ? join(work, 'jobs', `${run.data}.log`) : undefined;
}

async function invoke(
  root: string,
  layout: HubLayout,
  invocation: {
    readonly script: ConfiguredUpdateScript;
    readonly args: string[];
    readonly input: unknown;
  },
): Promise<string> {
  const { script, args, input } = invocation;
  const full = [...TSX_IMPORT, ...args];
  if (!BUILD_SCRIPTS.has(script))
    return (await execute(process.execPath, full, { cwd: root, maxBuffer: OUTPUT_BYTES })).stdout;
  const work = layout.system.updates.selfUpdate;
  await mkdir(join(work, 'jobs'), { recursive: true, mode: 0o700 });
  const locked = [
    '--nonblock',
    '--conflict-exit-code',
    String(LOCK_BUSY),
    join(work, 'executor.lock'),
    process.execPath,
    ...full,
  ];
  return runLocked(root, locked, runLogFile(work, input));
}

export function requireUpdateSource(layout: HubLayout): {
  readonly root: string;
  readonly remote: string;
  readonly branch: string;
} {
  const source = findCheckoutSource(layout);
  if (source === undefined)
    throw new UpdateUnavailableError(
      'This hub has no update checkout. Only the hub build source needs one: on the hub machine, run tooling/configure-update-source.ts --checkout from a SmartEverything checkout.',
    );
  return { root: source.checkout, remote: source.remote, branch: source.branch };
}

export async function configuredUpdateEntry(
  layout: HubLayout,
  script: ConfiguredUpdateScript,
): Promise<{ readonly root: string; readonly entry: string }> {
  const { root } = requireUpdateSource(layout);
  const entry = join(root, 'tooling', script);
  try {
    await Promise.all([access(entry), access(join(root, 'node_modules', 'tsx', 'package.json'))]);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
    throw new UpdateUnavailableError('The update checkout is missing its tooling or dependencies.');
  }
  return { root, entry };
}

async function installedHubEntry(): Promise<{ readonly root: string; readonly entry: string }> {
  try {
    await access(INSTALLED_HUB_COMMAND);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
    throw new UpdateUnavailableError('The installed Hub service has no update/hub-command.mjs.');
  }
  return { root: dirname(INSTALLED_HUB_COMMAND), entry: INSTALLED_HUB_COMMAND };
}

export async function runConfiguredUpdateCommand(
  script: Exclude<
    ConfiguredUpdateScript,
    'hub-update-source-command.ts' | 'hub-update-tip-command.ts'
  >,
  layout: HubLayout,
  input: unknown,
  origin?: HubUpdateOrigin,
): Promise<Readonly<Record<string, unknown>>> {
  const artifact = builtArtifact(script, layout, input);
  if (artifact !== null) requireHubBuild(layout, artifact);
  if (process.platform !== HUB_UPDATE_HOST_PLATFORM)
    throw new UpdateUnavailableError(
      'Hub updates require a Linux hub with a systemd user service.',
    );
  const installed = artifact === null && script === 'self-update-hub-command.ts';
  const { root, entry } = installed
    ? await installedHubEntry()
    : await configuredUpdateEntry(layout, script);
  const args = [
    entry,
    layout.root,
    JSON.stringify(input),
    ...(origin === undefined ? [] : [JSON.stringify(origin)]),
  ];
  const stdout = installed
    ? (await execute(process.execPath, args, { cwd: root, maxBuffer: OUTPUT_BYTES })).stdout
    : await invoke(root, layout, { script, args, input });
  const last = stdout.trim().split('\n').at(-1);
  if (last === undefined || last.length === 0)
    throw new Error(
      'The update process exited without a result. Check update_control status before retrying.',
    );
  return REPLY.parse(JSON.parse(last));
}

export function runUpdateCommand(
  layout: HubLayout,
  input: unknown,
  origin?: HubUpdateOrigin,
): Promise<Readonly<Record<string, unknown>>> {
  return runConfiguredUpdateCommand('self-update-hub-command.ts', layout, input, origin);
}
