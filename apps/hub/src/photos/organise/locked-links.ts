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
import { inLockedFolder } from '../../drive/access';
import { isFileItem } from '../../drive/file-item';
import type { MediaLinks, VerifiedDriveLink } from '../../server/media-links';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { Store } from '../../store/store';

export const LOCKED_LINK_CLAIM = 'locked';

export type LockedLinkStore = Pick<Store, 'context' | 'driveRoots' | 'driveItems' | 'photoLocked'>;

type LinkSigner = Pick<MediaLinks, 'claimed'>;

type LinkVerifier = Pick<MediaLinks, 'verifyClaimed'>;

const CLAIMS = z.strictObject({
  [LOCKED_LINK_CLAIM]: z.string().regex(/^[0-9a-f]{64}$/),
  rev: z.coerce.number().int().positive(),
});

const EXPIRES = z.coerce.number().int().positive();

function hidden(): ApiError {
  return new ApiError('not_found', 'There is no such file for this caller.');
}

export function isLockedLink(url: URL): boolean {
  return url.searchParams.has(LOCKED_LINK_CLAIM);
}

function heldBy(store: LockedLinkStore, profileId: string, item: DriveItem): boolean {
  const root = store.driveRoots.find(item.rootId);
  return inLockedFolder(item) && root?.scope === 'person' && root.ownerProfileId === profileId;
}

export interface LockedLinkTarget {
  readonly item: DriveItem;
  readonly link: VerifiedDriveLink;
}

export function verifyLockedLink(
  store: LockedLinkStore,
  links: LinkVerifier,
  url: URL,
  itemId: string,
): LockedLinkTarget {
  const claims = CLAIMS.safeParse(links.verifyClaimed(url));
  if (!claims.success) {
    throw new ApiError('unauthorized', 'This media path carries no valid signature.');
  }
  const unlock = store.photoLocked.unlock(claims.data[LOCKED_LINK_CLAIM]);
  if (unlock === undefined) {
    throw new ApiError('link_expired', 'The Locked folder closed; unlock it again.');
  }
  const item = store.driveItems.find(itemId, unlock.profileId);
  if (item === undefined || !heldBy(store, unlock.profileId, item)) throw hidden();
  const link = {
    rev: claims.data.rev,
    download: false,
    expiresAt: new Date(EXPIRES.parse(url.searchParams.get('expires')) * 1000),
  };
  return { item, link };
}

export class LockedLinks {
  private readonly media: DriveMediaRepository;

  constructor(
    private readonly store: LockedLinkStore,
    private readonly links: LinkSigner,
  ) {
    this.media = new DriveMediaRepository(store.context);
  }

  mint(profileId: string, session: string, request: PhotoItemIds): DriveItemLink[] {
    return [...new Set(request.itemIds)].map((itemId) => {
      const item = this.store.driveItems.find(itemId, profileId);
      if (item === undefined || !isFileItem(item) || !heldBy(this.store, profileId, item)) {
        throw new ApiError('not_found', 'Some of those photos are not in your Locked folder.');
      }
      const sign = (path: string): MediaLink =>
        this.links.claimed(path, { [LOCKED_LINK_CLAIM]: session, rev: String(item.rev) });
      const derived = (size: 'thumb' | 'preview' | 'playable'): MediaLink =>
        sign(buildPath(MEDIA_PATHS.driveThumb, { itemId, size }));
      const ready = item.thumb.state === 'ready';
      const playable = item.kind === 'video' && this.media.find(itemId)?.playable_state === 'ready';
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
