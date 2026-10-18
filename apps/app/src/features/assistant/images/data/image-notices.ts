import type { QueryClient } from '@tanstack/react-query';
import type { LiveMessage } from '@smarteverything/domain';
import { noticeHandler } from '../../../../store/notice-registry';
import { mergeImageReceipt, mergeImagePreview } from './image-cache';

type ImageNotice = Extract<LiveMessage, { type: 'image_operation' | 'image_operation_preview' }>;

function receiveImageNotice(
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

export const IMAGE_NOTICES = noticeHandler(
  ['image_operation', 'image_operation_preview'],
  (message, { client, store, live }) => {
    if (live) receiveImageNotice(client, store.get().session?.client.profile_id ?? null, message);
  },
);
