import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  IMAGE_AREA_ENDPOINTS as E,
  type ImageOperationReceipt,
  type ImageOperationPreview,
} from '@smarteverything/domain';
import { api } from '../../../../api/transport';
import { imageSessionScope } from './image-session';
import { mergeImageReceipt } from './image-cache';
import { imageOperationsKey, imagePreviewKey } from '../model/image-query-keys';
export { mergeImageReceipt, mergeImagePreview } from './image-cache';
export { IMAGE_QUERY_PREFIX, imageOperationsKey } from '../model/image-query-keys';

export function useImageOperations(
  chatId: string | null,
): UseQueryResult<readonly ImageOperationReceipt[]> {
  const client = useQueryClient();
  return useQuery({
    queryKey: imageOperationsKey(chatId ?? 'unselected'),
    enabled: chatId !== null,
    queryFn: async () => {
      if (chatId === null) throw new Error('Choose a chat before reading image operations.');
      const scope = imageSessionScope();
      const receipts = await api().call(E.listImageOperations, { query: { chat_id: chatId } });
      if (scope !== imageSessionScope()) return [];
      receipts.forEach((receipt) => {
        mergeImageReceipt(client, receipt);
      });
      return (
        client.getQueryData<readonly ImageOperationReceipt[]>(imageOperationsKey(chatId)) ??
        receipts
      );
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
    read: async (operationId) =>
      remember(await api().call(E.readImageOperation, { params: { operationId } })),
    cancel: async (operationId) =>
      remember(await api().call(E.cancelImageOperation, { params: { operationId } })),
  };
}

export function useImagePreview(operationId: string): ImageOperationPreview | null {
  return (
    useQuery<ImageOperationPreview | null>({
      queryKey: imagePreviewKey(operationId),
      queryFn: () => null,
      enabled: false,
    }).data ?? null
  );
}
