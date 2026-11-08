import { createHash } from 'node:crypto';
import { ApiError, type AiChatRow, type AssistantMessageRow } from '@smarteverything/domain';
import type { Store } from '../../store/store';

interface ReceiptPayload {
  readonly text: string;
  readonly uploadIds: readonly string[];
  readonly targetId: string;
  readonly quoteId: string | null;
  readonly clientMessageId: string;
}

export function receiptKey(
  parent: AiChatRow,
  clientMessage: string,
): {
  readonly chat: string;
  readonly profile: string;
  readonly clientMessage: string;
} {
  return { chat: parent.id, profile: parent.profile_id, clientMessage };
}

export function payloadHash(message: ReceiptPayload): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        message.text,
        message.targetId,
        message.quoteId,
        ...(message.uploadIds.length === 0 ? [] : [message.uploadIds]),
      ]),
    )
    .digest('hex');
}

export function receiptOf(
  store: Store,
  parent: AiChatRow,
  message: ReceiptPayload,
): AssistantMessageRow | undefined {
  const key = receiptKey(parent, message.clientMessageId);
  const receipt = store.assistantSearch.helperReceipt(key);
  if (receipt === undefined) {
    if (store.assistantSearch.byClientMessageId(parent.id, message.clientMessageId) !== undefined)
      throw new ApiError('conflict', 'This client message ID belongs to a different submission.');
    return undefined;
  }
  if (receipt.payload_hash !== payloadHash(message))
    throw new ApiError('conflict', 'This client message ID belongs to a different submission.');
  const row = store.assistantChat.find(receipt.parent_message_id);
  if (row === undefined)
    throw new ApiError(
      'conflict',
      'This helper message was already accepted and has been removed.',
    );
  return row;
}

export function assertOrdinaryMessageKey(
  store: Store,
  parent: AiChatRow,
  clientMessage: string | undefined,
): void {
  if (
    clientMessage !== undefined &&
    store.assistantSearch.helperReceipt(receiptKey(parent, clientMessage)) !== undefined
  )
    throw new ApiError('conflict', 'This client message ID belongs to a helper submission.');
}
