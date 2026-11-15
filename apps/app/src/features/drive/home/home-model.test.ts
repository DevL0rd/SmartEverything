import { describe, expect, it } from 'vitest';
import { bytes, percent } from '../../../format/number';
import { MEMBER_ID, OTHER_ROOT_ID, ROOT_ID, personalRootRow, rootRow } from '../data/fixtures';
import { OFFLINE_TITLE, driveBannerOf, mayRescanOf } from './banner-model';
import {
  myDriveHeroOf,
  phaseLinesOf,
  ROOM,
  quotaFull,
  quotaGaugeOf,
  quotaLevelOf,
  rootKindsOf,
  sharedDriveHeroOf,
} from './hero-model';
import { driveUseOf } from './use-drive-use';

const GB = 1_000_000_000;
const KINDS = [
  { kind: 'image', items: 4, bytes: 3 * GB },
  { kind: 'video', items: 1, bytes: 5 * GB },
  { kind: 'audio', items: 0, bytes: 0 },
  { kind: 'document', items: 9, bytes: GB },
  { kind: 'other', items: 0, bytes: 0 },
] as const;
const MINE = { ...personalRootRow(ROOT_ID, MEMBER_ID), items: 12_480, bytes: 9 * GB };
const HOME = { ...rootRow(OTHER_ROOT_ID, 'ready'), items: 3, bytes: GB };

describe('drive hero', () => {
  it('splits My Drive by kind and weighs it against the quota', () => {
    const hero = myDriveHeroOf(MINE, KINDS, {
      used: 9 * GB,
      quota: { kind: 'limit', bytes: 18 * GB },
    });
    expect(hero.title).toBe('My Drive');
    expect(hero.line).toBe(`12,480 files · ${bytes(9 * GB)}`);
    expect(hero.segments.map((segment) => segment.label)).toEqual([
      'Images',
      'Videos',
      'Documents',
    ]);
    expect(hero.legend.map((entry) => entry.key)).toEqual(['image', 'video', 'document']);
    expect(hero.gauge).toEqual({
      text: `${bytes(9 * GB)} used of ${bytes(18 * GB)}`,
      note: 'Includes versions and trash',
      share: 0.5,
      colour: 'primary',
    });
  });

  it('says when there is no limit, turns critical when full and shows no gauge when unknown', () => {
    expect(quotaGaugeOf({ used: GB, quota: { kind: 'none' } })).toEqual({
      text: 'No limit set',
      note: null,
      share: null,
      colour: 'primary',
    });
    const full = { used: 2 * GB, quota: { kind: 'limit', bytes: 2 * GB } } as const;
    expect(quotaFull(full)).toBe(true);
    expect(quotaGaugeOf(full)?.colour).toBe('critical');
    expect(quotaFull({ used: 2 * GB, quota: { kind: 'none' } })).toBe(false);
    expect(quotaGaugeOf({ used: GB, quota: { kind: 'unknown' } })).toBeNull();
  });

  it('tells everyone the Shared Drive is everyone’s and the owner that it counts toward no quota', () => {
    const member = sharedDriveHeroOf(HOME, [], false);
    expect(member.line).toBe('Everyone in the home can open and edit');
    expect(member.caption).toBe(`3 files · ${bytes(GB)}`);
    expect(member.gauge).toBeNull();
    expect(sharedDriveHeroOf(HOME, [], true).caption).toBe(
      `3 files · ${bytes(GB)} · Counts toward no one’s quota`,
    );
  });

  it('reads the kinds of one drive from the stats', () => {
    const stats = { roots: [{ rootId: ROOT_ID, items: 1, folders: 0, bytes: 1, kinds: KINDS }] };
    expect(rootKindsOf(undefined, ROOT_ID)).toEqual([]);
    expect(rootKindsOf(stats, ROOT_ID)).toBe(KINDS);
  });

  it('says what the hub is doing to the drive', () => {
    expect(phaseLinesOf({ scan: { done: 4210, total: 12_480 } }, 'scanning')).toEqual([
      { phase: 'scan', text: 'Scanning · 4,210 of 12,480', share: 4210 / 12_480 },
    ]);
    expect(phaseLinesOf({ hash: { done: 1, total: 4 } }, 'ready')[0]?.text).toBe(
      'Finding duplicates · 1 of 4',
    );
    expect(phaseLinesOf(undefined, 'scanning')).toEqual([
      { phase: 'scan', text: 'Scanning', share: null },
    ]);
    expect(phaseLinesOf(undefined, 'ready')).toEqual([]);
  });

  it('counts versions and trash in the space used and reads the limit from the person’s own row', () => {
    const row = { profileId: MEMBER_ID, items: 1, folders: 0, live: 5, versions: 2, trash: 1 };
    expect(
      driveUseOf({ root: MINE, viewerId: MEMBER_ID, usage: [{ ...row, quota: null }] }),
    ).toEqual({ used: 8, quota: { kind: 'none' } });
    expect(driveUseOf({ root: MINE, viewerId: MEMBER_ID, usage: undefined })).toEqual({
      used: MINE.bytes,
      quota: { kind: 'unknown' },
    });
    expect(
      driveUseOf({ root: MINE, viewerId: MEMBER_ID, usage: [{ ...row, quota: 10 }] }).quota,
    ).toEqual({ kind: 'limit', bytes: 10 });
  });

  it('warns from the quota warning share and turns critical when full', () => {
    const limit = { kind: 'limit', bytes: 100 } as const;
    expect(quotaLevelOf({ used: 89, quota: limit })).toEqual({ kind: 'room' });
    expect(quotaLevelOf({ used: 92, quota: limit })).toEqual({ kind: 'near', share: 0.92 });
    expect(quotaLevelOf({ used: 100, quota: limit })).toEqual({ kind: 'full' });
    expect(quotaLevelOf({ used: 100, quota: { kind: 'none' } })).toEqual({ kind: 'room' });
    expect(quotaGaugeOf({ used: 92, quota: limit })?.colour).toBe('warning');
    expect(quotaGaugeOf({ used: 100, quota: limit })?.colour).toBe('critical');
  });
});

