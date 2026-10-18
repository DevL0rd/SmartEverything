import { type Query, type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { assistantAttachmentLinks } from '../../../api/assistant';
import { linkLifetimeMs, type SignedLink } from '../../../api/media';
import { assistantLinksKey } from '../../../queries/keys';

type Links = Readonly<Record<string, SignedLink>>;

function linksFresh(query: Query<Links, Error, Links, readonly string[]>): number {
  const links = Object.values(query.state.data ?? {});
  return links.length === 0 ? 0 : Math.min(...links.map((link) => linkLifetimeMs(link.expiresAt)));
}

export function useAttachmentLinks(ids: readonly string[]): UseQueryResult<Links> {
  return useScreenQuery({
    queryKey: assistantLinksKey(ids),
    queryFn: () => assistantAttachmentLinks(ids),
    staleTime: linksFresh,
    enabled: ids.length > 0,
  });
}
