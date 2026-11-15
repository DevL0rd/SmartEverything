import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import {
  mountOpenable,
  mountSummaryOf,
  offlineBodyOf,
  setupOf,
  uploadWaitOf,
} from './mount-summary';
import { LAPTOP, WORKSTATION, placement } from './placement-fixture';

describe('this computer’s mount summary', () => {
  const mine = placement(
    {},
    { cacheBytes: 300, pinnedBytes: 100, openFiles: 2, pendingUploads: 1 },
  );
  const second = placement(
    { id: 'e0000000-0000-4000-8000-000000000002', mountName: 'Shared' },
    {
      cacheBytes: 200,
      tier: 'basic',
      basicLimits: { maxFileBytes: null, wholeFileOpen: false, offline: false },
    },
  );
  const elsewhere = placement({ id: 'e0000000-0000-4000-8000-000000000003', deviceId: LAPTOP });
  const synced = placement({ id: 'e0000000-0000-4000-8000-000000000004', mode: 'synced' });

  it('names the worst state of the mounts and the route they use', () => {
    const remote = placement({}, { route: 'remote' });
    const local = placement({ id: 'e0000000-0000-4000-8000-000000000002' }, { route: 'local' });
    expect(mountSummaryOf(WORKSTATION, [remote, local])).toMatchObject({
      health: 'ready',
      route: 'remote',
    });
    const offline = placement({ id: 'e0000000-0000-4000-8000-000000000006' }, { state: 'offline' });
    expect(mountSummaryOf(WORKSTATION, [local, offline]).health).toBe('offline');
    const failed = placement({ id: 'e0000000-0000-4000-8000-000000000007' }, { state: 'failed' });
    expect(mountSummaryOf(WORKSTATION, [offline, failed]).health).toBe('stopped');
    const starting = placement({}, { state: 'starting' });
    expect(mountSummaryOf(WORKSTATION, [starting]).health).toBe('starting');
    const blocked = placement({}, { state: 'blocked' });
    expect(mountSummaryOf(WORKSTATION, [offline, blocked]).health).toBe('blocked');
    expect(mountSummaryOf(WORKSTATION, [placement({ enabled: false })]).health).toBe('off');
    expect(mountSummaryOf(WORKSTATION, [placement()]).route).toBeNull();
  });

  it('opens only a running mount in the file manager', () => {
    const at = { mountPoint: '/home/me/SmartEverything/Drive' };
    const openable = (
      patch: Parameters<typeof placement>[0],
      status: Parameters<typeof placement>[1],
    ): boolean => mountOpenable(placement(patch, { ...at, ...status }));
    expect(openable({}, {})).toBe(true);
    expect(openable({}, { state: 'offline' })).toBe(true);
    expect(openable({}, { state: 'failed' })).toBe(false);
    expect(openable({ enabled: false }, {})).toBe(false);
    expect(openable({ hold: 'trashed' }, {})).toBe(false);
    expect(mountOpenable(placement())).toBe(false);
  });

  it('says when waiting uploads go out', () => {
    expect(uploadWaitOf('ready')).toBe('Uploading now');
    expect(uploadWaitOf('offline')).toBe('Uploads when the Hub is back');
    expect(uploadWaitOf('stopped')).toBe('Uploads once the mount runs again');
  });

  it('tells what still works while the Hub is out of reach', () => {
    const away = (status: Parameters<typeof placement>[1]): string =>
      offlineBodyOf(mountSummaryOf(WORKSTATION, [placement({}, { state: 'offline', ...status })]));
    expect(away({})).toBe(
      'Files already cached still open. Changes wait on this computer and upload when it is back.',
    );
    expect(away({ pinnedBytes: 2e9, pendingUploads: 1 })).toBe(
      `${bytes(2e9)} kept offline still opens. 1 change waits to upload when it is back.`,
    );
    expect(away({ pendingUploads: 3 })).toContain('3 changes wait to upload');
  });

  it('adds up the mounts of this computer only and keeps the weakest tier', () => {
    const summary = mountSummaryOf(WORKSTATION, [mine, second, elsewhere, synced]);
    expect(summary.placements).toHaveLength(2);
    expect(summary).toMatchObject({
      active: true,
      tier: 'basic',
      cacheBytes: 500,
      pinnedBytes: 100,
      openFiles: 2,
      pendingUploads: 1,
      upgrade: 'fuse3',
    });
  });

  it('points at the stopped mount so Start again can restart it', () => {
    const failed = placement({}, { state: 'failed', reason: 'helper stopped' });
    expect(mountSummaryOf(WORKSTATION, [failed]).stopped?.id).toBe(failed.id);
  });

  it('asks Linux for fuse3 when it is missing and explains macOS', () => {
    const summary = mountSummaryOf(WORKSTATION, []);
    const missing = {
      available: false,
      missing: ['fusermount3'],
      command: null,
      reason: 'x',
    } as const;
    expect(setupOf('linux', missing, summary)).toBe('fuse3');
    expect(setupOf('linux', { available: true }, summary)).toBeNull();
    expect(setupOf('darwin', null, summary)).toBe('macos');
  });

  it('shows no setup steps while a full mount is healthy', () => {
    const healthy = mountSummaryOf(WORKSTATION, [placement()]);
    const missing = {
      available: false,
      missing: ['fusermount3'],
      command: null,
      reason: 'x',
    } as const;
    expect(setupOf('linux', missing, healthy)).toBeNull();
    expect(setupOf('darwin', null, healthy)).toBeNull();
    const starting = mountSummaryOf(WORKSTATION, [placement({}, { state: 'starting' })]);
    expect(setupOf('darwin', null, starting)).toBeNull();
  });
});
