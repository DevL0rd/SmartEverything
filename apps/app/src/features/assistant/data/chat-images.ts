import { useMemo } from 'react';
import type {
  AssistantAttachment,
  AssistantMessageRow,
  ImageOperationReceipt,
} from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';
import { useImageOperations } from '../images/data/image-queries';
import { compareText } from '../../../format/text';

export const isImageAttachment = (attachment: AssistantAttachment): boolean =>
  attachment.mime.startsWith('image/');

function galleryImagesOf(
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
    .sort((left, right) => compareText(left.at, right.at))
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
