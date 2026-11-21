import type { PhotoAiModels } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { storeUnit } from '../../store/host/unit';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import {
  DriveMediaJobsRepository,
  type DriveMediaJob,
} from '../../store/repositories/drive-media-jobs';
import type { PhotoAnalysisRow, PhotoPet } from '../../store/repositories/photo-analysis';
import type { PhotoEmbedding } from '../../store/repositories/photo-embeddings';
import type { PhotoFaceRow } from '../../store/repositories/photo-faces';
import { inList } from '../../store/sql';
import type { Store } from '../../store/store';
import { PhotoConsent, type ConsentSwitches } from './consent';
import { PHOTOS_AI_AREA } from './defaults';
import type { MediaItem } from './env';
import { placeNameOf } from './place';
import type { PhotoAiKind } from './queue';
import { PhotoSearchLabels } from './search-labels';
import { PhotoAiModelStore } from './settings';

const log = new Logger(PHOTOS_AI_AREA);

const PRESENT = z.strictObject({ found: z.int() });

const OWNER = z.strictObject({ id: z.string() });

export interface AiJobRequest {
  readonly kind: PhotoAiKind;
  readonly itemId: string;
  readonly rev: number;
  readonly modelVersion: string;
  readonly rerun: boolean;
}

export interface AiJobTarget {
  readonly itemId: string;
  readonly rev: number;
}

export interface AiJobSource {
  readonly item: MediaItem;
  readonly subject: string;
  readonly switches: ConsentSwitches;
  readonly models: PhotoAiModels;
  readonly analysis: PhotoAnalysisRow | undefined;
  readonly playableReady: boolean;
  readonly place: string | null;
}

export interface AiSubjects {
  readonly homeOwner: string;
  readonly models: PhotoAiModels;
  readonly subjects: readonly { readonly profileId: string; readonly switches: ConsentSwitches }[];
}

export type VisionResult =
  | { readonly state: 'needs_key' }
  | {
      readonly state: 'done';
      readonly caption: string;
      readonly scene: string;
      readonly labels: readonly string[];
      readonly text: string | null;
      readonly pets: readonly PhotoPet[];
      readonly words: readonly string[];
    };

export interface VisionSettle extends AiJobTarget {
  readonly subject: string;
  readonly model: string;
  readonly result: VisionResult;
}

const NEEDS_KEY_RESUME = [
  `delete from drive_media_jobs where kind = 'vision' and item_id in
    (select item_id from photo_analysis where state = 'needs_key')`,
  `delete from drive_media_jobs where kind = 'embed' and state = 'done'
    and not exists (select 1 from photo_embeddings e
      where e.item_id = drive_media_jobs.item_id and e.rev = drive_media_jobs.rev)`,
  `delete from drive_media_jobs where kind = 'pet_embed' and state = 'done'
    and not exists (select 1 from photo_faces f
      where f.item_id = drive_media_jobs.item_id and f.rev = drive_media_jobs.rev and f.kind = 'pet')`,
] as const;

function consentOf(store: Store): PhotoConsent {
  return new PhotoConsent(store, log);
}

function isCurrent(store: Store, target: AiJobTarget): boolean {
  return store.driveItems.find(target.itemId, null)?.rev === target.rev;
}

function requested(store: Store, request: AiJobRequest): DriveMediaJob | null {
  const { kind, itemId, rev, modelVersion } = request;
  if (request.rerun)
    store.context.sql.run(
      'forget the finished photo AI job so it can run again',
      `delete from drive_media_jobs
        where item_id = $itemId and rev = $rev and kind = $kind and state in ('done', 'failed')`,
      { itemId, rev, kind },
    );
  const exists = store.context.sql.get(
    PRESENT,
    `select 1 as found from drive_media_jobs
      where item_id = $itemId and rev = $rev and kind = $kind`,
    { itemId, rev, kind },
  );
  if (exists !== undefined) return null;
  return new DriveMediaJobsRepository(store.context).enqueue({ kind, itemId, rev, modelVersion });
}

export const PHOTO_AI_REQUEST_UNIT = storeUnit(
  (store, input: readonly AiJobRequest[]): DriveMediaJob[] =>
    input.flatMap((request) => {
      const job = requested(store, request);
      return job === null ? [] : [job];
    }),
);

export const PHOTO_AI_BUSY_UNIT = storeUnit(
  (store, input: { readonly kinds: readonly PhotoAiKind[] }): boolean => {
    const filter = inList('kind', 'kinds', input.kinds);
    return (
      store.context.sql.get(
        PRESENT,
        `select 1 as found from drive_media_jobs
          where state in ('queued', 'running') and ${filter.text} limit 1`,
        filter.parameters,
      ) !== undefined
    );
  },
);

