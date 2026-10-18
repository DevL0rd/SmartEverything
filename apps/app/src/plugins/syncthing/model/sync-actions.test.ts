import { describe, expect, it } from 'vitest';
import { pauseFailure, resolveFailure, unavailableReason } from './sync-actions';

describe('pauseFailure', () => {
  it('names what did not pause or resume', () => {
    expect(pauseFailure(true, null)).toBe('Syncing didn’t pause');
    expect(pauseFailure(false, null)).toBe('Syncing didn’t resume');
    expect(pauseFailure(true, 'Photos')).toBe('Photos didn’t pause');
    expect(pauseFailure(false, 'Photos')).toBe('Photos didn’t resume');
  });
});

describe('resolveFailure', () => {
  it('names the folder in both outcomes', () => {
    expect(resolveFailure('override', 'Photos')).toBe('Photos wasn’t overwritten');
    expect(resolveFailure('revert', 'Photos')).toBe('Local changes in Photos weren’t undone');
  });
});

describe('unavailableReason', () => {
  it('lets actions run only while Syncthing is online', () => {
    expect(unavailableReason({ state: 'online' })).toBeNull();
    expect(unavailableReason({ state: 'connecting' })).toBe('Connecting to Syncthing…');
    expect(unavailableReason({ state: 'key_rejected' })).toBe('Can’t reach Syncthing right now');
    expect(
      unavailableReason({ state: 'unreachable', reason: 'x', since: '2026-10-17T08:00:00+07:00' }),
    ).toBe('Can’t reach Syncthing right now');
  });
});
