import {
  type ImageOperationPreview,
  type ImageOperationReceipt,
  type ImageProviderCatalog,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { AssistantFiles } from '../assistant/files';
import { ImageOperationService, type ImageActor } from '../assistant/image/service';
import { OpenRouterImageCatalog } from '../openrouter/image-catalog';
import { OpenRouterImageProvider } from '../openrouter/image-provider';
import type { Store } from '../store/store';
import type { MediaNotes } from '../transcripts/media-notes';
import type { Caller } from './auth';
import { imageActorOf } from './image-authority';
import { ImageAdmissionError } from './image-admission';
import { imageReadiness } from './image-readiness';

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
  readonly catalog: OpenRouterImageCatalog;
  readonly configured: () => boolean;
  readonly actor: (caller: Caller) => ImageActor;
  readonly readCatalog: (
    caller: Caller,
    chatId?: string,
    refresh?: boolean,
  ) => Promise<ImageProviderCatalog>;
  readonly bindSpend: (check: (background: boolean) => void) => void;
  readonly stop: () => Promise<void>;
}
const CATALOG_TIMEOUT_MS = 20_000;
export function createImageRuntime(options: ImageRuntimeOptions): ImageRuntime {
  const catalog = new OpenRouterImageCatalog(options.fetch);
  const service = createImageService(options, catalog);
  const configured = (): boolean => options.key() !== null;
  let spend: ((background: boolean) => void) | null = null;
  const actor = (caller: Caller): ImageActor =>
    imageActorOf(
      {
        store: options.store,
        configured,
        now: options.now,
        spend: (background): void => {
          if (spend === null)
            throw new ImageAdmissionError(
              'budget_unavailable',
              'Image spending admission is not ready.',
            );
          spend(background);
        },
      },
      caller,
    );
  const discovery = imageCatalogReader({ options, actor, service, catalog, configured });
  return {
    service,
    catalog,
    configured,
    actor,
    readCatalog: discovery.read,
    bindSpend: (check): void => {
      spend = check;
    },
    stop: async (): Promise<void> => {
      const metadata = discovery.stop();
      await service.stop();
      await metadata;
    },
  };
}
interface ImageCatalogReader {
  readonly options: ImageRuntimeOptions;
  readonly actor: (caller: Caller) => ImageActor;
  readonly service: ImageOperationService;
  readonly catalog: OpenRouterImageCatalog;
  readonly configured: () => boolean;
}
function imageCatalogReader(runtime: ImageCatalogReader): {
  readonly read: ImageRuntime['readCatalog'];
  readonly stop: () => Promise<void>;
} {
  let refreshing: Promise<readonly unknown[]> | null = null;
  const controller = new AbortController();
  const read: ImageRuntime['readCatalog'] = async (
    caller,
    chatId,
    refresh,
  ): Promise<ImageProviderCatalog> => {
    const reader = runtime.actor(caller);
    const readiness = imageReadiness(runtime.service, runtime.configured(), reader, chatId);
    if (!controller.signal.aborted && (refresh === true || runtime.catalog.list().length === 0)) {
      try {
        refreshing ??= runtime.catalog
          .refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(CATALOG_TIMEOUT_MS)]))
          .finally(() => {
            refreshing = null;
          });
        await refreshing;
      } catch (cause) {
        runtime.options.log.warn('image.catalog_unavailable', {
          code: cause instanceof Error ? cause.name : 'metadata',
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
    }
    return {
      endpoints: [...runtime.catalog.list()],
      readiness: imageReadiness(runtime.service, runtime.configured(), reader, chatId),
    };
  };
  return {
    read,
    stop: () => settleImageMetadata(controller, refreshing),
  };
}
function createImageService(
  options: ImageRuntimeOptions,
  catalog: OpenRouterImageCatalog,
): ImageOperationService {
  return new ImageOperationService({
    store: options.store,
    repository: options.store.imageOperations,
    files: options.files,
    notes: options.notes,
    catalog,
    provider: new OpenRouterImageProvider({ fetch: options.fetch, key: options.key }),
    now: options.now,
    publish: options.publish,
    preview: options.preview,
    failed: (operationId, code): void => {
      options.log.warn('image.failed', { operationId, code });
    },
  });
}

async function settleImageMetadata(
  controller: AbortController,
  pending: Promise<readonly unknown[]> | null,
): Promise<void> {
  controller.abort();
  if (pending === null) return;
  await Promise.allSettled([pending]);
}
