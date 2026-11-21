import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_DRIVE_CACHE,
  DEFAULT_DESKTOP_DRIVE_TUNING,
  DESKTOP_DRIVE_TUNING,
  DESKTOP_DRIVE_TUNING_STATE,
  DESKTOP_DRIVE_CACHE,
  DESKTOP_DRIVE_COMMAND,
  DESKTOP_DRIVE_STATE,
  syncingProgress,
  syncingWords,
} from '../src/desktop-drive';

const UNTUNED = { saved: DEFAULT_DESKTOP_DRIVE_TUNING, applied: [], limits: null };

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
      tuning: UNTUNED,
    });
    expect(state.fuse.available).toBe(false);
    expect(DESKTOP_DRIVE_STATE.safeParse({ ...state, extra: 1 }).success).toBe(false);
  });

  it('lists where each folder is mounted', () => {
    const mount = {
      status: 'Mounted',
      mounted: true,
      points: [{ placementId: 'p', point: '/run/user/1000/smarteverything/Photos' }],
      syncing: null,
    };
    const state = {
      mount,
      sync: null,
      fuse: { available: true },
      cache: DEFAULT_DESKTOP_DRIVE_CACHE,
      tuning: UNTUNED,
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

  it('defaults the tuning to what NFS, SMB3 and rclone really use', () => {
    expect(DESKTOP_DRIVE_TUNING.parse(DEFAULT_DESKTOP_DRIVE_TUNING)).toMatchObject({
      maxBackground: 64,
      congestionThreshold: 'follow',
      maxRequestBytes: 1_048_576,
      kernelReadaheadBytes: 131_072,
      readAheadBytes: 16_777_216,
      readdirPlus: 'auto',
      entrySeconds: 'changed',
      closeWaitsForUpload: true,
      fsyncWaitsForHub: true,
      uploadFiles: 4,
      uploadFramesInFlight: 64,
      pingSeconds: 10,
      deadAfterSeconds: 30,
      prefetchSmallFiles: false,
    });
  });

  it('refuses tuning values outside the real bounds', () => {
    const bad = (change: object): boolean =>
      DESKTOP_DRIVE_TUNING.safeParse({ ...DEFAULT_DESKTOP_DRIVE_TUNING, ...change }).success;
    expect(bad({ maxBackground: 65536 })).toBe(false);
    expect(bad({ maxBackground: 0 })).toBe(false);
    expect(bad({ bulkFrameBytes: 1_048_577 })).toBe(false);
    expect(bad({ deadAfterSeconds: 10 })).toBe(false);
    expect(bad({ readdirPlus: 'sometimes' })).toBe(false);
    expect(bad({ attrSeconds: -1 })).toBe(false);
    expect(bad({ readAheadBytes: 0, attrSeconds: 60, congestionThreshold: 48 })).toBe(true);
  });

  it('carries the tuning command and the applied tuning per mount', () => {
    expect(
      DESKTOP_DRIVE_COMMAND.parse({ kind: 'tuning', tuning: DEFAULT_DESKTOP_DRIVE_TUNING }).kind,
    ).toBe('tuning');
    expect(
      DESKTOP_DRIVE_TUNING_STATE.parse({
        saved: DEFAULT_DESKTOP_DRIVE_TUNING,
        applied: [{ placementId: 'p', tuning: DEFAULT_DESKTOP_DRIVE_TUNING }],
        limits: {
          platform: 'linux',
          pageBytes: 4096,
          maxUserBackground: 20793,
          maxUserCongestionThreshold: 15594,
          maxRequestBytes: 1_048_576,
          kernelReadaheadOfferBytes: 131_072,
        },
      }).applied,
    ).toHaveLength(1);
  });
});

describe('drive mount syncing', () => {
  it('names what is still on its way to the Hub', () => {
    expect(
      syncingWords({ files: 1, bytes: 0, sentFiles: 0, sentBytes: 0, bytesPerSecond: null }),
    ).toBe('Syncing 1 file to the Hub');
    expect(
      syncingWords({ files: 12, bytes: 3000, sentFiles: 0, sentBytes: 0, bytesPerSecond: null }),
    ).toBe('Syncing 12 files (3.0 kB) to the Hub');
  });

  it('measures progress by bytes, and by files when nothing has bytes', () => {
    expect(
      syncingProgress({ files: 2, bytes: 300, sentFiles: 1, sentBytes: 100, bytesPerSecond: null }),
    ).toBe(0.25);
    expect(
      syncingProgress({ files: 3, bytes: 0, sentFiles: 1, sentBytes: 0, bytesPerSecond: null }),
    ).toBe(0.25);
  });

  it('never reports a sync with no file left', () => {
    const mount = { status: 'Mounted', mounted: true, points: [] };
    const state = {
      sync: null,
      fuse: { available: true },
      cache: DEFAULT_DESKTOP_DRIVE_CACHE,
      tuning: UNTUNED,
    };
    const syncing = { files: 0, bytes: 0, sentFiles: 4, sentBytes: 10, bytesPerSecond: null };
    expect(DESKTOP_DRIVE_STATE.safeParse({ ...state, mount: { ...mount, syncing } }).success).toBe(
      false,
    );
  });
});
