import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveItem } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import type { ToastInput } from '../../../components/toast-store';
import { documentFixture } from '../data/fixtures';

interface Seen {
  restored: (readonly [string, string])[];
  toasts: ToastInput[];
  asked: ConfirmRequest[];
  accept: boolean;
  fail: boolean;
}

const seen = vi.hoisted((): Seen => ({
  restored: [],
  toasts: [],
  asked: [],
  accept: true,
  fail: false,
}));

vi.mock('../../../api/drive', () => ({
  restoreDriveVersion: (itemId: string, versionId: string): Promise<{ readonly rev: number }> => {
    seen.restored.push([itemId, versionId]);
    return seen.fail ? Promise.reject(new Error('hub said no')) : Promise.resolve({ rev: 5 });
  },
}));
vi.mock('../../../components/confirm-store', () => ({
  confirm: (request: ConfirmRequest): Promise<boolean> => {
    seen.asked.push(request);
    return Promise.resolve(seen.accept);
  },
}));
vi.mock('../../../components/toast-store', () => ({
  notify: (input: ToastInput): number => {
    seen.toasts.push(input);
    return seen.toasts.length;
  },
}));

const {
  RESTORED_DETAIL,
  RESTORED_MESSAGE,
  RESTORE_CONFIRM_TITLE,
  RESTORE_FAILED,
  restoreConfirmBody,
  restoreVersion,
} = await import('./restore');

const WHEN = 'Yesterday 09:10';

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
    seen.asked = [];
    seen.accept = true;
    seen.fail = false;
  });

  it('asks first, then restores the version as a new one and says the old copy is kept', async () => {
    await expect(restoreVersion(ITEM, VERSION_ID, WHEN)).resolves.toBe(true);
    expect(seen.asked).toEqual([
      { title: RESTORE_CONFIRM_TITLE, body: restoreConfirmBody(WHEN), confirmLabel: 'Restore' },
    ]);
    expect(restoreConfirmBody(WHEN)).toBe(
      'The version from Yesterday 09:10 becomes the current file. The file you have now is kept in Versions.',
    );
    expect(seen.restored).toEqual([[ITEM_ID, VERSION_ID]]);
    expect(seen.toasts).toEqual([{ message: RESTORED_MESSAGE, detail: RESTORED_DETAIL }]);
  });

  it('changes nothing when the restore is not confirmed', async () => {
    seen.accept = false;
    await expect(restoreVersion(ITEM, VERSION_ID, WHEN)).resolves.toBe(false);
    expect(seen.restored).toEqual([]);
    expect(seen.toasts).toEqual([]);
  });

  it('reports a failed restore as critical', async () => {
    seen.fail = true;
    await expect(restoreVersion(ITEM, VERSION_ID, WHEN)).resolves.toBe(false);
    expect(seen.toasts).toEqual([
      { message: RESTORE_FAILED, error: new Error('hub said no'), tone: 'critical' },
    ]);
  });
});
