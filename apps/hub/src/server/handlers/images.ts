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
  readonly imageActor: (caller: Caller) => Promise<ImageActor>;
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
    generateImageOperation: bound(E.generateImageOperation, async ({ caller, body }) =>
      images.run(
        await imageActor(caller),
        generateRequestOf(body, body.operationId ?? randomUUID(), selectedImageModel()),
        currentRequestSignal(),
      ),
    ),
    editImageOperation: bound(E.editImageOperation, async ({ caller, body }) =>
      images.run(
        await imageActor(caller),
        editRequestOf(body, body.operationId ?? randomUUID(), selectedImageModel()),
        currentRequestSignal(),
      ),
    ),
    listImageOperations: bound(E.listImageOperations, async ({ caller, query }) =>
      images.list(await imageActor(caller), query.chat_id),
    ),
    readImageOperation: bound(E.readImageOperation, async ({ caller, params }) =>
      images.read(await imageActor(caller), params.operationId),
    ),
    cancelImageOperation: bound(E.cancelImageOperation, async ({ caller, params }) =>
      images.cancel(await imageActor(caller), params.operationId),
    ),
  }) as const;
