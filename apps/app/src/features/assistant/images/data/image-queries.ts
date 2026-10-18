import { Logger } from '@smarteverything/logging';
import {
  CancelledError,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import {
  IMAGE_AREA_ENDPOINTS as E,
  type ImageOperationReceipt,
  type ImageOperationPreview,
} from '@smarteverything/domain';
import { api } from '../../../../api/transport';
import { imageSessionScope } from './image-session';
import { mergeImageReceipt } from './image-cache';
import { imageOperationsKey, imagePreviewKey } from '../model/image-query-keys';

const log = new Logger('app.images');
export async function readImageOperations(
  client: QueryClient,
  chatId: string,
): Promise<readonly ImageOperationReceipt[]> {
  const scope = imageSessionScope();
  const startedAt = Date.now();
  const receipts = await api()
    .call(E.listImageOperations, { query: { chat_id: chatId } })
    .catch((error: unknown) => {
      log.warn('image_operations.read_failed', {
        chatId,
        error: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    });
  log.debug('image_operations.read', () => ({
    chatId,
    receipts: receipts.length,
    durationMs: Date.now() - startedAt,
  }));
  if (scope !== imageSessionScope()) {
    log.debug('image_operations.read_stale', { chatId });
    throw new CancelledError({ silent: true });
  }
  receipts.forEach((receipt) => {
    mergeImageReceipt(client, receipt);
  });
  return (
    client.getQueryData<readonly ImageOperationReceipt[]>(imageOperationsKey(chatId)) ?? receipts
  );
}

export function useImageOperations(
  chatId: string | null,
): UseQueryResult<readonly ImageOperationReceipt[]> {
  const client = useQueryClient();
  return useScreenQuery({
    queryKey: imageOperationsKey(chatId ?? 'unselected'),
    enabled: chatId !== null,
    queryFn: () => {
      if (chatId === null) throw new Error('Choose a chat before reading image operations.');
      return readImageOperations(client, chatId);
    },
    retry: false,
  });
}

export interface ImageActions {
  readonly read: (operationId: string) => Promise<ImageOperationReceipt>;
  readonly cancel: (operationId: string) => Promise<ImageOperationReceipt>;
}

export function useImageActions(): ImageActions {
  const client = useQueryClient();
  const scope = imageSessionScope();
  const remember = (receipt: ImageOperationReceipt): ImageOperationReceipt => {
    if (scope === imageSessionScope()) mergeImageReceipt(client, receipt);
    return receipt;
  };
  return {
    read: async (operationId): Promise<ImageOperationReceipt> => {
      try {
        const receipt = remember(
          await api().call(E.readImageOperation, { params: { operationId } }),
        );
        log.debug('image_operation.read', { operationId, state: receipt.state });
        return receipt;
      } catch (error) {
        log.error('image_operation.read_failed', error, { operationId });
        throw error;
      }
    },
    cancel: async (operationId): Promise<ImageOperationReceipt> => {
      const operation = log.operation('image_operation.cancel', { operationId });
      try {
        const receipt = remember(
          await api().call(E.cancelImageOperation, { params: { operationId } }),
        );
        operation.succeeded({ state: receipt.state });
        return receipt;
      } catch (error) {
        operation.failed(error);
        throw error;
      }
    },
  };
}

export function useImagePreview(operationId: string): ImageOperationPreview | null {
  return (
    useScreenQuery<ImageOperationPreview | null>({
      queryKey: imagePreviewKey(operationId),
      queryFn: () => null,
      enabled: false,
    }).data ?? null
  );
}
