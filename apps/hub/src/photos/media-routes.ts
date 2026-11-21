import { PHOTOS_ENDPOINTS, type MediaInfo, type MediaProcessing } from '@smarteverything/domain';
import type { DriveActor } from '../drive/access';
import { photoActor } from './actor';
import { refusing } from '../server/handlers/drive-errors';
import { bound, type Bound } from '../server/router';
import type { StoreHost } from '../store/host/host';

const E = PHOTOS_ENDPOINTS;

export class PhotoMedia {
  constructor(private readonly host: StoreHost) {}

  info(actor: DriveActor, itemId: string): Promise<MediaInfo> {
    return this.host.read('photoMediaInfo', { actor, itemId });
  }

  processing(actor: DriveActor): Promise<MediaProcessing> {
    return this.host.read('photoMediaProcessing', { actor });
  }
}

export interface PhotoMediaRoutes {
  readonly readMediaInfo: Bound<typeof E.readMediaInfo>;
  readonly readMediaProcessing: Bound<typeof E.readMediaProcessing>;
}

export function photoMediaRoutes(media: PhotoMedia): PhotoMediaRoutes {
  return {
    readMediaInfo: bound(E.readMediaInfo, ({ params, caller }) =>
      refusing(() => media.info(photoActor(caller), params.itemId)),
    ),
    readMediaProcessing: bound(E.readMediaProcessing, ({ caller }) =>
      media.processing(photoActor(caller)),
    ),
  };
}
