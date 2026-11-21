import type { PhotoSource } from '@smarteverything/domain';
import type { HubLayout } from '../../data-layout';
import type { OpenRouterPlatform } from '../../openrouter/platform';
import type { PreviewDecoders } from '../../photos/pipeline/preview';
import type { ConflictEnv } from '../../drive/conflicts';
import type { DriveReadService } from '../../drive/service-read';
import type { DriveWriteService } from '../../drive/service-write';
import { PhotoModelCatalogue } from '../../photos/ai/catalogue';
import { photoAiRoutes, type PhotoAiRoutes } from '../../photos/ai/routes';
import type { PhotoAi } from '../../photos/ai/service';
import { photoBackupRoutes, type PhotoBackupRoutes } from '../../photos/backup-routes';
import { BackupService } from '../../photos/backup';
import { photoDuplicateRoutes, type PhotoDuplicateRoutes } from '../../photos/duplicates-routes';
import { photoFolderRoutes, type PhotoFolderRoutes } from '../../photos/folder-routes';
import type { DuplicatesService } from '../../photos/duplicates';
import { photoEditRoutes, type PhotoEditRoutes } from '../../photos/edits/routes';
import { photoEditDeps } from '../../photos/edits/wiring';
import { photoInsightRoutes, type PhotoInsightRoutes } from '../../photos/insights-routes';
import { PhotoMedia, photoMediaRoutes, type PhotoMediaRoutes } from '../../photos/media-routes';
import {
  organiseServices,
  type OrganiseServices,
  photoOrganiseRoutes,
  type PhotoOrganiseRoutes,
} from '../../photos/organise/routes';
import { photoPeople } from '../../photos/people/wiring';
import type { PhotoSharingHub } from '../../photos/sharing/wiring';
import type { PhotoSharingRoutes } from '../../photos/sharing/routes';
import type { PhotoPeopleRoutes } from '../../photos/people/routes';
import { PlacedMetaEditor } from '../../photos/placed-meta';
import { photoPlaceRoutes, type PhotoPlaceRoutes } from '../../photos/places-routes';
import { AiImageSource } from '../../photos/sources/ai-images';
import { CameraSource } from '../../photos/sources/cameras';
import { photoSourceRoutes, type PhotoSourceRoutes } from '../../photos/sources/routes';
import type { SourceService } from '../../photos/sources/shapes';
import type { Store } from '../../store/store';
import type { MediaLinks } from '../media-links';
import { photosRoutes, type PhotoRoutes } from './photos';

export interface PhotoHubInputs {
  readonly store: Store;
  readonly env: ConflictEnv;
  readonly read: DriveReadService;
  readonly write: Pick<DriveWriteService, 'change'>;
  readonly duplicates: DuplicatesService;
  readonly recordingPath: (storagePath: string) => string;
  readonly attachmentPath: (storagePath: string) => string;
  readonly permittedCameras: () => readonly string[];
  readonly ai: PhotoAi;
  readonly sharing: PhotoSharingHub;
  readonly links: Pick<MediaLinks, 'claimed'>;
  readonly layout: HubLayout;
  readonly decoders: PreviewDecoders;
  readonly openRouter: Pick<OpenRouterPlatform, 'client'>;
}

function sourcesOf(inputs: PhotoHubInputs): Readonly<Record<PhotoSource, SourceService>> {
  const env = { ...inputs.env, store: inputs.store };
  return {
    cameras: new CameraSource({
      env,
      recordingPath: inputs.recordingPath,
      permitted: inputs.permittedCameras,
    }),
    ai: new AiImageSource({ env, attachmentPath: inputs.attachmentPath }),
  };
}

export function photoBackupService(inputs: Pick<PhotoHubInputs, 'env'>): BackupService {
  return new BackupService(inputs.env);
}

export type PhotoHubRoutes = PhotoRoutes &
  PhotoInsightRoutes &
  PhotoDuplicateRoutes &
  PhotoPlaceRoutes &
  PhotoMediaRoutes &
  PhotoSourceRoutes &
  PhotoBackupRoutes &
  PhotoFolderRoutes &
  PhotoOrganiseRoutes &
  PhotoAiRoutes &
  PhotoPeopleRoutes &
  PhotoEditRoutes &
  PhotoSharingRoutes;

export function photoHubRoutes(inputs: PhotoHubInputs): PhotoHubRoutes {
  const { store } = inputs;
  const { sharing } = inputs;
  return {
    ...photosRoutes(store),
    ...photoInsightRoutes(store),
    ...photoDuplicateRoutes(store, inputs.duplicates),
    ...photoPlaceRoutes(store),
    ...photoMediaRoutes(new PhotoMedia(store.host)),
    ...photoSourceRoutes(store, sourcesOf(inputs)),
    ...photoBackupRoutes(store, photoBackupService(inputs)),
    ...photoFolderRoutes(store),
    ...photoAiRoutes(
      inputs.ai,
      new PhotoModelCatalogue(store.live, () => inputs.openRouter.client.zdrModelIds()),
    ),
    ...photoPeople({
      store,
      ai: inputs.ai,
      timeZone: () => store.live.home.settings.read().time_zone,
    }),
    ...sharing.routes,
    ...photoEditRoutes(
      photoEditDeps({ ...inputs, eraserModel: async () => (await inputs.ai.models()).eraser }),
    ),
    ...photoOrganiseRoutes(store, placedOrganise(inputs)),
  };
}

function placedOrganise(inputs: PhotoHubInputs): OrganiseServices {
  const { store } = inputs;
  return {
    ...organiseServices({
      store,
      write: inputs.write,
      links: inputs.links,
      now: inputs.env.now,
    }),
    meta: new PlacedMetaEditor(store.host),
  };
}
