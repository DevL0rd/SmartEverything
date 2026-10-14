import {
  IMAGE_AREA_ENDPOINTS as E,
  ApiError,
  type ImageProviderCatalog,
} from '@smarteverything/domain';
import type { ImageActor, ImageOperationService } from '../../assistant/image/service';
import type { Caller } from '../auth';
import { bound, type Bound } from '../router';
import { currentRequestSignal } from '../request-signal';

export interface ImageRouteContext {
  readonly images: ImageOperationService;
  readonly imageActor: (caller: Caller) => ImageActor;
  readonly imageCatalog: (
    caller: Caller,
    chatId?: string,
    refresh?: boolean,
  ) => Promise<ImageProviderCatalog>;
}
export type ImageRoutes = Record<keyof typeof E, Bound>;
export function imageRoutes(context: ImageRouteContext): ImageRoutes {
  const { images, imageActor } = context;
  return {
    listImageEndpoints: bound(E.listImageEndpoints, ({ caller, query }) =>
      context.imageCatalog(caller, query.chat_id, query.refresh),
    ),
    resolveImageInput: bound(E.resolveImageInput, ({ caller, body }) =>
      images.resolve(imageActor(caller), body.chat_id, body.selector),
    ),
    startImageOperation: bound(E.startImageOperation, ({ caller, body }) =>
      images.start(imageActor(caller), body),
    ),
    waitForImages: bound(E.waitForImages, ({ caller, body }) => {
      if (caller.kind !== 'client' && caller.kind !== 'service')
        throw new ApiError('forbidden', 'Image waits require an authenticated initiating profile.');
      if (caller.chatId === undefined || caller.chatId === null)
        throw new ApiError('forbidden', 'Image waits require a trusted initiating chat.');
      return images.wait(imageActor(caller), caller.chatId, body, currentRequestSignal());
    }),
    listImageOperations: bound(E.listImageOperations, ({ caller, query }) =>
      images.list(imageActor(caller), query.chat_id),
    ),
    readImageOperation: bound(E.readImageOperation, ({ caller, params }) =>
      images.read(imageActor(caller), params.operationId),
    ),
    cancelImageOperation: bound(E.cancelImageOperation, ({ caller, params }) =>
      images.cancel(imageActor(caller), params.operationId),
    ),
  };
}
