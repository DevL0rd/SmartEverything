import { describe, expect, it, vi } from 'vitest';
import { activateFlags, readDeveloperFlags, watchDeveloperFlags } from './flags';
import { allOff, resolveFlags } from './toggles';

describe('developer flags', () => {
  it('reads the latest snapshot after every activation', () => {
    activateFlags(allOff());
    const before = readDeveloperFlags();
    activateFlags({ ...allOff(), 'perf.sampling': true });
    expect(readDeveloperFlags()['perf.sampling']).toBe(true);
    expect(before['perf.sampling']).toBe(false);
    activateFlags(allOff());
    expect(readDeveloperFlags()['perf.sampling']).toBe(false);
  });

  it('tells the watchers of every activation and stops after unwatching', () => {
    const listener = vi.fn();
    const stop = watchDeveloperFlags(listener);
    activateFlags({ ...allOff(), 'perf.sampling': true });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    activateFlags(allOff());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reads two snapshots of the same flags alike and a changed snapshot as different', () => {
    activateFlags(allOff());
    const first = readDeveloperFlags();
    activateFlags(allOff());
    expect(readDeveloperFlags()).toEqual(first);
    activateFlags(resolveFlags({ 'perf.sampling': true }, true));
    expect(readDeveloperFlags()['perf.sampling']).toBe(true);
    expect(readDeveloperFlags()).not.toEqual(first);
  });
});
