import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  ApiError,
  HUB_UPDATE_ACCEPTANCE,
  HUB_UPDATE_COMMIT,
  HUB_REQUEST_TIMEOUT_MS,
  HUB_UPDATE_SOURCE_CHECK,
  HUB_UPDATE_SOURCE_SAVED,
  type HubUpdateAcceptance,
  type HubUpdateSourceStart,
  type HubUpdateSourceSave,
  type HubUpdateSourceSaved,
  type HubUpdateSourceCheck,
} from '@smarteverything/domain';
import {
  configuredUpdateEntry,
  runConfiguredUpdateCommand,
  runUpdateCommand,
  UpdateBusyError,
  UpdateUnavailableError,
} from './command';
import type { HubLayout } from '../data-layout';
import { readHubUpdate } from './recovery';

const execute = promisify(execFile);
const SOURCE_RESPONSE_MARGIN_MS = 1000;
const SOURCE_CHECK_TIMEOUT_MS = HUB_REQUEST_TIMEOUT_MS - SOURCE_RESPONSE_MARGIN_MS;

async function runSourceCommand(
  { entry, root: cwd }: Awaited<ReturnType<typeof configuredUpdateEntry>>,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<unknown> {
  const seconds = `${String(SOURCE_CHECK_TIMEOUT_MS / 1000)}s`;
  const program = [process.execPath, '--import', 'tsx', entry, ...args];
  const { stdout } =
    process.platform === 'linux'
      ? await execute('timeout', ['--signal=KILL', seconds, ...program], { cwd, signal })
      : await execute(process.execPath, program.slice(1), {
          cwd,
          signal,
          timeout: SOURCE_CHECK_TIMEOUT_MS,
          killSignal: 'SIGKILL',
        });
  return JSON.parse(stdout);
}

async function runSourceCheck(
  command: Awaited<ReturnType<typeof configuredUpdateEntry>>,
  request: {
    readonly layout: HubLayout;
    readonly ownerClient: string | undefined;
    readonly runningTip: string | undefined;
  },
): Promise<HubUpdateSourceCheck> {
  await mkdir(request.layout.tmp, { recursive: true, mode: 0o700 });
  const comparisonFolder = await mkdtemp(join(request.layout.tmp, 'source-check-'));
  try {
    const { layout, ...rest } = request;
    const args = [JSON.stringify({ ...rest, data: layout.root, comparisonFolder })];
    return HUB_UPDATE_SOURCE_CHECK.parse(await runSourceCommand(command, args));
  } finally {
    await rm(comparisonFolder, { recursive: true, force: true });
  }
}

export async function configuredSourceTip(layout: HubLayout, signal: AbortSignal): Promise<string> {
  try {
    const command = await configuredUpdateEntry(layout, 'hub-update-tip-command.ts');
    return HUB_UPDATE_COMMIT.parse(await runSourceCommand(command, [layout.root], signal));
  } catch (cause) {
    throw sourceCheckError(cause);
  }
}

function sourceCheckError(cause: unknown): ApiError {
  return new ApiError(
    'conflict',
    cause instanceof UpdateUnavailableError
      ? cause.message
      : 'Could not check the configured Git branch. Check the hub source settings and Git access.',
  );
}

export async function configuredSourceCheck(
  layout: HubLayout,
  ownerClient?: string,
  bootRunId?: string,
): Promise<HubUpdateSourceCheck> {
  try {
    const command = await configuredUpdateEntry(layout, 'hub-update-source-command.ts');
    const bootRelease = bootRunId === undefined ? null : await readHubUpdate(layout, bootRunId);
    return await runSourceCheck(command, {
      layout,
      ownerClient,
      runningTip: bootRelease?.remoteTip,
    });
  } catch (cause) {
    throw sourceCheckError(cause);
  }
}

export async function startConfiguredSource(
  layout: HubLayout,
  ownerClient: string,
  input: HubUpdateSourceStart,
): Promise<HubUpdateAcceptance> {
  try {
    return HUB_UPDATE_ACCEPTANCE.parse(
      await runUpdateCommand(layout, { action: 'remote', ownerClient, ...input }),
    );
  } catch (cause) {
    if (cause instanceof UpdateBusyError)
      throw new ApiError('conflict', 'Another hub update is already running.');
    if (cause instanceof UpdateUnavailableError) throw new ApiError('conflict', cause.message);
    throw cause;
  }
}

const SAVE_ERROR = z.strictObject({ error: z.string() });

export async function saveConfiguredSource(
  layout: HubLayout,
  ownerClient: string,
  input: HubUpdateSourceSave,
): Promise<HubUpdateSourceSaved> {
  try {
    const reply = await runConfiguredUpdateCommand('hub-update-save-command.ts', layout, {
      ...input,
      ownerClient,
    });
    const failure = SAVE_ERROR.safeParse(reply);
    if (failure.success) throw new ApiError('conflict', failure.data.error);
    return HUB_UPDATE_SOURCE_SAVED.parse(reply);
  } catch (cause) {
    if (cause instanceof UpdateUnavailableError) throw new ApiError('conflict', cause.message);
    throw cause;
  }
}
