import type { Query } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type HomeMapId, type HomeMapScan } from '@smarteverything/domain';
import { linkLifetimeMs, type SignedLink } from '../../../api/media';
import { api } from '../../../api/transport';
import type { ScanUrlOf } from '../../../components/house-map/3d/map-3d-protocol';
import { useScreenQuery } from '../../../queries/use-screen-query';

type ScanLinkKey = readonly ['home-map-scan-link', HomeMapId, string];

export interface ShownScan {
  readonly scan: HomeMapScan | null;
  readonly urlOf: ScanUrlOf;
}

export function scanLinkKey(mapId: HomeMapId, hash: string): ScanLinkKey {
  return ['home-map-scan-link', mapId, hash];
}

export function shownHashOf(scan: HomeMapScan): string {
  return scan.lod?.hash ?? scan.file.hash;
}

export async function scanLink(mapId: HomeMapId, hash: string): Promise<SignedLink> {
  const client = api().forMedia();
  const link = await client.call(E.homeMapScanLink, { params: { mapId }, query: { hash } });
  return {
    url: await client.resourceUrl(link.url, link.expiresAt, 'attachment'),
    expiresAt: link.expiresAt,
  };
}

function linkFresh(query: Query<SignedLink, Error, SignedLink, ScanLinkKey>): number {
  return linkLifetimeMs(query.state.data?.expiresAt);
}

const NO_URL: ScanUrlOf = () => '';

export function shownScanOf(scan: HomeMapScan | null, url: string | null): ShownScan {
  return scan === null || url === null ? { scan: null, urlOf: NO_URL } : { scan, urlOf: () => url };
}

export function useShownScan(mapId: HomeMapId, scan: HomeMapScan | null): ShownScan {
  const hash = scan === null ? '' : shownHashOf(scan);
  const link = useScreenQuery({
    queryKey: scanLinkKey(mapId, hash),
    queryFn: () => scanLink(mapId, hash),
    staleTime: linkFresh,
    enabled: scan !== null,
  });
  return shownScanOf(scan, link.data?.url ?? null);
}
