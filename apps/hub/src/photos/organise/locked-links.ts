import {
  ApiError,
  MEDIA_PATHS,
  buildPath,
  type DriveItem,
  type DriveItemLink,
  type MediaLink,
  type PhotoItemIds,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { MediaLinks, VerifiedDriveLink } from '../../server/media-links';
import type { StoreHost } from '../../store/host/host';

export const LOCKED_LINK_CLAIM = 'locked';

type LinkSigner = Pick<MediaLinks, 'claimed'>;

type LinkVerifier = Pick<MediaLinks, 'verifyClaimed'>;

const CLAIMS = z.strictObject({
  [LOCKED_LINK_CLAIM]: z.string().regex(/^[0-9a-f]{64}$/),
  rev: z.coerce.number().int().positive(),
});

const EXPIRES = z.coerce.number().int().positive();

export function isLockedLink(url: URL): boolean {
  return url.searchParams.has(LOCKED_LINK_CLAIM);
}

export interface LockedLinkTarget {
  readonly item: DriveItem;
  readonly link: VerifiedDriveLink;
}

export async function verifyLockedLink(
  host: StoreHost,
  links: LinkVerifier,
  url: URL,
  itemId: string,
): Promise<LockedLinkTarget> {
  const claims = CLAIMS.safeParse(links.verifyClaimed(url));
  if (!claims.success) {
    throw new ApiError('unauthorized', 'This media path carries no valid signature.');
  }
  const item = await host.read('photoLockedLinkTarget', {
    session: claims.data[LOCKED_LINK_CLAIM],
    itemId,
  });
  const link = {
    rev: claims.data.rev,
    download: false,
    expiresAt: new Date(EXPIRES.parse(url.searchParams.get('expires')) * 1000),
  };
  return { item, link };
}

export class LockedLinks {
  constructor(
    private readonly host: StoreHost,
    private readonly links: LinkSigner,
  ) {}

  async mint(profileId: string, session: string, request: PhotoItemIds): Promise<DriveItemLink[]> {
    const linked = await this.host.read('photoLockedLinkItems', {
      profileId,
      itemIds: request.itemIds,
    });
    return linked.map(({ item, playable }) => {
      const itemId = item.id;
      const sign = (path: string): MediaLink =>
        this.links.claimed(path, { [LOCKED_LINK_CLAIM]: session, rev: String(item.rev) });
      const derived = (size: 'thumb' | 'preview' | 'playable'): MediaLink =>
        sign(buildPath(MEDIA_PATHS.driveThumb, { itemId, size }));
      const ready = item.thumb.state === 'ready';
      return {
        itemId,
        rev: item.rev,
        file: sign(buildPath(MEDIA_PATHS.driveFile, { itemId })),
        download: null,
        icon: null,
        thumb: ready ? derived('thumb') : null,
        preview: ready ? derived('preview') : null,
        playable: playable ? derived('playable') : null,
      };
    });
  }
}
