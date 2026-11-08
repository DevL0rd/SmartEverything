import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveShareCreate } from '@smarteverything/domain';

interface Seen {
  sent: DriveShareCreate[];
}

const seen = vi.hoisted((): Seen => ({ sent: [] }));

const ITEM_ID = 'a1b2c3d4-0000-4000-8000-000000000201';
const ME = 'a1b2c3d4-0000-4000-8000-000000000301';

vi.mock('../../../api/drive', () => ({
  createDriveShare: (body: DriveShareCreate): Promise<object> => {
    seen.sent.push(body);
    return Promise.resolve({
      share: {
        id: 'a1b2c3d4-0000-4000-8000-000000000401',
        itemId: body.itemId,
        permission: body.permission,
        expiresAt: body.expiresAt,
        hasPassword: body.password !== null,
        createdBy: ME,
        revokedAt: null,
        opens: 0,
        downloads: 0,
        lastOpenedAt: null,
      },
      url: 'https://hub.example/s/token',
      public: true,
    });
  },
}));

const { makeShareLink } = await import('./share-data');
const { SHARES_PREFIX } = await import('../shared/revoke-link');

describe('makeShareLink', () => {
  beforeEach(() => {
    seen.sent = [];
  });

  it('sends the request as mapped and refreshes every list of links', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const request: DriveShareCreate = {
      itemId: ITEM_ID,
      permission: 'download',
      expiresAt: '2026-11-14T12:00:00.000Z',
      password: 'kitchen-2026',
    };
    const created = await makeShareLink(client, request);
    expect(seen.sent).toEqual([request]);
    expect(created.url).toBe('https://hub.example/s/token');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: SHARES_PREFIX });
  });
});
