import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const HOLD_UNTIL_EOF = 'printf ready; cat >/dev/null';

export class AppUpdateLockError extends Error {
  override readonly name = 'AppUpdateLockError';

  constructor(file: string, detail: string) {
    super(`Could not lock app updates at ${file}: ${detail}`);
  }
}

export async function withAppUpdateLock<T>(file: string, work: () => Promise<T>): Promise<T> {
  await mkdir(dirname(file), { recursive: true });
  const lock = spawn('flock', ['--exclusive', file, 'sh', '-c', HOLD_UNTIL_EOF], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const closed = once(lock, 'close').then(
    ([code]) => ({ kind: 'closed' as const, detail: `exit code ${String(code)}` }),
    (error: unknown) => ({
      kind: 'closed' as const,
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
  const ready = once(lock.stdout, 'data').then(() => ({ kind: 'ready' as const }));
  try {
    const state = await Promise.race([ready, closed]);
    if (state.kind === 'closed') throw new AppUpdateLockError(file, state.detail);
    return await work();
  } finally {
    lock.stdin.end();
    await closed;
  }
}
