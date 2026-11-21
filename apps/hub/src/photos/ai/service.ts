import { randomUUID } from 'node:crypto';
import type {
  DriveItem,
  PhotoAiModels,
  PhotoAiModelsUpdate,
  PhotoAiReanalyse,
  PhotoAiReanalysed,
  PhotoAiStatus,
  PhotoAnalysis,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DriveActor } from '../../drive/access';
import type { OpenRouterClient } from '../../openrouter/client';
import { OpenRouterEmbeddings } from '../../openrouter/embeddings';
import type { OpenRouterKeys } from '../../openrouter/keys';
import type { PhotosMeter } from '../../openrouter/photos-usage';
import { needsKey, OpenRouterVision } from '../../openrouter/vision';
import type { Store } from '../../store/store';
import type { HubLayout } from '../../data-layout';
import type { MediaJobRunner } from '../pipeline/jobs';
import { EMBEDDING_DIMENSIONS, PHOTOS_AI_AREA } from './defaults';
import { EmbedHandler, type EmbeddingClient } from './embed-job';
import type { AiEnvironment } from './env';
import { FacesHandler, type FaceDetector } from './faces-job';
import { PhotoVectorIndex, type MeaningHit } from './index';
import { PetEmbedHandler } from './pet-job';
import { PhotoAiQueue, type AiNotice } from './queue';
import { PhotoAiScheduler } from './scheduler';
import type { StatusDevice } from './units';
import { VisionHandler, type VisionClient } from './vision-job';

export type PhotoAiStore = Pick<
  Store,
  | 'driveRoots'
  | 'photoEmbeddings'
  | 'context'
  | 'feed'
  | 'ledger'
  | 'personal'
  | 'personAccess'
  | 'settingsKv'
  | 'now'
  | 'reader'
  | 'driveFeed'
  | 'host'
>;

export interface PhotoAiOptions {
  readonly store: PhotoAiStore;
  readonly layout: Pick<HubLayout, 'cache' | 'tmp'>;
  readonly log: Logger;
  readonly runner: Pick<MediaJobRunner, 'register' | 'adopt' | 'onTouched'>;
  readonly keys: Pick<OpenRouterKeys, 'current' | 'onChange'>;
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly detector: FaceDetector;
  readonly vision: VisionClient;
  readonly embeddings: EmbeddingClient;
}

export function openRouterClients(
  client: OpenRouterClient,
  store: Pick<Store, 'host'>,
  tmp: string,
): { readonly vision: VisionClient; readonly embeddings: EmbeddingClient } {
  const meter: PhotosMeter = (entry) => store.host.write('photoUsageRecord', entry);
  return {
    vision: new OpenRouterVision(client, tmp, meter),
    embeddings: new OpenRouterEmbeddings(client, meter),
  };
}

export class PhotoAi {
  readonly index: PhotoVectorIndex;
  readonly queue: PhotoAiQueue;
  readonly scheduler: PhotoAiScheduler;
  private readonly facesIdle = new Set<(profileId: string) => void>();
  private readonly touched = new Set<string>();
  private readonly log: Logger;

  constructor(private readonly options: PhotoAiOptions) {
    const { store } = options;
    this.log = options.log.forArea(PHOTOS_AI_AREA);
    this.index = new PhotoVectorIndex(store.photoEmbeddings);
    const notice: AiNotice = (value) => {
      store.feed.notice(value);
    };
    this.queue = new PhotoAiQueue(store.host, options.runner, notice);
    this.scheduler = new PhotoAiScheduler({
      store,
      feed: store.feed,
      media: options.runner,
      keys: options.keys,
      queue: this.queue,
      index: this.index,
      log: this.log,
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

  stop(): Promise<void> {
    return this.scheduler.stop();
  }

  onFacesIdle(listener: (profileId: string) => void): () => void {
    this.facesIdle.add(listener);
    return (): void => {
      this.facesIdle.delete(listener);
    };
  }

  statusOf(actor: DriveActor): Promise<PhotoAiStatus> {
    return this.options.store.host.read('photoAiStatus', {
      profileId: actor.profileId,
      ...this.device(),
    });
  }

  models(): Promise<PhotoAiModels> {
    return this.options.store.host.read('photoAiModels', null);
  }

  updateModels(change: PhotoAiModelsUpdate): Promise<PhotoAiModels> {
    return this.options.store.host.write('photoAiModelsUpdate', change);
  }

  async setSwitches(
    actor: DriveActor,
    change: {
      readonly smartSearch?: boolean | undefined;
      readonly faceGrouping?: boolean | undefined;
    },
  ): Promise<PhotoAiStatus> {
    await this.options.store.host.write('photoAiSwitches', {
      profileId: actor.profileId,
      change: {
        ...(change.smartSearch === undefined ? {} : { smartSearch: change.smartSearch }),
        ...(change.faceGrouping === undefined ? {} : { faceGrouping: change.faceGrouping }),
      },
    });
    return this.statusOf(actor);
  }

  async reanalyse(request: PhotoAiReanalyse): Promise<PhotoAiReanalysed> {
    const { estimateMicros } = await this.options.store.host.write('photoAiReanalyse', {
      device: this.device(),
      request,
    });
    return { queued: await this.scheduler.reconcile(), estimateMicros };
  }

  async retryFailed(actor: DriveActor): Promise<PhotoAiStatus> {
    await this.options.store.host.write('photoAiRetry', {
      device: this.device(),
      profileId: actor.profileId,
    });
    await this.scheduler.reconcile();
    return this.statusOf(actor);
  }

  async meaning(
    actor: DriveActor,
    text: string,
    minScore: number,
    signal?: AbortSignal,
  ): Promise<MeaningHit[]> {
    const { allowed, model } = await this.options.store.host.read('photoAiSmartSearch', {
      profileId: actor.profileId,
    });
    if (!allowed) return [];
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

  analysisOf(actor: DriveActor, itemId: string): Promise<PhotoAnalysis> {
    return this.options.store.host.read('photoAnalysis', { actor, itemId });
  }

  private device(): StatusDevice {
    return {
      hasKey: this.options.keys.current() !== null,
      faceDevice: this.options.detector.device(),
    };
  }

  private environment(): AiEnvironment {
    const { store, layout, locate } = this.options;
    return {
      host: store.host,
      layout,
      log: this.log,
      queue: this.queue,
      index: this.index,
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
