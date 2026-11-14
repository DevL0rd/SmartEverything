import { execFile, spawn } from 'node:child_process';
import { access, mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { HUB_UPDATE_HOST_PLATFORM, type HubUpdateOrigin } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { findUpdateSource } from './update-source';

const execute = promisify(execFile);
const REPLY = z.record(z.string(), z.unknown());
const OUTPUT_BYTES = 1024 * 1024;
const LOCK_BUSY = 75;
const LOG_TAIL_LINES = 20;
const RUN_INPUT = z.object({ input: z.object({ runId: z.uuid() }) });
const TSX_IMPORT = ['--import', 'tsx'];

type ConfiguredUpdateScript =
  | 'self-update-hub-command.ts'
  | 'self-update-app-command.ts'
  | 'self-update-desktop-command.ts'
  | 'hub-update-source-command.ts'
  | 'hub-update-tip-command.ts'
  | 'hub-update-save-command.ts';

type BuildScript = 'self-update-app-command.ts' | 'self-update-desktop-command.ts';

const BUILD_SCRIPTS: ReadonlySet<ConfiguredUpdateScript> = new Set<BuildScript>([
  'self-update-app-command.ts',
  'self-update-desktop-command.ts',
]);

export class UpdateUnavailableError extends Error {
  override readonly name = 'UpdateUnavailableError';
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
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function logTail(file: string): Promise<string> {
  const text = await readFile(file, 'utf8').catch((cause: unknown) => {
    if (isMissing(cause)) return '';
    throw cause;
  });
  return text.trimEnd().split('\n').slice(-LOG_TAIL_LINES).join('\n');
}

async function runLocked(
  root: string,
  locked: readonly string[],
  logFile: string | undefined,
): Promise<string> {
  const handle = logFile === undefined ? undefined : await open(logFile, 'a', 0o600);
  try {
    const { code, stdout } = await runChild('flock', locked, {
      cwd: root,
      stderr: handle?.fd ?? 'ignore',
    });
    if (code === 0) return stdout;
    if (code === LOCK_BUSY)
      throw new UpdateBusyError(
        'Another update is being prepared. Check self_update status before retrying.',
      );
    const tail = logFile === undefined ? '' : await logTail(logFile);
    throw new UpdateCommandError(
      `The update process failed with exit code ${String(code)}.${tail.length === 0 ? '' : `\n${tail}`}`,
    );
  } finally {
    await handle?.close();
  }
}

function runLogFile(work: string, input: unknown): string | undefined {
  const run = RUN_INPUT.safeParse(input);
  return run.success ? join(work, 'jobs', `${run.data.input.runId}.log`) : undefined;
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
  const source = findUpdateSource(layout);
  if (source === undefined)
    throw new UpdateUnavailableError(
      'This hub has no update source configured. On the hub machine, run tooling/configure-update-source.ts from the SmartEverything checkout.',
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

export async function runConfiguredUpdateCommand(
  script: Exclude<
    ConfiguredUpdateScript,
    'hub-update-source-command.ts' | 'hub-update-tip-command.ts'
  >,
  layout: HubLayout,
  input: unknown,
  origin?: HubUpdateOrigin,
): Promise<Readonly<Record<string, unknown>>> {
  if (process.platform !== HUB_UPDATE_HOST_PLATFORM)
    throw new UpdateUnavailableError(
      'Hub updates require a Linux hub with a systemd user service.',
    );
  const { root, entry } = await configuredUpdateEntry(layout, script);
  const args = [
    entry,
    layout.root,
    JSON.stringify(input),
    ...(origin === undefined ? [] : [JSON.stringify(origin)]),
  ];
  const stdout = await invoke(root, layout, { script, args, input });
  const last = stdout.trim().split('\n').at(-1);
  if (last === undefined || last.length === 0)
    throw new Error(
      'The update process exited without a result. Check self_update status before retrying.',
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
