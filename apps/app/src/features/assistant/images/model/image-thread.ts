import type { ImageOperationReceipt } from '@smarteverything/domain';
import type { MessageItem } from '../../data/thread';
import { compareText } from '../../../../format/text';

export interface ImageOperationItem {
  readonly type: 'image-operation';
  readonly key: string;
  readonly receipt: ImageOperationReceipt;
  readonly message: MessageItem | null;
}

export function withImageOperations(
  items: readonly MessageItem[],
  receipts: readonly ImageOperationReceipt[],
): readonly (MessageItem | ImageOperationItem)[] {
  if (receipts.length === 0) return items;
  const messageIds = new Set(receipts.map(resultMessageId));
  const messages = items.filter((item) => !messageIds.has(item.row.id));
  const operations = receipts
    .filter((receipt) => receipt.message_deleted !== true)
    .map((receipt): ImageOperationItem => ({
      type: 'image-operation',
      key: `image-operation-${receipt.id}`,
      receipt,
      message: items.find((item) => item.row.id === resultMessageId(receipt)) ?? null,
    }));
  const chronological = [...messages, ...operations].sort((left, right) =>
    compareText(createdAt(right), createdAt(left)),
  );
  return chronological;
}

export function resultMessageId(receipt: ImageOperationReceipt): string | null {
  return receipt.message_id ?? receipt.result_message_id ?? null;
}

function createdAt(item: MessageItem | ImageOperationItem): string {
  return item.type === 'message' ? item.row.created_at : item.receipt.created_at;
}

const IMAGE_MAX = 360;

export function pendingImageFrame(receipt: ImageOperationReceipt): {
  readonly width: number;
  readonly aspectRatio: number;
} {
  const size = receipt.request.options.size ?? receipt.request.options.aspect_ratio;
  const dimensions = size === undefined ? null : /^(\d+)[x:](\d+)$/.exec(size);
  const width = Number(dimensions?.[1]);
  const height = Number(dimensions?.[2]);
  const aspectRatio = width > 0 && height > 0 ? width / height : 1;
  return { width: Math.round(IMAGE_MAX * Math.min(1, aspectRatio)), aspectRatio };
}
