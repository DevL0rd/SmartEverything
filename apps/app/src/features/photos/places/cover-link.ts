import { LINK_RENEW_LEAD_MS, type ResolvedDriveLink } from '../../drive';

export function coverKey(itemId: string | null, generation: number): readonly unknown[] {
  return ['drive-link', 'photo-cover', generation, itemId];
}

export function coverStaleMs(link: ResolvedDriveLink | null, now: number): number {
  return link === null ? 0 : Math.max(0, link.expiresAt - now - LINK_RENEW_LEAD_MS);
}
