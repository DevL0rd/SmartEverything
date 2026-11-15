import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveItem } from '@smarteverything/domain';
import type { ToastInput } from '../../../components/toast-store';
import { documentFixture } from '../data/fixtures';

interface Seen {
  restored: (readonly [string, string])[];
  toasts: ToastInput[];
  fail: boolean;
}

const seen = vi.hoisted((): Seen => ({ restored: [], toasts: [], fail: false }));

vi.mock('../../../api/drive', () => ({
  restoreDriveVersion: (itemId: string, versionId: string): Promise<{ readonly rev: number }> => {
    seen.restored.push([itemId, versionId]);
    return seen.fail ? Promise.reject(new Error('hub said no')) : Promise.resolve({ rev: 5 });
  },
}));
vi.mock('../../../components/toast-store', () => ({
  notify: (input: ToastInput): number => {
    seen.toasts.push(input);
    return seen.toasts.length;
  },
}));

const { RESTORED_DETAIL, RESTORED_MESSAGE, RESTORE_FAILED, restoreVersion } =
  await import('./restore');

const ITEM_ID = 'e1b2c3d4-0000-4000-8000-000000000004';
const VERSION_ID = 'e1b2c3d4-0000-4000-8000-000000000005';

const ITEM: DriveItem = documentFixture({
  id: ITEM_ID,
  relPath: 'Home/Notes.md',
  name: 'Notes.md',
  modifiedAt: '2026-11-07T09:10:00.000Z',
  addedAt: '2026-11-02T09:10:00.000Z',
  rev: 4,
  mime: 'text/markdown',
  bytes: 4200,
  integrity: 'ok',
});

describe('restoreVersion', () => {
  beforeEach(() => {
    seen.restored = [];
    seen.toasts = [];
    seen.fail = false;
  });

  it('asks the hub to restore the version as a new one and says the old copy is kept', async () => {
    await expect(restoreVersion(ITEM, VERSION_ID)).resolves.toBe(true);
    expect(seen.restored).toEqual([[ITEM_ID, VERSION_ID]]);
    expect(seen.toasts).toEqual([{ message: RESTORED_MESSAGE, detail: RESTORED_DETAIL }]);
  });

  it('reports a failed restore as critical', async () => {
    seen.fail = true;
    await expect(restoreVersion(ITEM, VERSION_ID)).resolves.toBe(false);
    expect(seen.toasts).toEqual([
      { message: RESTORE_FAILED, error: new Error('hub said no'), tone: 'critical' },
    ]);
  });
});
