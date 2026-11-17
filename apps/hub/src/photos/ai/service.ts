import { randomUUID } from 'node:crypto';
import type {
  DriveItem,
  PhotoAiStatus,
  PhotoAnalysis,
  PhotoFaceDevice,
} from '@smarteverything/domain';
import { ApiError, PHOTO_ANALYSIS } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { DriveActor } from '../../drive/access';
import type { OpenRouterClient } from '../../openrouter/client';
import { OpenRouterEmbeddings } from '../../openrouter/embeddings';
import type { OpenRouterKeys } from '../../openrouter/keys';
import type { PhotosMeter } from '../../openrouter/photos-usage';
import { needsKey, OpenRouterVision } from '../../openrouter/vision';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { Store } from '../../store/store';
import type { HubLayout } from '../../data-layout';
import { photoVisibleSql } from '../membership';
import type { MediaJobRunner } from '../pipeline/jobs';
import { EMBEDDING_DIMENSIONS, PHOTOS_AI_AREA } from './defaults';
import { EmbedHandler, type EmbeddingClient } from './embed-job';
import type { AiEnvironment, AiStore } from './env';
import { FacesHandler, type FaceDetector } from './faces-job';
import { PhotoVectorIndex, type MeaningHit } from './index';
import { PetEmbedHandler } from './pet-job';
import { PhotoConsent } from './consent';
import { PhotoAiQueue, type AiNotice } from './queue';
import { PhotoAiReanalysis } from './reanalyse';
import { PhotoAiRetry } from './retry';
import { PhotoAiScheduler } from './scheduler';
import { PhotoSearchLabels } from './search-labels';
import { PhotoAiModelStore } from './settings';
import { PhotoAiStatusReader } from './status';
import { VisionHandler, type VisionClient } from './vision-job';

export type PhotoAiStore = AiStore &
  Pick<Store, 'feed' | 'ledger' | 'personal' | 'personAccess' | 'settingsKv' | 'now'>;

export interface PhotoAiOptions {
  readonly store: PhotoAiStore;
  readonly layout: Pick<HubLayout, 'cache' | 'tmp'>;
  readonly log: Logger;
  readonly runner: Pick<MediaJobRunner, 'register' | 'request'>;
  readonly keys: Pick<OpenRouterKeys, 'current' | 'onChange'>;
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly detector: FaceDetector;
  readonly vision: VisionClient;
  readonly embeddings: EmbeddingClient;
}

export function openRouterClients(
  client: OpenRouterClient,
  store: Pick<Store, 'ledger'>,
  tmp: string,
): { readonly vision: VisionClient; readonly embeddings: EmbeddingClient } {
  const meter: PhotosMeter = (entry) => {
    store.ledger.record(entry);
  };
  return {
    vision: new OpenRouterVision(client, tmp, meter),
    embeddings: new OpenRouterEmbeddings(client, meter),
  };
}

const PRESENT = z.strictObject({ id: z.string() });

const BODY = z.strictObject({ body: z.string() });

export class PhotoAi {
  readonly index: PhotoVectorIndex;
  readonly queue: PhotoAiQueue;
  readonly scheduler: PhotoAiScheduler;
  readonly status: PhotoAiStatusReader;
  readonly models: PhotoAiModelStore;
  readonly consent: PhotoConsent;
  private readonly reanalysis: PhotoAiReanalysis;
  private readonly retry: PhotoAiRetry;
  private readonly facesIdle = new Set<(profileId: string) => void>();
  private readonly touched = new Set<string>();
  private readonly log: Logger;

  constructor(private readonly options: PhotoAiOptions) {
    const { store } = options;
    this.log = options.log.forArea(PHOTOS_AI_AREA);
    this.models = new PhotoAiModelStore(store);
    this.consent = new PhotoConsent(store, this.log);
    this.index = new PhotoVectorIndex(store.photoEmbeddings);
    const notice: AiNotice = (value) => {
      store.feed.notice(value);
    };
    this.queue = new PhotoAiQueue(store.context, options.runner, notice);
    this.status = new PhotoAiStatusReader({
      context: store.context,
      ledger: store.ledger,
      consent: this.consent,
      models: this.models,
      ownerIds: (): readonly string[] => store.personAccess.ownerIds(),
      homeOwner: (): string => store.personAccess.homeOwner(),
      hasKey: (): boolean => options.keys.current() !== null,
      faceDevice: (): PhotoFaceDevice => options.detector.device(),
      now: store.now,
    });
    this.scheduler = new PhotoAiScheduler({
      store,
      feed: store.feed,
      keys: options.keys,
      queue: this.queue,
      consent: this.consent,
      models: this.models,
      index: this.index,
      log: this.log,
    });
    this.reanalysis = new PhotoAiReanalysis({
      context: store.context,
      consent: this.consent,
      models: this.models,
      status: this.status,
      owner: (): string => store.personAccess.homeOwner(),
      reconcile: (): number => this.scheduler.reconcile(),
    });
    this.retry = new PhotoAiRetry({
      context: store.context,
      consent: this.consent,
      status: this.status,
      ownerIds: (): readonly string[] => store.personAccess.ownerIds(),
      reconcile: (): number => this.scheduler.reconcile(),
    });
  }

