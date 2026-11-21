import { assistantLabel, type ImageOperationReceipt } from '@smarteverything/domain';
import { durableStoreUnit } from '../../store/host/unit';
import type { StoredAttachment } from '../../store/repositories/assistant-chat';
import type { HostStore } from '../../store/host/host-store';
import { responderMessage } from '../conversation-log';
import { addConversationMessage } from '../store-units';
import { recordImageUsage } from './usage';

export interface ImageResultMessage {
  readonly files: readonly StoredAttachment[];
  readonly messageId?: string;
}

export interface ImageSettleInput {
  readonly receipt: ImageOperationReceipt;
  readonly message?: ImageResultMessage;
}

function withResultMessage(
  store: HostStore,
  receipt: ImageOperationReceipt,
  message: ImageResultMessage | undefined,
): ImageOperationReceipt {
  if (message === undefined) return receipt;
  const row = addConversationMessage(store, {
    row: responderMessage(
      {
        chat: store.aiChats.chat(receipt.chat_id),
        replyTo: null,
        text: receipt.request.prompt,
        files: message.files,
        model: receipt.request.model,
      },
      () => assistantLabel(store.assistantChat.settings()),
    ),
    files: message.files.map((file) => file.id),
    ...(message.messageId === undefined ? {} : { messageId: message.messageId }),
  });
  return { ...receipt, message_id: row.id };
}

export const IMAGE_SETTLE_UNIT = durableStoreUnit(
  (store, input: ImageSettleInput): ImageOperationReceipt =>
    store.imageOperations.update(
      recordImageUsage(store, withResultMessage(store, input.receipt, input.message)),
    ),
);

export const IMAGE_RECOVER_UNIT = durableStoreUnit((store, _input: null): void => {
  store.imageOperations.recover((receipt) => recordImageUsage(store, receipt));
});
