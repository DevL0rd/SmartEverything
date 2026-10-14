import { useMemo } from 'react';
import type {
  AssistantAttachment,
  AssistantMessageRow,
  ImageOperationReceipt,
} from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';
import { useImageOperations } from '../images/data/image-queries';

export const isImageAttachment = (attachment: AssistantAttachment): boolean =>
  attachment.mime.startsWith('image/');

export function chatImagesOf(
  rows: readonly AssistantMessageRow[],
  attachmentId: string,
): readonly AssistantAttachment[] {
  const home = rows.find((row) => row.attachments.some((file) => file.id === attachmentId));
  if (home === undefined) {
    return [];
  }
  const seen = new Set<string>();
  return rows
    .filter((row) => row.chat_id === home.chat_id)
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .flatMap((row) => row.attachments)
    .filter((file) => {
      if (!isImageAttachment(file) || seen.has(file.id)) {
        return false;
      }
      seen.add(file.id);
      return true;
    });
}

export function galleryImagesOf(
  rows: readonly AssistantMessageRow[],
  receipts: readonly ImageOperationReceipt[],
  chatId: string,
): readonly AssistantAttachment[] {
  const loaded = new Set(
    rows
      .filter((row) => row.chat_id === chatId)
      .flatMap((row) => row.attachments.map((image) => image.id)),
  );
  const entries = [
    ...rows
      .filter((row) => row.chat_id === chatId)
      .map((row) => ({ at: row.created_at, images: row.attachments })),
    ...receipts
      .filter((receipt) => receipt.chat_id === chatId && receipt.message_deleted !== true)
      .map((receipt) => ({
        at: receipt.updated_at,
        images: receipt.results
          .map((result) => result.attachment)
          .filter((image) => !loaded.has(image.id)),
      })),
  ];
  const seen = new Set<string>();
  return entries
    .sort((left, right) => left.at.localeCompare(right.at))
    .flatMap((entry) => entry.images)
    .filter((image) => {
      if (!isImageAttachment(image) || seen.has(image.id)) return false;
      seen.add(image.id);
      return true;
    });
}

export function useChatImages(
  attachmentId: string,
  explicitChatId: string | null = null,
): readonly AssistantAttachment[] {
  const rows = useRows('assistant_messages');
  const chatId =
    rows.find((row) => row.attachments.some((file) => file.id === attachmentId))?.chat_id ??
    explicitChatId;
  const operations = useImageOperations(chatId);
  return useMemo(
    () => (chatId === null ? [] : galleryImagesOf(rows, operations.data ?? [], chatId)),
    [rows, operations.data, chatId],
  );
}
