import type { QueryClient } from '@tanstack/react-query';
import type {
  ImageOperationReceipt,
  ImageOperationPreview,
  LiveChange,
} from '@smarteverything/domain';
import { newestImageReceipt } from '../model/image-receipt';
import { resultMessageId } from '../model/image-thread';
import { IMAGE_QUERY_PREFIX, imageOperationsKey, imagePreviewKey } from '../model/image-query-keys';

const RECEIPTS_KEY = [...IMAGE_QUERY_PREFIX, 'chat'] as const;

export function refreshImageOperations(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: RECEIPTS_KEY });
}

export function reconcileImageMessages(client: QueryClient, changes: readonly LiveChange[]): void {
  const messages = changes
    .filter((change) => change.table === 'assistant_messages')
    .filter(
      (change) =>
        change.operation === 'DELETE' ||
        change.record?.attachments.some((attachment) => attachment.mime.startsWith('image/')) ===
          true,
    );
  if (messages.length === 0) return;
  const deleted = new Set(
    messages.flatMap((change) =>
      change.operation === 'DELETE' && change.oldRecord !== null ? [change.oldRecord.id] : [],
    ),
  );
  for (const query of client.getQueryCache().findAll({ queryKey: RECEIPTS_KEY })) {
    client.setQueryData<readonly ImageOperationReceipt[]>(query.queryKey, (receipts) =>
      receipts?.map((receipt) =>
        deleted.has(resultMessageId(receipt) ?? receipt.id)
          ? { ...receipt, message_deleted: true }
          : receipt,
      ),
    );
  }
  const chats = new Set(
    messages.flatMap((change) => {
      const row = change.record ?? change.oldRecord;
      return row === null ? [] : [row.chat_id];
    }),
  );
  for (const chatId of chats)
    void client.invalidateQueries({ queryKey: imageOperationsKey(chatId) });
}

export function mergeImageReceipt(client: QueryClient, receipt: ImageOperationReceipt): void {
  const prior = client.getQueryData<readonly ImageOperationReceipt[]>(
    imageOperationsKey(receipt.chat_id),
  );
  const existing = prior?.find((item) => item.id === receipt.id);
  const newest = newestImageReceipt(existing, receipt);
  if (newest === existing) return;
  if (!['reserved', 'running'].includes(newest.state))
    client.removeQueries({ queryKey: imagePreviewKey(newest.id) });
  client.setQueryData<readonly ImageOperationReceipt[]>(
    imageOperationsKey(receipt.chat_id),
    [...(prior ?? []).filter((item) => item.id !== newest.id), newest].sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    ),
  );
}

export function mergeImagePreview(client: QueryClient, preview: ImageOperationPreview): void {
  const receipts = client.getQueryData<readonly ImageOperationReceipt[]>(
    imageOperationsKey(preview.chat_id),
  );
  const receipt = receipts?.find((item) => item.id === preview.operation_id);
  if (receipt !== undefined && !['reserved', 'running'].includes(receipt.state)) return;
  client.setQueryData(imagePreviewKey(preview.operation_id), preview);
}
