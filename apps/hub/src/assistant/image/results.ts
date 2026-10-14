import {
  IMAGE_ARTIFACT,
  type ImageOperationReceipt,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { summaryOf, type StoredAttachment } from '../../store/repositories/assistant-chat';
import { ConversationLog } from '../conversation-log';
import type { ImageActor, ImageServiceOptions } from './contract';
import type { ImageProviderResult } from '../../openrouter/image-provider';
import { ownedChat } from './inputs';
import { recordImageUsage } from './usage';

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
export async function keepResults(
  options: ImageServiceOptions,
  actor: ImageActor,
  receipt: ImageOperationReceipt,
  outcome: { readonly result: ImageProviderResult; readonly signal: AbortSignal },
): Promise<ImageOperationReceipt> {
  const { result, signal } = outcome;
  const files: StoredAttachment[] = [];
  try {
    for (const [index, image] of result.images.entries()) {
      authorizePersistence(options, actor, receipt.chat_id, signal);
      files.push(await keepImage(options, { actor, receipt, signal }, { index, image }));
    }
    authorizePersistence(options, actor, receipt.chat_id, signal);
    const completed = options.store.write(() => {
      const message = saveResultMessage(options, receipt, files);
      return options.repository.update(
        recordImageUsage(options.store, {
          ...receipt,
          state: 'completed',
          results: resultArtifacts(receipt, files),
          message_id: message.id,
          usage: result.usage,
          usage_source: result.usageSource,
          usage_complete: true,
          reason: null,
        }),
      );
    });
    files.forEach((file) => {
      options.notes?.later(file);
    });
    return completed;
  } catch (cause) {
    await options.files.remove(files);
    options.store.assistantChat.removeAttachments(files.map((file) => file.id));
    throw cause;
  }
}

function saveResultMessage(
  options: ImageServiceOptions,
  receipt: ImageOperationReceipt,
  files: readonly StoredAttachment[],
): AssistantMessageRow {
  return new ConversationLog(options.store).responderInChat({
    chat: options.store.aiChats.chat(receipt.chat_id),
    replyTo: null,
    text: receipt.request.prompt,
    files,
    model: receipt.request.model,
    ...(receipt.result_message_id === undefined ? {} : { messageId: receipt.result_message_id }),
  });
}
function authorizePersistence(
  options: ImageServiceOptions,
  actor: ImageActor,
  chatId: string,
  signal: AbortSignal,
): void {
  signal.throwIfAborted();
  ownedChat(options, actor, chatId);
  actor.authorize('persist', chatId);
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

function keepImage(
  options: ImageServiceOptions,
  scope: {
    readonly actor: ImageActor;
    readonly receipt: ImageOperationReceipt;
    readonly signal: AbortSignal;
  },
  result: { readonly index: number; readonly image: ImageProviderResult['images'][number] },
): Promise<StoredAttachment> {
  const { actor, receipt, signal } = scope;
  return options.files.keepBytes({
    profileId: actor.profileId,
    chatId: receipt.chat_id,
    authorize: (): void => {
      authorizePersistence(options, actor, receipt.chat_id, signal);
    },
    name: `image-${String(result.index + 1)}.${EXTENSIONS[result.image.mime]}`,
    mime: result.image.mime,
    content: result.image.content,
    signal,
  });
}
