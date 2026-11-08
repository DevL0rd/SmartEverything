import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { testLayout } from '../../apps/hub/test/support/test-layout.ts';
import { withHubReleaseLock } from '../../apps/hub/src/self-update/release-lock.ts';

describe.skipIf(process.platform !== 'linux')('hub release lock', () => {
  it('rejects concurrent manual work and hands the lock to the waiting watchdog', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'hub-release-lock-'));
    const data = await testLayout(join(scratch, 'data'));
    const events = new EventEmitter();
    const ready = once(events, 'ready');
    const release = once(events, 'release');
    const first = withHubReleaseLock(data, false, () => {
      events.emit('ready');
      return release;
    });
    try {
      await Promise.race([ready, first]);
      await expect(withHubReleaseLock(data, false, () => Promise.resolve())).rejects.toMatchObject({
        name: 'HubReleaseLockError',
        busy: true,
      });
      const watchdog = withHubReleaseLock(data, true, () => Promise.resolve('acquired'));
      events.emit('release');
      await expect(watchdog).resolves.toBe('acquired');
    } finally {
      events.emit('release');
      try {
        await first;
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    }
  });
});
