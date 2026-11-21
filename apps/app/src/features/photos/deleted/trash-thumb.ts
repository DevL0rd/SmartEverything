import { skipToken } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type DriveTrashLink } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { LINK_RENEW_LEAD_MS } from '../../drive';

export interface TrashThumb {
  readonly url: string;
  readonly expiresAt: number;
}

export function trashThumbKey(itemId: string | null): readonly unknown[] {
  return driveKey('photo-trash-thumb', DRIVE_EVERYWHERE, itemId);
}

export function trashThumbStaleMs(thumb: TrashThumb | null, now: number): number {
  return thumb === null ? 0 : Math.max(0, thumb.expiresAt - now - LINK_RENEW_LEAD_MS);
}

export function trashThumbOf(
  links: readonly DriveTrashLink[],
  itemId: string,
): DriveTrashLink['thumb'] {
  return links.find((entry) => entry.itemId === itemId)?.thumb ?? null;
}

async function readTrashThumb(itemId: string, signal: AbortSignal): Promise<TrashThumb | null> {
  const client = api().forMedia();
  const links = await client.call(E.trashLinks, { body: { itemIds: [itemId] } }, { signal });
  const thumb = trashThumbOf(links, itemId);
  if (thumb === null) return null;
  return {
    url: await client.resourceUrl(thumb.url, thumb.expiresAt, 'image'),
    expiresAt: Date.parse(thumb.expiresAt),
  };
}

export function useTrashThumb(itemId: string | null, wanted: boolean): string | null {
  const query = useScreenQuery({
    queryKey: trashThumbKey(itemId),
    queryFn:
      itemId === null || !wanted
        ? skipToken
        : ({ signal }): Promise<TrashThumb | null> => readTrashThumb(itemId, signal),
    staleTime: (entry) => trashThumbStaleMs(entry.state.data ?? null, Date.now()),
    retry: false,
  });
  return query.data?.url ?? null;
}