export const PHOTO_AI_SUBJECTS_UNIT = storeUnit((store, _input: null): AiSubjects => {
  const consent = consentOf(store);
  const homeOwner = store.personAccess.homeOwner();
  const owners = store.context.sql.all(
    OWNER,
    'select distinct owner_profile_id as id from drive_roots where owner_profile_id is not null',
  );
  const profileIds = new Set([homeOwner, ...owners.map(({ id }) => id)]);
  return {
    homeOwner,
    models: new PhotoAiModelStore(store).read(),
    subjects: [...profileIds].map((profileId) => ({
      profileId,
      switches: consent.switches(profileId),
    })),
  };
});

export const PHOTO_AI_RESUME_KEY_UNIT = storeUnit((store, _input: null) => {
  for (const statement of NEEDS_KEY_RESUME)
    store.context.sql.run('queue the photo AI work that waited for a key', statement);
});

export const PHOTO_AI_SOURCE_UNIT = storeUnit(
  (store, input: AiJobTarget): AiJobSource | undefined => {
    const item = store.driveItems.find(input.itemId, null);
    if (item?.rev !== input.rev || (item.kind !== 'image' && item.kind !== 'video'))
      return undefined;
    const consent = consentOf(store);
    const subject = consent.subjectOfRoot(item.rootId);
    const media = new DriveMediaRepository(store.context).find(item.id);
    return {
      item,
      subject,
      switches: consent.switches(subject),
      models: new PhotoAiModelStore(store).read(),
      analysis: store.photoAnalysis.find(item.id),
      playableReady: media?.playable_state === 'ready',
      place: placeNameOf(store.context, media?.place_id ?? null),
    };
  },
);

export const PHOTO_VISION_SETTLE_UNIT = storeUnit((store, input: VisionSettle): boolean => {
  const now = store.driveItems.find(input.itemId, null);
  if (now?.rev !== input.rev || !consentOf(store).smartSearch(input.subject)) return false;
  const base = { itemId: input.itemId, rev: input.rev, model: input.model, error: null };
  const { result } = input;
  if (result.state === 'needs_key') {
    store.photoAnalysis.save({
      ...base,
      state: 'needs_key',
      caption: null,
      scene: null,
      labels: [],
      text: null,
      pets: [],
    });
    return false;
  }
  store.photoAnalysis.save({
    ...base,
    state: 'done',
    caption: result.caption,
    scene: result.scene,
    labels: result.labels,
    text: result.text,
    pets: result.pets,
  });
  store.driveItemText.put(
    result.text === null
      ? { itemId: input.itemId, rev: input.rev, source: 'image', state: 'empty' }
      : { itemId: input.itemId, rev: input.rev, source: 'image', state: 'ok', body: result.text },
  );
  new PhotoSearchLabels(store.context).write(now, result.words);
  if (result.pets.length === 0) store.photoFaces.replaceKindForItem(input.itemId, 'pet', []);
  return true;
});

export const PHOTO_VISION_FAIL_UNIT = storeUnit(
  (store, input: AiJobTarget & { readonly error: string }): boolean => {
    if (!isCurrent(store, input)) return false;
    store.photoAnalysis.save({
      itemId: input.itemId,
      rev: input.rev,
      model: new PhotoAiModelStore(store).read().vision,
      state: 'failed',
      caption: null,
      scene: null,
      labels: [],
      text: null,
      pets: [],
      error: input.error,
    });
    return true;
  },
);

export const PHOTO_EMBEDDING_SAVE_UNIT = storeUnit(
  (store, input: { readonly subject: string; readonly embedding: PhotoEmbedding }): boolean => {
    const { embedding } = input;
    if (!isCurrent(store, embedding) || !consentOf(store).smartSearch(input.subject)) return false;
    store.photoEmbeddings.save(embedding);
    return true;
  },
);

export const PHOTO_FACES_SAVE_UNIT = storeUnit(
  (
    store,
    input: AiJobTarget & {
      readonly subject: string;
      readonly kind: 'person' | 'pet';
      readonly faces: readonly PhotoFaceRow[];
    },
  ): boolean => {
    const consent = consentOf(store);
    const allowed =
      input.kind === 'person'
        ? consent.faceGrouping(input.subject)
        : consent.smartSearch(input.subject);
    if (!isCurrent(store, input) || !allowed) return false;
    store.photoFaces.replaceKindForItem(input.itemId, input.kind, input.faces);
    return true;
  },
);
