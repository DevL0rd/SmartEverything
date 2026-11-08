import { describe, expect, it } from 'vitest';
import { DRIVE_PLACEMENT, type DrivePlacement } from '@smarteverything/domain';
import { OTHER_ROOT_ID, ROOT_ID } from '../../nas/data/fixtures';
import {
  mountPointsLineOf,
  mountTilesOf,
  repathBodyOf,
  setupCopyOf,
  setupOf,
  thisMountOf,
  tierWordOf,
  toggleBodiesOf,
} from './mount-model';
import { tierCardsOf } from './mount-tier-cards';

const HERE = 'b0000000-0000-4000-8000-000000000001';
const ELSEWHERE = 'b0000000-0000-4000-8000-000000000002';
const ME = 'c0000000-0000-4000-8000-000000000001';
const AT = '2026-11-07T10:00:00.000Z';

function placement(
  id: string,
  patch: Partial<DrivePlacement> = {},
  status: Partial<DrivePlacement['status']> = {},
): DrivePlacement {
  return DRIVE_PLACEMENT.parse({
    id,
    deviceId: HERE,
    rootId: ROOT_ID,
    folderItemId: null,
    mode: 'mounted',
    localPath: '/home/me/Drive/Photos',
    enabled: true,
    hold: null,
    createdBy: ME,
    createdAt: AT,
    status: {
      state: 'mounted',
      tier: 'full',
      basicLimits: null,
      readOnly: true,
      route: 'local',
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 0,
      pendingUploads: 0,
      reason: null,
      reportedAt: AT,
      ...status,
    },
    ...patch,
  });
}

const PHOTOS = placement(
  'e0000000-0000-4000-8000-000000000001',
  {},
  { cacheBytes: 1024, pinnedBytes: 512, openFiles: 2 },
);
const PROJECTS = placement(
  'e0000000-0000-4000-8000-000000000002',
  { rootId: OTHER_ROOT_ID, localPath: '/home/me/Drive/Projects' },
  { cacheBytes: 2048, openFiles: 1 },
);
const SYNCED = placement('e0000000-0000-4000-8000-000000000003', {
  mode: 'synced',
  rootId: OTHER_ROOT_ID,
  localPath: '/home/me/Projects',
});
const OTHER = placement('e0000000-0000-4000-8000-000000000004', { deviceId: ELSEWHERE });

const WRITE_BACK = { readOnly: false } as const;
const LINUX_BASIC = {
  tier: 'basic',
  readOnly: false,
  basicLimits: { maxFileBytes: null, wholeFileOpen: false, offline: false },
} as const;
const WINDOWS_BASIC = {
  tier: 'basic',
  readOnly: false,
  basicLimits: { maxFileBytes: 50 * 1024 * 1024, wholeFileOpen: false, offline: false },
} as const;

describe('thisMountOf', () => {
  it('adds up only this computer’s mounted folders', () => {
    const mount = thisMountOf(HERE, [PHOTOS, PROJECTS, SYNCED, OTHER]);
    expect(mount.placements.map((row) => row.id)).toEqual([PHOTOS.id, PROJECTS.id]);
    expect(mount).toMatchObject({
      enabled: true,
      tier: 'full',
      readOnly: true,
      stopped: null,
      cacheBytes: 3072,
      pinnedBytes: 512,
      openFiles: 3,
      upgrade: null,
    });
  });

  it('leaves paused folders out of the totals and is off when every one is paused', () => {
    const mount = thisMountOf(HERE, [{ ...PHOTOS, enabled: false }]);
    expect(mount.enabled).toBe(false);
    expect(mount.tier).toBeNull();
    expect(mount.cacheBytes).toBe(0);
  });

  it('finds a stopped mount with its reason', () => {
    const stopped = placement(PHOTOS.id, {}, { state: 'failed', reason: 'The helper exited' });
    const mount = thisMountOf(HERE, [stopped, PROJECTS]);
    expect(mount.stopped?.status.reason).toBe('The helper exited');
    expect(mount.line.tone).toBe('critical');
  });

  it('offers fuse3 on a Linux Basic mount and WinFsp on a Windows one', () => {
    expect(thisMountOf(HERE, [placement(PHOTOS.id, {}, LINUX_BASIC)]).upgrade).toBe('fuse3');
    expect(thisMountOf(HERE, [placement(PHOTOS.id, {}, WINDOWS_BASIC)]).upgrade).toBe('winfsp');
  });

  it('says Basic when any mounted folder fell back to it', () => {
    const basic = placement(PROJECTS.id, { rootId: OTHER_ROOT_ID }, LINUX_BASIC);
    expect(thisMountOf(HERE, [PHOTOS, basic]).tier).toBe('basic');
  });
});

