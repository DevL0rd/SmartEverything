import type { DriveItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../data-layout';
import type { StoreHost } from '../../store/host/host';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { PhotoVectorIndex } from './index';
import type { AiJobSource } from './job-units';
import type { PhotoAiQueue } from './queue';

export interface AiEnvironment {
  readonly host: StoreHost;
  readonly layout: Pick<HubLayout, 'cache' | 'tmp'>;
  readonly log: Logger;
  readonly queue: PhotoAiQueue;
  readonly index: PhotoVectorIndex;
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly newId: () => string;
}

export type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

export function sourceOf(env: AiEnvironment, job: DriveMediaJob): Promise<AiJobSource | undefined> {
  return env.host.read('photoAiSource', { itemId: job.item_id, rev: job.rev });
}

export function ignoreFailure(): Promise<void> {
  return Promise.resolve();
}
