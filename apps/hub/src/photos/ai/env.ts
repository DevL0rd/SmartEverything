import type { DriveItem } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../data-layout';
import type { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import type { Store } from '../../store/store';
import type { PhotoConsent } from './consent';
import type { PhotoVectorIndex } from './index';
import type { PhotoAiQueue } from './queue';
import type { PhotoSearchLabels } from './search-labels';
import type { PhotoAiModelStore } from './settings';

export type AiStore = Pick<
  Store,
  | 'driveItems'
  | 'driveRoots'
  | 'photoAnalysis'
  | 'photoEmbeddings'
  | 'photoFaces'
  | 'photoGroups'
  | 'context'
  | 'write'
>;

export interface AiEnvironment {
  readonly store: AiStore;
  readonly media: Pick<DriveMediaRepository, 'find'>;
  readonly layout: Pick<HubLayout, 'cache' | 'tmp'>;
  readonly log: Logger;
  readonly consent: PhotoConsent;
  readonly models: PhotoAiModelStore;
  readonly queue: PhotoAiQueue;
  readonly index: PhotoVectorIndex;
  readonly labels: PhotoSearchLabels;
  readonly locate: (item: DriveItem) => Promise<string>;
  readonly newId: () => string;
}

export type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

export function currentItem(env: AiEnvironment, job: DriveMediaJob): MediaItem | undefined {
  const item = env.store.driveItems.find(job.item_id, null);
  if (item?.rev !== job.rev) return undefined;
  return item.kind === 'image' || item.kind === 'video' ? item : undefined;
}

export function ignoreFailure(): void {
  return undefined;
}
