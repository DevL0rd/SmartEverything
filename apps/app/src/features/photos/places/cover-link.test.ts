import { describe, expect, it } from 'vitest';
import type { DriveItemLink } from '@smarteverything/domain';
import { LINK_RENEW_LEAD_MS } from '../../drive/data/links';
import { coverLinkOf, coverStaleMs } from './cover-link';

function linkOf(itemId: string, thumbUrl: string | null): DriveItemLink {
  const file = { url: `/file/${itemId}`, expiresAt: '2026-11-15T12:10:00.000Z' };
  return {
    itemId,
    rev: 5,
    file,
    download: null,
    icon: null,
    thumb: thumbUrl === null ? null : { url: thumbUrl, expiresAt: '2026-11-15T12:10:00.000Z' },
    preview: null,
    playable: null,
  };
}

describe('coverLinkOf', () => {
  it('returns the thumb link of the requested item with its expiry in milliseconds', () => {
    const links = [linkOf('a', '/thumb/a'), linkOf('b', '/thumb/b')];
    expect(coverLinkOf(links, 'b')).toEqual({
      url: '/thumb/b',
      expiresAt: Date.parse('2026-11-15T12:10:00.000Z'),
    });
  });

  it('returns null when the item has no thumb or is missing', () => {
    expect(coverLinkOf([linkOf('a', null)], 'a')).toBeNull();
    expect(coverLinkOf([linkOf('a', '/thumb/a')], 'z')).toBeNull();
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
