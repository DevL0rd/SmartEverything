import type { QueryClient } from '@tanstack/react-query';
import type { LiveMessage } from '@smarteverything/domain';
import { mergeImageReceipt, mergeImagePreview } from './image-cache';

export type ImageNotice = Extract<
  LiveMessage,
  { type: 'image_operation' | 'image_operation_preview' }
>;

export function receiveImageNotice(
  client: QueryClient,
  profileId: string | null,
  message: ImageNotice,
): void {
  const owner =
    message.type === 'image_operation' ? message.receipt.profile_id : message.profile_id;
  if (owner !== profileId) return;
  if (message.type === 'image_operation') mergeImageReceipt(client, message.receipt);
  else mergeImagePreview(client, message);
}
