import type { DriveItemLink } from '@smarteverything/domain';
import { LINK_RENEW_LEAD_MS } from '../../drive/data/links';

export interface CoverLink {
  readonly url: string;
  readonly expiresAt: number;
}

export function coverLinkOf(links: readonly DriveItemLink[], itemId: string): CoverLink | null {
  const thumb = links.find((entry) => entry.itemId === itemId)?.thumb;
  return thumb === undefined || thumb === null
    ? null
    : { url: thumb.url, expiresAt: Date.parse(thumb.expiresAt) };
}

export function coverStaleMs(link: CoverLink | null, now: number): number {
  return link === null ? 0 : Math.max(0, link.expiresAt - now - LINK_RENEW_LEAD_MS);
}
