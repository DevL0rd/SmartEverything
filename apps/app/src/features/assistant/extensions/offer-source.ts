import {
  sameHarnessGitOrigin,
  type HarnessDiscoveryItem,
  type HarnessExtensionItem,
} from '@smarteverything/domain';

export type OfferInstallation =
  | { readonly status: 'available' }
  | { readonly status: 'installed'; readonly item: HarnessExtensionItem }
  | { readonly status: 'conflict' };

export function offerInstallation(
  offer: HarnessDiscoveryItem,
  item: HarnessExtensionItem | undefined,
): OfferInstallation {
  if (item === undefined) return { status: 'available' };
  const { origin } = offer.reference;
  if (
    origin !== undefined &&
    item.source.kind === 'git' &&
    sameHarnessGitOrigin(item.source, origin)
  )
    return { status: 'installed', item };
  return { status: 'conflict' };
}

export function offerKey(offer: HarnessDiscoveryItem): string {
  const source = offer.reference.origin ?? offer.reference.source;
  return JSON.stringify([offer.id, source.url, source.ref ?? null, source.path ?? null]);
}

export function offerSourceLabel(offer: HarnessDiscoveryItem): string {
  const source = offer.reference.origin ?? offer.reference.source;
  const repo = offer.source_url.replace(/^https?:\/\//u, '');
  return [repo, source.path, source.ref]
    .filter((part) => part !== null && part !== undefined)
    .join(' · ');
}
