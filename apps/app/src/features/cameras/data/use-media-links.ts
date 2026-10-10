import { type Query, type UseQueryResult } from '@tanstack/react-query';
import type { MediaSize } from '@smarteverything/domain';
import { linkLifetimeMs, recordingLinks, type SignedLink } from '../../../api/media';
import { recordingLinksKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';

type Links = Readonly<Record<string, SignedLink>>;

function linksFresh(query: Query<Links, Error, Links, readonly string[]>): number {
  const links = Object.values(query.state.data ?? {});
  return links.length === 0 ? 0 : Math.min(...links.map((link) => linkLifetimeMs(link.expiresAt)));
}

export function useRecordingLinks(ids: readonly string[], size: MediaSize): UseQueryResult<Links> {
  return useScreenQuery({
    queryKey: recordingLinksKey(ids, size),
    queryFn: () => recordingLinks(ids, size),
    staleTime: linksFresh,
    enabled: ids.length > 0,
  });
}