describe('words', () => {
  it('names the tier with the read-only state of helper v1', () => {
    expect(tierWordOf('full', true)).toBe('Full drive · read only');
    expect(tierWordOf('full', false)).toBe('Full drive');
    expect(tierWordOf('basic', false)).toBe('Basic');
    expect(tierWordOf(null, false)).toBeNull();
  });

  it('shows read only in the writes tile until write-back', () => {
    const readOnly = mountTilesOf(thisMountOf(HERE, [PHOTOS]));
    expect(readOnly.map((tile) => [tile.label, tile.value])).toEqual([
      ['Cache', '1.0'],
      ['Open now', '2'],
      ['Writes', 'Read only'],
    ]);
    const waiting = placement(PHOTOS.id, {}, { ...WRITE_BACK, pendingUploads: 3 });
    expect(mountTilesOf(thisMountOf(HERE, [waiting]))[2]).toMatchObject({
      value: '3',
      caption: 'Waiting to upload',
      tone: 'info',
    });
  });

  it('names the mount point of one folder and counts several', () => {
    expect(mountPointsLineOf(thisMountOf(HERE, [PHOTOS]))).toBe('mounted at /home/me/Drive/Photos');
    expect(mountPointsLineOf(thisMountOf(HERE, [PHOTOS, PROJECTS]))).toBe('2 folders mounted');
    expect(mountPointsLineOf(thisMountOf(HERE, []))).toBeNull();
  });
});

describe('changes', () => {
  it('unmounts only the folders that are mounted and skips held ones', () => {
    const held = { ...PROJECTS, hold: 'no_access' as const };
    expect(toggleBodiesOf([PHOTOS, held], false)).toEqual([
      {
        deviceId: HERE,
        rootId: ROOT_ID,
        folderItemId: null,
        mode: 'mounted',
        localPath: '/home/me/Drive/Photos',
        enabled: false,
      },
    ]);
    expect(toggleBodiesOf([PHOTOS], true)).toEqual([]);
  });

  it('moves a folder to a new local path and keeps its switch', () => {
    expect(repathBodyOf({ ...SYNCED, enabled: false }, '/data/Projects')).toMatchObject({
      mode: 'synced',
      localPath: '/data/Projects',
      enabled: false,
    });
  });
});

describe('setup and tiers', () => {
  it('shows the steps for what is missing and macOS always', () => {
    const linux = thisMountOf(HERE, [placement(PHOTOS.id, {}, LINUX_BASIC)]);
    expect(setupOf('linux', linux)).toBe('fuse3');
    expect(setupOf('linux', thisMountOf(HERE, [PHOTOS]))).toBeNull();
    expect(setupOf('darwin', thisMountOf(HERE, []))).toBe('macos');
    expect(setupCopyOf('fuse3').steps.map((step) => step.state)).toEqual([
      'done',
      'active',
      'waiting',
    ]);
  });

  it('marks the tier in use and promises editing only with write-back', () => {
    const v1 = tierCardsOf('linux', thisMountOf(HERE, [PHOTOS]));
    expect(v1.map((card) => [card.title, card.inUse])).toEqual([
      ['Basic', false],
      ['Full drive', true],
    ]);
    expect(v1[1]?.features.at(-1)).toEqual({
      label: 'Editing on the drive arrives with write-back',
      kind: 'later',
    });
    const v2 = tierCardsOf('linux', thisMountOf(HERE, [placement(PHOTOS.id, {}, WRITE_BACK)]));
    expect(v2[1]?.features.at(-1)).toEqual({
      label: 'Editors, office files and git work in place',
      kind: 'yes',
    });
  });

  it('lists the macOS full drive as planned without checks', () => {
    const cards = tierCardsOf('darwin', thisMountOf(HERE, []));
    expect(cards[1]?.badge).toBe('Planned for macOS');
    expect(cards[1]?.features.every((feature) => feature.kind === 'later')).toBe(true);
  });

  it('carries the Basic limits on its card', () => {
    const cards = tierCardsOf(
      'win32',
      thisMountOf(HERE, [placement(PHOTOS.id, {}, WINDOWS_BASIC)]),
    );
    expect(cards[0]?.inUse).toBe(true);
    expect(cards[0]?.note).toContain('file limit');
  });
});
