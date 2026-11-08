import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { driveKey, DRIVE_EVERYWHERE } from '../../../queries/keys';
import { invalidateDriveChanged } from './windows';

const { options, listActivity } = vi.hoisted(() => ({
  options: vi.fn(
    (value: {
      readonly queryKey: readonly unknown[];
      readonly read: (cursor: string | null) => Promise<unknown>;
    }) => value,
  ),
  listActivity: vi.fn(() => Promise.resolve({ items: [], next: null })),
}));

vi.mock('./pages', () => ({ useDrivePages: options }));
vi.mock('../../../api/drive', () => ({ listDriveActivity: listActivity }));

const { useDriveActivity } = await import('./queries');

describe('global Drive activity windows', () => {
  it('keeps dates separate and passes the page cursor to the existing transport', async () => {
    const from = '2026-01-01T00:00:00Z';
    useDriveActivity(from);
    const supplied = options.mock.calls[0]?.[0];
    if (supplied === undefined)
      throw new Error('The activity query did not provide its page reader.');
    expect(supplied).toMatchObject({ queryKey: driveKey('activity', DRIVE_EVERYWHERE, from) });
    await supplied.read('42');
    expect(listActivity).toHaveBeenCalledWith(from, '42');
    useDriveActivity('2026-02-01T00:00:00Z');
    expect(options.mock.calls[1]?.[0]).toMatchObject({
      queryKey: driveKey('activity', DRIVE_EVERYWHERE, '2026-02-01T00:00:00Z'),
    });
  });

  it('invalidates the global feed when any root changes even without photo months', () => {
    const client = new QueryClient();
    const key = driveKey('activity', DRIVE_EVERYWHERE, '2026-01-01T00:00:00Z');
    client.setQueryData(key, { items: [], next: null });
    invalidateDriveChanged(client, {
      type: 'drive_changed',
      rootIds: ['root'],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 1,
    });
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
