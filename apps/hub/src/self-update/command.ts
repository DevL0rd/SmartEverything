import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { env } from 'node:process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { HUB_UPDATE_HOST_PLATFORM, type HubUpdateOrigin } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';

const execute = promisify(execFile);
const REPLY = z.record(z.string(), z.unknown());
const OUTPUT_BYTES = 1024 * 1024;
const LOCK_BUSY = 75;
const CHECKOUT_PATH = z.string().refine(isAbsolute);
const EXECUTION_ERROR = z.looseObject({ code: z.number() });

type ConfiguredUpdateScript =
  | 'self-update-hub-command.ts'
  | 'self-update-app-command.ts'
  | 'hub-update-source-command.ts'
  | 'hub-update-tip-command.ts'
  | 'hub-update-save-command.ts';

export class UpdateUnavailableError extends Error {
  override readonly name = 'UpdateUnavailableError';
}

export class UpdateBusyError extends Error {
  override readonly name = 'UpdateBusyError';
}

async function invoke(
  root: string,
  layout: HubLayout,
  invocation: { readonly executable: string; readonly args: string[]; readonly app: boolean },
): Promise<string> {
  const { executable, args, app } = invocation;
  const options = { cwd: root, maxBuffer: OUTPUT_BYTES };
  try {
    if (!app) return (await execute(executable, args, options)).stdout;
    const work = layout.system.updates.selfUpdate;
    await mkdir(work, { recursive: true, mode: 0o700 });
    const { stdout } = await execute(
      'flock',
      [
        '--nonblock',
        '--conflict-exit-code',
        String(LOCK_BUSY),
        join(work, 'executor.lock'),
        executable,
        ...args,
      ],
      options,
    );
    return stdout;
  } catch (cause) {
    const error = EXECUTION_ERROR.safeParse(cause);
    if (error.success && error.data.code === LOCK_BUSY)
      throw new UpdateBusyError(
        'Another update is being prepared. Check self_update status before retrying.',
      );
    throw cause;
  }
}

export async function configuredUpdateEntry(script: ConfiguredUpdateScript): Promise<{
  readonly root: string;
  readonly entry: string;
  readonly tsx: string;
}> {
  const checkout = CHECKOUT_PATH.safeParse(env['SMARTEVERYTHING_SELF_UPDATE_ROOT']);
  if (!checkout.success)
    throw new UpdateUnavailableError(
      'This hub has no update checkout configured. Set SMARTEVERYTHING_SELF_UPDATE_ROOT to the absolute path of the SmartEverything checkout.',
    );
  const root = checkout.data;
  const entry = join(root, 'tooling', script);
  const tsx = join(root, 'node_modules', '.bin', 'tsx');
  try {
    await Promise.all([access(entry), access(tsx)]);
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
    throw new UpdateUnavailableError('The update checkout is missing its tooling or dependencies.');
  }
  return { root, entry, tsx };
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
  const { root, entry, tsx } = await configuredUpdateEntry(script);
  const args = [
    entry,
    layout.root,
    JSON.stringify(input),
    ...(origin === undefined ? [] : [JSON.stringify(origin)]),
  ];
  const stdout = await invoke(root, layout, {
    executable: tsx,
    args,
    app: script === 'self-update-app-command.ts',
  });
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
