import type { PhotoSource } from '@smarteverything/domain';
import type { ConflictEnv } from '../../drive/conflicts';
import type { DriveReadService } from '../../drive/service-read';
import { photoBackupRoutes, type PhotoBackupRoutes } from '../../photos/backup-routes';
import { BackupService } from '../../photos/backup';
import { photoDuplicateRoutes, type PhotoDuplicateRoutes } from '../../photos/duplicates-routes';
import type { DuplicatesService } from '../../photos/duplicates';
import { InsightsReader } from '../../photos/insights';
import { RailCountsReader } from '../../photos/insights-rail';
import { photoInsightRoutes, type PhotoInsightRoutes } from '../../photos/insights-routes';
import { PhotoMedia, photoMediaRoutes, type PhotoMediaRoutes } from '../../photos/media-routes';
import { PlaceQueries } from '../../photos/places-queries';
import { photoPlaceRoutes, type PhotoPlaceRoutes } from '../../photos/places-routes';
import { AiImageSource } from '../../photos/sources/ai-images';
import { CameraSource } from '../../photos/sources/cameras';
import { photoSourceRoutes, type PhotoSourceRoutes } from '../../photos/sources/routes';
import type { SourceService } from '../../photos/sources/shapes';
import { StacksService } from '../../photos/stacks';
import { DriveBackupRepository } from '../../store/repositories/drive-backup';
import type { Store } from '../../store/store';
import { photoReaders, photosRoutes, type PhotoRoutes } from './photos';

export interface PhotoHubInputs {
  readonly store: Store;
  readonly env: ConflictEnv;
  readonly read: DriveReadService;
  readonly duplicates: DuplicatesService;
  readonly recordingPath: (storagePath: string) => string;
  readonly attachmentPath: (storagePath: string) => string;
  readonly permittedCameras: () => readonly string[];
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
  PhotoBackupRoutes;

export function photoHubRoutes(inputs: PhotoHubInputs): PhotoHubRoutes {
  const { store } = inputs;
  const { context } = store;
  const readers = photoReaders(context);
  return {
    ...photosRoutes(store, readers),
    ...photoInsightRoutes(store, {
      insights: new InsightsReader(context),
      rail: new RailCountsReader(context, readers.memories),
    }),
    ...photoDuplicateRoutes(store, inputs.duplicates, new StacksService(context)),
    ...photoPlaceRoutes(store, new PlaceQueries(context)),
    ...photoMediaRoutes(store, new PhotoMedia(context, inputs.read, store)),
    ...photoSourceRoutes(store, sourcesOf(inputs)),
    ...photoBackupRoutes(store, photoBackupService(inputs)),
  };
}