  start(): void {
    const env = this.environment();
    const { runner } = this.options;
    const touched = (profileId: string): void => {
      this.touched.add(profileId);
    };
    runner.register(
      'faces',
      this.queue.tracked(new FacesHandler(env, this.options.detector, touched)),
    );
    runner.register('vision', this.queue.tracked(new VisionHandler(env, this.options.vision)));
    runner.register('embed', this.queue.tracked(new EmbedHandler(env, this.options.embeddings)));
    runner.register(
      'pet_embed',
      this.queue.tracked(new PetEmbedHandler(env, this.options.embeddings, touched)),
    );
    this.queue.onDrained((stage) => {
      if (stage === 'faces') this.drained();
    });
    this.scheduler.start();
  }

  stop(): void {
    this.scheduler.stop();
  }

  onFacesIdle(listener: (profileId: string) => void): () => void {
    this.facesIdle.add(listener);
    return (): void => {
      this.facesIdle.delete(listener);
    };
  }

  statusOf(actor: DriveActor): PhotoAiStatus {
    return this.status.read(actor.profileId);
  }

  setSwitches(
    actor: DriveActor,
    change: {
      readonly smartSearch?: boolean | undefined;
      readonly faceGrouping?: boolean | undefined;
    },
  ): PhotoAiStatus {
    this.consent.apply(actor.profileId, {
      ...(change.smartSearch === undefined ? {} : { smartSearch: change.smartSearch }),
      ...(change.faceGrouping === undefined ? {} : { faceGrouping: change.faceGrouping }),
    });
    return this.status.read(actor.profileId);
  }

  reanalyse(confirmedMicros: number): ReturnType<PhotoAiReanalysis['run']> {
    return this.reanalysis.run(confirmedMicros);
  }

  retryFailed(actor: DriveActor): PhotoAiStatus {
    this.retry.run(actor.profileId);
    return this.status.read(actor.profileId);
  }

  async meaning(
    actor: DriveActor,
    text: string,
    minScore: number,
    signal?: AbortSignal,
  ): Promise<MeaningHit[]> {
    if (!this.consent.smartSearch(actor.profileId)) return [];
    const model = this.models.read().embedding;
    const result = await this.options.embeddings
      .embed({
        model,
        input: [text],
        dimensions: EMBEDDING_DIMENSIONS,
        metering: { profileId: actor.profileId, kind: 'embedding', itemId: null },
        ...(signal === undefined ? {} : { signal }),
      })
      .catch((cause: unknown) => {
        if (needsKey(cause)) return undefined;
        throw cause;
      });
    const vector = result?.vectors[0];
    return vector === undefined ? [] : this.index.search(vector, model, minScore);
  }

  analysisOf(actor: DriveActor, itemId: string): PhotoAnalysis {
    const { context } = this.options.store;
    const visible = context.sql.get(
      PRESENT,
      `select i.id from drive_items i join drive_roots r on r.id = i.root_id
        where i.id = $itemId and ${photoVisibleSql()}`,
      { itemId, profile: actor.profileId },
    );
    if (visible === undefined) throw new ApiError('not_found', 'That photo is not in your Photos.');
    const row = this.options.store.photoAnalysis.find(itemId);
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

  private environment(): AiEnvironment {
    const { store, layout, locate } = this.options;
    return {
      store,
      media: new DriveMediaRepository(store.context),
      layout,
      log: this.log,
      consent: this.consent,
      models: this.models,
      queue: this.queue,
      index: this.index,
      labels: new PhotoSearchLabels(store.context),
      locate,
      newId: randomUUID,
    };
  }

  private drained(): void {
    const profiles = [...this.touched];
    this.touched.clear();
    for (const profileId of profiles) for (const listener of this.facesIdle) listener(profileId);
  }
}
