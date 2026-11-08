import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hubUpdateFinished, type HubUpdateRelease } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { readHubUpdate } from './recovery';

export const HUB_RELEASE_BUSY_EXIT = 75;
const HOLD_UNTIL_EOF = 'printf ready; exec cat >/dev/null';

export class HubReleaseLockError extends Error {
  override readonly name = 'HubReleaseLockError';

  constructor(
    readonly busy: boolean,
    detail: string,
  ) {
    super(busy ? detail : `Could not lock hub updates: ${detail}`);
  }
}

export async function withHubReleaseLock<T>(
  layout: HubLayout,
  wait: boolean,
  work: () => Promise<T>,
): Promise<T> {
  const directory = layout.system.updates.selfUpdate;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const flags = wait ? [] : ['--nonblock', '--conflict-exit-code', String(HUB_RELEASE_BUSY_EXIT)];
  const lock = spawn(
    'flock',
    [
      ...flags,
      '--exclusive',
      '--close',
      join(directory, 'hub-release.lock'),
      'sh',
      '-c',
      HOLD_UNTIL_EOF,
    ],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  const closed = once(lock, 'close').then(
    ([code]) => ({
      kind: 'closed' as const,
      busy: code === HUB_RELEASE_BUSY_EXIT,
      detail: `exit code ${String(code)}`,
    }),
    (error: unknown) => ({
      kind: 'closed' as const,
      busy: false,
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
  const ready = once(lock.stdout, 'data').then(() => ({ kind: 'ready' as const }));
  try {
    const state = await Promise.race([ready, closed]);
    if (state.kind === 'closed')
      throw new HubReleaseLockError(
        state.busy,
        state.busy ? 'Another hub update is in progress.' : state.detail,
      );
    return await work();
  } finally {
    lock.stdin.end();
    await closed;
  }
}

export function releaseNeedsRecovery(release: HubUpdateRelease): boolean {
  return !hubUpdateFinished(release) || release.phase === 'unrecoverable';
}

export async function withIdleHubRelease<T>(layout: HubLayout, work: () => Promise<T>): Promise<T> {
  return withHubReleaseLock(layout, false, async () => {
    const release = await readHubUpdate(layout);
    if (release !== null && releaseNeedsRecovery(release)) {
      throw new HubReleaseLockError(
        true,
        'The current hub update must finish or be recovered first.',
      );
    }
    return work();
  });
}
