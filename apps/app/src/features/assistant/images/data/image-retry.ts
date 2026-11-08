import { useQueryClient } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { IMAGE_AREA_ENDPOINTS as E, type ImageOperationReceipt } from '@smarteverything/domain';
import { api } from '../../../../api/transport';
import { retryOf, type ImageRetry } from '../model/image-generation';
import { mergeImageReceipt } from './image-cache';
import { imageSessionScope } from './image-session';

const log = new Logger('app.images');

function submit(retry: ImageRetry): Promise<ImageOperationReceipt> {
  return retry.kind === 'generate'
    ? api().call(E.generateImageOperation, { body: retry.body })
    : api().call(E.editImageOperation, { body: retry.body });
}

export function useImageRetry(): (receipt: ImageOperationReceipt) => Promise<void> {
  const client = useQueryClient();
  return async (receipt) => {
    const scope = imageSessionScope();
    const operation = log.operation('image_operation.retry', {
      operationId: receipt.id,
      mode: receipt.request.mode,
    });
    try {
      const next = await submit(retryOf(receipt));
      if (scope === imageSessionScope()) mergeImageReceipt(client, next);
      operation.succeeded({ retryId: next.id, state: next.state });
    } catch (error) {
      operation.failed(error);
      throw error;
    }
  };
}
