import { randomUUID } from 'node:crypto';
import {
  IMAGE_AREA_ENDPOINTS as E,
  editRequestOf,
  generateRequestOf,
  type ImageModelChoice,
  type ImageProviderCatalog,
} from '@smarteverything/domain';
import type { ImageActor, ImageOperationService } from '../../assistant/image/service';
import type { Caller } from '../auth';
import { bound } from '../router';
import { currentRequestSignal } from '../request-signal';

export interface ImageRouteContext {
  readonly images: ImageOperationService;
  readonly imageActor: (caller: Caller) => ImageActor;
  readonly selectedImageModel: () => ImageModelChoice | null;
  readonly imageCatalog: (
    caller: Caller,
    chatId?: string,
    refresh?: boolean,
  ) => Promise<ImageProviderCatalog>;
}
export const imageRoutes = ({
  images,
  imageActor,
  imageCatalog,
  selectedImageModel,
}: ImageRouteContext) =>
  ({
    listImageEndpoints: bound(E.listImageEndpoints, ({ caller, query }) =>
      imageCatalog(caller, query.chat_id, query.refresh),
    ),
    generateImageOperation: bound(E.generateImageOperation, ({ caller, body }) =>
      images.run(
        imageActor(caller),
        generateRequestOf(body, body.operationId ?? randomUUID(), selectedImageModel()),
        currentRequestSignal(),
      ),
    ),
    editImageOperation: bound(E.editImageOperation, ({ caller, body }) =>
      images.run(
        imageActor(caller),
        editRequestOf(body, body.operationId ?? randomUUID(), selectedImageModel()),
        currentRequestSignal(),
      ),
    ),
    listImageOperations: bound(E.listImageOperations, ({ caller, query }) =>
      images.list(imageActor(caller), query.chat_id),
    ),
    readImageOperation: bound(E.readImageOperation, ({ caller, params }) =>
      images.read(imageActor(caller), params.operationId),
    ),
    cancelImageOperation: bound(E.cancelImageOperation, ({ caller, params }) =>
      images.cancel(imageActor(caller), params.operationId),
    ),
  }) as const;
