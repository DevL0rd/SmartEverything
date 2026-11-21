import { describe, expect, it } from 'vitest';
import type { DriveTrashLink } from '@smarteverything/domain';
import { LINK_RENEW_LEAD_MS } from '../../drive';
import { trashThumbOf, trashThumbStaleMs } from './trash-thumb';

const FIRST = '00000000-0000-4000-8000-000000000011';
const SECOND = '00000000-0000-4000-8000-000000000012';
const THUMB = { url: '/media/drive/a/thumb', expiresAt: '2026-11-15T12:10:00.000Z' };

const LINKS: readonly DriveTrashLink[] = [
  { itemId: FIRST, thumb: THUMB },
  { itemId: SECOND, thumb: null },
];

describe('trashThumbOf', () => {
  it('returns the thumbnail link of the requested trashed item', () => {
    expect(trashThumbOf(LINKS, FIRST)).toEqual(THUMB);
  });

  it('returns null when the item has no thumbnail or was not answered', () => {
    expect(trashThumbOf(LINKS, SECOND)).toBeNull();
    expect(trashThumbOf([], FIRST)).toBeNull();
  });
});

describe('trashThumbStaleMs', () => {
  it('renews a link shortly before it expires and never keeps a missing one', () => {
    const expiresAt = Date.parse(THUMB.expiresAt);
    expect(trashThumbStaleMs({ url: THUMB.url, expiresAt }, expiresAt - 600_000)).toBe(
      600_000 - LINK_RENEW_LEAD_MS,
    );
    expect(trashThumbStaleMs({ url: THUMB.url, expiresAt }, expiresAt)).toBe(0);
    expect(trashThumbStaleMs(null, 0)).toBe(0);
  });
});
