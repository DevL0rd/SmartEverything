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

  it('carries the missing FUSE parts and the first run offer', () => {
    const state = DESKTOP_DRIVE_STATE.parse({
      mount: null,
      sync: null,
      fuse: {
        available: false,
        missing: ['fusermount3'],
        command: null,
        reason: 'fuse3 is missing',
      },
      firstRun: { pending: true, defaultParent: '/home/me/SmartEverything' },
      cache: DEFAULT_DESKTOP_DRIVE_CACHE,
    });
    expect(state.firstRun.pending).toBe(true);
    expect(DESKTOP_DRIVE_STATE.safeParse({ ...state, extra: 1 }).success).toBe(false);
  });
});
