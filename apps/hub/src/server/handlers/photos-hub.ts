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
import {
  PhotoFolderService,
  photoFolderRoutes,
  type PhotoFolderRoutes,
} from '../../photos/folder-routes';
import type { DuplicatesService } from '../../photos/duplicates';
import { photoEditRoutes, type PhotoEditRoutes } from '../../photos/edits/routes';
import { photoEditDeps } from '../../photos/edits/wiring';
import { InsightsReader } from '../../photos/insights';
import { RailCountsReader } from '../../photos/insights-rail';
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
import type { PlacesService } from '../../photos/places';
import { PlaceQueries } from '../../photos/places-queries';
import { photoPlaceRoutes, type PhotoPlaceRoutes } from '../../photos/places-routes';
import { AiImageSource } from '../../photos/sources/ai-images';
import { CameraSource } from '../../photos/sources/cameras';
import { photoSourceRoutes, type PhotoSourceRoutes } from '../../photos/sources/routes';
import type { SourceService } from '../../photos/sources/shapes';
import { StacksService } from '../../photos/stacks';
import { DriveBackupRepository } from '../../store/repositories/drive-backup';
import type { Store } from '../../store/store';
import type { MediaLinks } from '../media-links';
import { photoReaders, photosRoutes, type PhotoRoutes } from './photos';

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
  readonly places: Pick<PlacesService, 'assign'>;
}

function sourcesOf(inputs: PhotoHubInputs): Readonly<Record<PhotoSource, SourceService>> {
  const env = { ...inputs.env, store: inputs.store, sql: inputs.store.context.sql };
  return {
    cameras: new CameraSource({
      env,
      recordingPath: inputs.recordingPath,
      permitted: inputs.permittedCameras,
    }),
    ai: new AiImageSource({ env, attachmentPath: inputs.attachmentPath }),
  };
}

export function photoBackupService(inputs: Pick<PhotoHubInputs, 'store' | 'env'>): BackupService {
  const { store } = inputs;
  return new BackupService({
    ...inputs.env,
    store: { ...store, driveBackup: new DriveBackupRepository(store.context) },
    sql: store.context.sql,
  });
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
  const { context } = store;
  const readers = photoReaders(context);
  const { sharing } = inputs;
  return {
    ...photosRoutes(store, readers),
    ...photoInsightRoutes(store, {
      insights: new InsightsReader(context),
      rail: new RailCountsReader(context, (actor) => sharing.reader.unread(actor)),
    }),
    ...photoDuplicateRoutes(store, inputs.duplicates, new StacksService(context)),
    ...photoPlaceRoutes(store, new PlaceQueries(context)),
    ...photoMediaRoutes(store, new PhotoMedia(context, inputs.read, store)),
    ...photoSourceRoutes(store, sourcesOf(inputs)),
    ...photoBackupRoutes(store, photoBackupService(inputs)),
    ...photoFolderRoutes(store, new PhotoFolderService(store, inputs.env.now)),
    ...photoAiRoutes(
      store,
      inputs.ai,
      new PhotoModelCatalogue(store, () => inputs.openRouter.client.zdrModelIds()),
    ),
    ...photoPeople({ store, ai: inputs.ai, timeZone: () => store.settings.read().time_zone }),
    ...sharing.routes,
    ...photoEditRoutes(
      store,
      photoEditDeps({ ...inputs, eraserModel: () => inputs.ai.models.read().eraser }),
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
      timeZone: () => store.settings.read().time_zone,
    }),
    meta: new PlacedMetaEditor(store, inputs.places),
  };
}
