import {
  ApiError,
  PHOTO_ANALYSIS,
  type UsageEntry,
  type PhotoAnalysis,
  type PhotoAiReanalyse,
  type PhotoAiModelsUpdate,
  type PhotoAiStatus,
  type PhotoFaceDevice,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { photoVisibleSql } from '../membership';
import { PhotoConsent, type ConsentSwitches } from './consent';
import { PHOTOS_AI_AREA } from './defaults';
import { PhotoAiModelStore } from './settings';
import { PhotoAiReanalysis } from './reanalyse';
import { PhotoAiRetry } from './retry';
import { PhotoAiStatusReader } from './status';

const PRESENT = z.strictObject({ id: z.string() });

const BODY = z.strictObject({ body: z.string() });

const log = new Logger(PHOTOS_AI_AREA);

export interface StatusQuery {
  readonly profileId: string;
  readonly hasKey: boolean;
  readonly faceDevice: PhotoFaceDevice;
}

export type StatusDevice = Omit<StatusQuery, 'profileId'>;

function statusReaderOf(store: HostStore, device: StatusDevice): PhotoAiStatusReader {
  return new PhotoAiStatusReader({
    context: store.context,
    ledger: store.ledger,
    consent: new PhotoConsent(store, log),
    models: new PhotoAiModelStore(store),
    ownerIds: (): readonly string[] => store.personAccess.ownerIds(),
    homeOwner: (): string => store.personAccess.homeOwner(),
    hasKey: (): boolean => device.hasKey,
    faceDevice: (): PhotoFaceDevice => device.faceDevice,
    now: (): Date => store.now(),
  });
}

function statusOf(store: HostStore, query: StatusQuery): PhotoAiStatus {
  return statusReaderOf(store, query).read(query.profileId);
}

function reanalysed(
  store: HostStore,
  input: { readonly device: StatusDevice; readonly request: PhotoAiReanalyse },
): { readonly estimateMicros: number } {
  return new PhotoAiReanalysis({
    context: store.context,
    consent: new PhotoConsent(store, log),
    models: new PhotoAiModelStore(store),
    status: statusReaderOf(store, input.device),
    owner: (): string => store.personAccess.homeOwner(),
  }).forget(input.request);
}

function retried(
  store: HostStore,
  input: { readonly device: StatusDevice; readonly profileId: string },
): void {
  new PhotoAiRetry({
    context: store.context,
    consent: new PhotoConsent(store, log),
    status: statusReaderOf(store, input.device),
    ownerIds: (): readonly string[] => store.personAccess.ownerIds(),
  }).forgetFailed(input.profileId);
}

function analysisOf(store: HostStore, actor: DriveActor, itemId: string): PhotoAnalysis {
  const { context } = store;
  const visible = context.sql.get(
    PRESENT,
    `select i.id from drive_items i join drive_roots r on r.id = i.root_id
      where i.id = $itemId and ${photoVisibleSql()}`,
    { itemId, profile: actor.profileId },
  );
  if (visible === undefined) throw new ApiError('not_found', 'That photo is not in your Photos.');
  const row = store.photoAnalysis.find(itemId);
  if (row?.state !== 'done') {
    return PHOTO_ANALYSIS.parse({
      itemId,
      state: row?.state ?? 'skipped',
      caption: null,
      scene: null,
      labels: [],
      text: null,
    });
  }
  const text = context.sql.get(
    BODY,
    `select s.body from drive_item_text t
      join drive_item_text_search s on s.rowid = t.rowid where t.item_id = $itemId`,
    { itemId },
  );
  return PHOTO_ANALYSIS.parse({
    itemId,
    state: 'done',
    caption: row.caption,
    scene: row.scene,
    labels: row.labels,
    text: text?.body ?? null,
  });
}

export const PHOTO_AI_STATUS_UNIT = storeUnit((store, input: StatusQuery) =>
  statusOf(store, input),
);

export const PHOTO_ANALYSIS_UNIT = storeUnit(
  (store, input: { readonly actor: DriveActor; readonly itemId: string }) =>
    analysisOf(store, input.actor, input.itemId),
);

export const PHOTO_AI_REANALYSE_UNIT = storeUnit(reanalysed);

export const PHOTO_AI_RETRY_UNIT = storeUnit(retried);

export const PHOTO_AI_MODELS_UNIT = storeUnit((store, _input: null) =>
  new PhotoAiModelStore(store).read(),
);

export const PHOTO_AI_MODELS_UPDATE_UNIT = storeUnit((store, input: PhotoAiModelsUpdate) =>
  new PhotoAiModelStore(store).update(input),
);

export const PHOTO_AI_SWITCHES_UNIT = storeUnit(
  (store, input: { readonly profileId: string; readonly change: Partial<ConsentSwitches> }) =>
    new PhotoConsent(store, log).apply(input.profileId, input.change),
);

export const PHOTO_AI_SMART_SEARCH_UNIT = storeUnit(
  (store, input: { readonly profileId: string }) => ({
    allowed: new PhotoConsent(store, log).smartSearch(input.profileId),
    model: new PhotoAiModelStore(store).read().embedding,
  }),
);

export const PHOTO_USAGE_RECORD_UNIT = storeUnit((store, entry: UsageEntry): void => {
  store.ledger.record(entry);
});
