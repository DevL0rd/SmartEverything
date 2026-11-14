import { describe, expect, it } from 'vitest';
import { mountSummaryOf, setupOf } from './mount-summary';
import { LAPTOP, WORKSTATION, placement } from './placement-fixture';

describe('this computer’s mount summary', () => {
  const mine = placement(
    {},
    { cacheBytes: 300, pinnedBytes: 100, openFiles: 2, pendingUploads: 1 },
  );
  const second = placement(
    { id: 'e0000000-0000-4000-8000-000000000002', localPath: '/home/me/Shared' },
    {
      cacheBytes: 200,
      tier: 'basic',
      basicLimits: { maxFileBytes: null, wholeFileOpen: false, offline: false },
    },
  );
  const elsewhere = placement({ id: 'e0000000-0000-4000-8000-000000000003', deviceId: LAPTOP });
  const synced = placement({ id: 'e0000000-0000-4000-8000-000000000004', mode: 'synced' });

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

  it('points at the stopped mount so Again can restart it', () => {
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
});
