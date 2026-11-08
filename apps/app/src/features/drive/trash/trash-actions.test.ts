import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, type DriveChangeResult, type DriveItem } from '@smarteverything/domain';
import type { ToastInput } from '../../../components/toast-store';

interface Seen {
  toasts: ToastInput[];
  pushed: unknown[];
  item: DriveItem | Error | null;
}

const seen = vi.hoisted((): Seen => ({ toasts: [], pushed: [], item: null }));

vi.mock('expo-router', () => ({
  router: {
    push: (target: unknown): void => {
      seen.pushed.push(target);
    },
  },
}));
vi.mock('../../../components/toast-store', () => ({
  notify: (input: ToastInput): number => {
    seen.toasts.push(input);
    return seen.toasts.length;
  },
}));
vi.mock('../../../api/drive', () => ({
  changeDrive: (): Promise<never> => Promise.reject(new Error('unused')),
  readDriveItem: (): Promise<DriveItem> =>
    seen.item instanceof Error || seen.item === null
      ? Promise.reject(seen.item ?? new Error('no item'))
      : Promise.resolve(seen.item),
}));

const { announceRestored } = await import('./trash-actions');

const ROOT_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000010';
const OTHER_ID = 'a1b2c3d4-0000-4000-8000-000000000011';

function itemOf(relPath: string, parentId: string | null): DriveItem {
  return DRIVE_ITEM.parse({
    id: ITEM_ID,
    rootId: ROOT_ID,
    parentId,
    relPath,
    name: relPath.split('/').at(-1),
    modifiedAt: '2026-11-07T10:00:00.000Z',
    addedAt: '2026-11-07T10:00:00.000Z',
    openedAt: null,
    starred: false,
    rev: 2,
    etag: 'e',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'application/pdf',
    bytes: 4,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    kind: 'document',
  });
}

function resultOf(
  done: DriveChangeResult['done'],
  failed: DriveChangeResult['failed'] = [],
): DriveChangeResult {
  return { done, failed, conflicts: [] };
}

const labels = (rootId: string): string | null => (rootId === ROOT_ID ? 'Projects' : null);

async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe('restore announcements', () => {
  beforeEach(() => {
    seen.toasts = [];
    seen.pushed = [];
    seen.item = null;
  });

  it('says what one item was restored as and where, and Open goes to it', async () => {
    seen.item = itemOf('Home/Kitchen remodel/Quotes (2)', FOLDER_ID);
    announceRestored(resultOf([{ itemId: ITEM_ID, resultItemId: ITEM_ID }]), labels);
    await settle();
    const [toast] = seen.toasts;
    expect(toast?.message).toBe('Restored as Quotes (2) in Kitchen remodel');
    expect(toast?.tone).toBe('positive');
    expect(toast?.action?.label).toBe('Open');
    toast?.action?.onPress();
    expect(seen.pushed).toHaveLength(1);
  });

  it('names the library folder for an item restored at its top', async () => {
    seen.item = itemOf('Quote.pdf', null);
    announceRestored(resultOf([{ itemId: ITEM_ID, resultItemId: ITEM_ID }]), labels);
    await settle();
    expect(seen.toasts[0]?.message).toBe('Restored as Quote.pdf in Projects');
  });

  it('still says it was restored when the restored item cannot be read', async () => {
    seen.item = new Error('gone');
    announceRestored(resultOf([{ itemId: ITEM_ID, resultItemId: ITEM_ID }]), labels);
    await settle();
    expect(seen.toasts.map((toast) => toast.message)).toEqual(['1 item restored']);
  });

  it('counts several restored items and reports the ones that were not', async () => {
    announceRestored(
      resultOf(
        [
          { itemId: ITEM_ID, resultItemId: ITEM_ID },
          { itemId: OTHER_ID, resultItemId: OTHER_ID },
        ],
        [{ itemId: FOLDER_ID, reason: 'The folder it was in is read only.' }],
      ),
      labels,
    );
    await settle();
    expect(seen.toasts.map((toast) => [toast.message, toast.tone])).toEqual([
      ['1 item was not restored', 'critical'],
      ['2 items restored', 'positive'],
    ]);
    expect(seen.toasts[0]?.detail).toBe('The folder it was in is read only.');
  });
});
