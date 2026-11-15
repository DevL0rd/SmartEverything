import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_COMMAND,
  DESKTOP_DRIVE_STATE,
} from '../src/desktop-drive';

describe('desktop drive bridge contract', () => {
  it('keeps the cache an hour, cleans every minute and sets no size or free space floor', () => {
    expect(DESKTOP_DRIVE_CACHE.parse(DEFAULT_DESKTOP_DRIVE_CACHE)).toEqual({
      maxAgeSeconds: 3600,
      maxBytes: null,
      minFreeBytes: null,
      cleanupSeconds: 60,
    });
  });

  it('refuses a zero age, a zero interval and unknown commands', () => {
    expect(
      DESKTOP_DRIVE_CACHE.safeParse({ ...DEFAULT_DESKTOP_DRIVE_CACHE, maxAgeSeconds: 0 }).success,
    ).toBe(false);
    expect(
      DESKTOP_DRIVE_CACHE.safeParse({ ...DEFAULT_DESKTOP_DRIVE_CACHE, cleanupSeconds: 0 }).success,
    ).toBe(false);
    expect(DESKTOP_DRIVE_COMMAND.safeParse({ kind: 'limit', mount: 'm', bytes: 1 }).success).toBe(
      false,
    );
    expect(
      DESKTOP_DRIVE_COMMAND.parse({ kind: 'cache', cache: DEFAULT_DESKTOP_DRIVE_CACHE }).kind,
    ).toBe('cache');
  });

  it('carries the missing FUSE parts', () => {
    const state = DESKTOP_DRIVE_STATE.parse({
      mount: null,
      sync: null,
      fuse: {
        available: false,
        missing: ['fusermount3'],
        command: null,
        reason: 'fuse3 is missing',
      },
      cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    });
    expect(state.fuse.available).toBe(false);
    expect(DESKTOP_DRIVE_STATE.safeParse({ ...state, extra: 1 }).success).toBe(false);
  });

  it('lists where each folder is mounted', () => {
    const mount = {
      status: 'Mounted',
      mounted: true,
      points: [{ placementId: 'p', point: '/run/user/1000/smarteverything/Photos' }],
    };
    const state = {
      mount,
      sync: null,
      fuse: { available: true },
      cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    };
    expect(DESKTOP_DRIVE_STATE.parse(state).mount?.points).toHaveLength(1);
    expect(
      DESKTOP_DRIVE_STATE.safeParse({ ...state, mount: { status: 'Mounted', mounted: true } })
        .success,
    ).toBe(false);
    expect(
      DESKTOP_DRIVE_STATE.safeParse({
        ...state,
        mount: { ...mount, points: [{ placementId: 'p', point: '' }] },
      }).success,
    ).toBe(false);
  });
});
