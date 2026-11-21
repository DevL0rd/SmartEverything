import { Logger, messageOf } from '@smarteverything/logging';
import { IMAGE_ARTIFACT, type ImageOperationReceipt } from '@smarteverything/domain';
import { summaryOf, type StoredAttachment } from '../../store/repositories/assistant-chat';
import type { ImageServiceOptions } from './contract';
import type { ImageProviderResult } from '../../openrouter/image-provider';

const log = new Logger('hub.assistant');
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export async function keepResults(
  options: ImageServiceOptions,
  receipt: ImageOperationReceipt,
  outcome: { readonly result: ImageProviderResult; readonly signal: AbortSignal },
): Promise<ImageOperationReceipt> {
  const { result, signal } = outcome;
  const files = await saveImages(options, receipt, { images: result.images, signal });
  try {
    const completed = await options.store.live.attachments.attach(
      files.map((file) => file.id),
      () =>
        options.store.host.write('imageSettle', {
          receipt: {
            ...receipt,
            state: 'completed',
            results: resultArtifacts(receipt, files),
            usage: result.usage,
            usage_source: result.usageSource,
            usage_complete: true,
            reason: null,
          },
          message: {
            files,
            ...(receipt.result_message_id === undefined
              ? {}
              : { messageId: receipt.result_message_id }),
          },
        }),
    );
    files.forEach((file) => {
      options.notes?.later(file);
    });
    return completed;
  } catch (cause) {
    await options.files.remove(files);
    await options.store.host.call(
      'assistantChat',
      'removeAttachments',
      files.map((file) => file.id),
    );
    throw cause;
  }
}

async function saveImages(
  options: ImageServiceOptions,
  receipt: ImageOperationReceipt,
  batch: { readonly images: ImageProviderResult['images']; readonly signal: AbortSignal },
): Promise<StoredAttachment[]> {
  const files: StoredAttachment[] = [];
  for (const [index, image] of batch.images.entries()) {
    try {
      files.push(
        await options.files.keepBytes({
          profileId: receipt.profile_id,
          authorize: async (): Promise<void> => {
            await options.store.host.call('aiChats', 'chat', receipt.chat_id);
          },
          name: `image-${String(index + 1)}.${EXTENSIONS[image.mime]}`,
          mime: image.mime,
          content: image.content,
          signal: batch.signal,
        }),
      );
    } catch (cause) {
      if (files.length === 0) throw cause;
      log.warn('image.save_incomplete', {
        operationId: receipt.id,
        saved: files.length,
        returned: batch.images.length,
        reason: messageOf(cause),
      });
      break;
    }
  }
  return files;
}

function resultArtifacts(
  receipt: ImageOperationReceipt,
  files: readonly StoredAttachment[],
): ImageOperationReceipt['results'] {
  return files.map((file) =>
    IMAGE_ARTIFACT.parse({
      attachment: summaryOf(file),
      operation_id: receipt.id,
      parents: receipt.inputs,
      sha256: file.sha256,
    }),
  );
}