describe('drive banner', () => {
  const ready = { online: true, root: MINE, mayRescan: true, quota: ROOM };
  const full = { kind: 'full' } as const;

  it('puts offline first, then a broken drive, then a full one', () => {
    expect(driveBannerOf({ ...ready, online: false, quota: full })?.title).toBe(OFFLINE_TITLE);
    const broken = { ...MINE, state: 'error', stateReason: 'The marker is missing.' } as const;
    expect(driveBannerOf({ ...ready, root: broken, quota: full })).toMatchObject({
      tone: 'critical',
      title: 'Your drive can’t be read',
      body: 'The marker is missing.',
      action: 'rescan',
    });
    expect(driveBannerOf({ ...ready, quota: full })).toMatchObject({
      key: 'full',
      action: 'storage',
    });
    expect(driveBannerOf(ready)).toBeNull();
  });

  it('warns that the drive is nearly full with a link to Storage', () => {
    expect(driveBannerOf({ ...ready, quota: { kind: 'near', share: 0.92 } })).toMatchObject({
      key: 'near',
      tone: 'warning',
      title: `Your drive is ${percent(0.92)} full`,
      action: 'storage',
    });
  });

  it('offers Rescan only to the drive’s person, and the Shared Drive’s to the owner', () => {
    const slow = { ...HOME, state: 'unresponsive' } as const;
    expect(driveBannerOf({ ...ready, root: slow, mayRescan: false })).toMatchObject({
      tone: 'warning',
      title: 'The Shared Drive is not answering',
      action: null,
    });
    expect(mayRescanOf(MINE, MEMBER_ID, false)).toBe(true);
    expect(mayRescanOf(MINE, ROOT_ID, true)).toBe(false);
    expect(mayRescanOf(HOME, MEMBER_ID, false)).toBe(false);
    expect(mayRescanOf(HOME, MEMBER_ID, true)).toBe(true);
    expect(mayRescanOf(null, MEMBER_ID, true)).toBe(false);
  });
});
