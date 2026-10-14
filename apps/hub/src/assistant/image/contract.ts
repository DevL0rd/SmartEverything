import type {
  ImageOperationReceipt,
  ImageOperationPreview,
  ImageOperationOrigin,
} from '@smarteverything/domain';
import type { AssistantFiles } from '../files';
import type { OpenRouterImageCatalog } from '../../openrouter/image-catalog';
import type { OpenRouterImageProvider } from '../../openrouter/image-provider';
import type { ImageOperationsRepository } from '../../store/repositories/image-operations';
import type { Store } from '../../store/store';
import type { MediaNotes } from '../../transcripts/media-notes';

export type ImageEffect = 'read' | 'wait' | 'provider' | 'persist';
export interface ImageActor {
  readonly profileId: string;
  readonly key: string;
  readonly origin?: ImageOperationOrigin;
  readonly signal?: AbortSignal;
  readonly authorize: (effect: ImageEffect, chatId: string) => void;
}
export interface ImageServiceOptions {
  readonly store: Store;
  readonly repository: ImageOperationsRepository;
  readonly files: AssistantFiles;
  readonly notes?: Pick<MediaNotes, 'later'>;
  readonly catalog: OpenRouterImageCatalog;
  readonly provider: OpenRouterImageProvider;
  readonly now: () => Date;
  readonly publish: (receipt: ImageOperationReceipt) => void;
  readonly preview?: (preview: ImageOperationPreview) => void;
  readonly failed: (operationId: string, code: string) => void;
}
