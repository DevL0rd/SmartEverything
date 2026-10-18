import {
  type ImageOperationPreview,
  type ImageOperationReceipt,
  type ImageProviderCatalog,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AssistantFiles } from '../assistant/files';
import { ImageOperationService, type ImageActor } from '../assistant/image/service';
import { OpenRouterClient } from '../openrouter/client';
import { OpenRouterImageCatalog } from '../openrouter/image-catalog';
import { OpenRouterImageProvider } from '../openrouter/image-provider';
import type { Store } from '../store/store';
import type { MediaNotes } from '../transcripts/media-notes';
import type { Caller } from './auth';
import { imageActorOf, type ImageSpend } from './image-authority';
import { ImageAdmissionError } from './image-admission';
import { imageReadiness } from './image-readiness';
import { messageOf } from '@smarteverything/logging';

export interface ImageRuntimeOptions {
  readonly store: Store;
  readonly files: AssistantFiles;
  readonly notes: MediaNotes;
  readonly fetch: typeof fetch;
  readonly key: () => string | null;
  readonly now: () => Date;
  readonly publish: (receipt: ImageOperationReceipt) => void;
  readonly preview: (preview: ImageOperationPreview) => void;
  readonly log: Logger;
}
export interface ImageRuntime {
  readonly service: ImageOperationService;
  readonly configured: () => boolean;
  readonly actor: (caller: Caller) => ImageActor;
  readonly readCatalog: (
    caller: Caller,
    chatId?: string,
    refresh?: boolean,
  ) => Promise<ImageProviderCatalog>;
  readonly bindSpend: (check: (spend: ImageSpend) => void) => void;
  readonly stop: () => Promise<void>;
}
function spendGate(): {
  readonly bind: (check: (spend: ImageSpend) => void) => void;
  readonly check: (spend: ImageSpend) => void;
} {
  let spend: ((spend: ImageSpend) => void) | null = null;
  return {
    bind: (check): void => {
      spend = check;
    },
    check: (request): void => {
      if (spend === null)
        throw new ImageAdmissionError(
          'budget_unavailable',
          'Image spending admission is not ready.',
        );
      spend(request);
    },
  };
}
function serviceOf(
  options: ImageRuntimeOptions,
  client: OpenRouterClient,
  catalog: OpenRouterImageCatalog,
): ImageOperationService {
  return new ImageOperationService({
    store: options.store,
    repository: options.store.imageOperations,
    files: options.files,
    notes: options.notes,
    catalog,
    provider: new OpenRouterImageProvider(client),
    now: options.now,
    publish: options.publish,
    preview: options.preview,
    failed: (operationId, code): void => {
      options.log.warn('image.failed', { operationId, code });
    },
  });
}
export function createImageRuntime(options: ImageRuntimeOptions): ImageRuntime {
  const client = new OpenRouterClient({ fetch: options.fetch, key: options.key });
  const catalog = new OpenRouterImageCatalog({
    client,
    store: options.store.aiModels,
    now: options.now,
  });
  const service = serviceOf(options, client, catalog);
  const configured = (): boolean => options.key() !== null;
  const gate = spendGate();
  const actor = (caller: Caller): ImageActor =>
    imageActorOf({ store: options.store, configured, spend: gate.check }, caller);
  return {
    service,
    configured,
    actor,
    readCatalog: async (caller, chatId, refresh): Promise<ImageProviderCatalog> => {
      const readiness = imageReadiness(service, configured(), actor(caller), chatId);
      try {
        return { endpoints: [...(await catalog.list(refresh === true))], readiness };
      } catch (cause) {
        options.log.warn('image.catalog_unavailable', {
          reason: messageOf(cause),
        });
        return {
          endpoints: [],
          readiness: {
            ...readiness,
            ready: false,
            reason: 'catalog_unavailable',
            detail: 'The public image endpoint catalog is unavailable. Try again.',
          },
        };
      }
    },
    bindSpend: gate.bind,
    stop: async (): Promise<void> => {
      const metadata = catalog.stop();
      await service.stop();
      await metadata;
    },
  };
}
