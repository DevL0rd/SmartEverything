import { useMemo } from 'react';
import type { AssistantAttachment, AssistantMessageRow } from '@smarteverything/domain';
import { useRows } from '../../../store/selectors';

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
    .toSorted((left, right) => left.created_at.localeCompare(right.created_at))
    .flatMap((row) => row.attachments)
    .filter((file) => {
      if (!isImageAttachment(file) || seen.has(file.id)) {
        return false;
      }
      seen.add(file.id);
      return true;
    });
}

export function useChatImages(attachmentId: string): readonly AssistantAttachment[] {
  const rows = useRows('assistant_messages');
  return useMemo(() => chatImagesOf(rows, attachmentId), [rows, attachmentId]);
}
