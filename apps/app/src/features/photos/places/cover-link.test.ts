import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { LINK_RENEW_LEAD_MS, invalidateDriveChanged } from '../../drive';
import { coverKey, coverStaleMs } from './cover-link';

describe('coverKey', () => {
  it('is never reached by a drive change notice, however wide', () => {
    const client = new QueryClient();
    const key = coverKey('item-1', 1);
    client.setQueryData(key, { url: '/thumb/item-1', expiresAt: 0 });
    invalidateDriveChanged(client, {
      type: 'drive_changed',
      rootIds: [],
      folderIds: [],
      albumIds: [],
      months: [],
      cursor: 1,
    });
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it('changes with the route generation so a new route gets new links', () => {
    expect(coverKey('item-1', 1)).not.toEqual(coverKey('item-1', 2));
  });
});

describe('coverStaleMs', () => {
  const expiresAt = Date.parse('2026-11-15T12:10:00.000Z');

  it('keeps the link fresh until the renew lead before expiry', () => {
    const now = expiresAt - 5 * 60_000;
    expect(coverStaleMs({ url: 'u', expiresAt }, now)).toBe(5 * 60_000 - LINK_RENEW_LEAD_MS);
  });

  it('is stale at once when expired, within the lead, or absent', () => {
    expect(coverStaleMs({ url: 'u', expiresAt }, expiresAt - LINK_RENEW_LEAD_MS / 2)).toBe(0);
    expect(coverStaleMs({ url: 'u', expiresAt }, expiresAt + 1)).toBe(0);
    expect(coverStaleMs(null, 0)).toBe(0);
  });
});
