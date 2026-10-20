import { describe, expect, it } from 'vitest';
import { blockingStateOf, playerStateOf, type CameraCondition } from './player-state';

const CONDITION: CameraCondition = {
  online: true,
  lastSeen: '2026-10-18T11:00:00.000Z',
  privacy: false,
  reach: null,
};

describe('blockingStateOf', () => {
  it('lets a camera the hub can reach start its stream', () => {
    expect(blockingStateOf(CONDITION)).toBeNull();
    expect(blockingStateOf({ ...CONDITION, reach: 'open' })).toBeNull();
  });

  it('shows a camera the hub found unreachable as offline, so no tile opens a stream to it', () => {
    expect(blockingStateOf({ ...CONDITION, reach: 'unreachable' })).toStrictEqual({
      kind: 'offline',
      lastSeen: '2026-10-18T11:00:00.000Z',
    });
  });

  it('shows a camera the firewall is blocking as blocked by the firewall', () => {
    expect(blockingStateOf({ ...CONDITION, reach: 'blocked' })).toStrictEqual({
      kind: 'blockedByFirewall',
    });
  });

  it('starts a stream again as soon as the hub reports the camera reachable', () => {
    const down = { ...CONDITION, reach: 'unreachable' } as const;
    const recovered = { ...down, reach: 'open' } as const;
    expect(blockingStateOf(down)).not.toBeNull();
    expect(blockingStateOf(recovered)).toBeNull();
  });
});

describe('playerStateOf for a camera the hub marked down', () => {
  it('stays offline whatever a stale session still reports', () => {
    expect(
      playerStateOf({
        ...CONDITION,
        reach: 'unreachable',
        streamable: true,
        phase: { kind: 'reaching' },
        video: 'waiting',
      }).kind,
    ).toBe('offline');
  });
});
