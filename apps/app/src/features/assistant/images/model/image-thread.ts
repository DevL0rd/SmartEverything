import type { ImageOperationReceipt } from '@smarteverything/domain';
import type { MessageItem } from '../../data/thread';
import { compareText } from '../../../../format/text';

export interface ImageOperationItem {
  readonly type: 'image-operation';
  readonly key: string;
  readonly receipt: ImageOperationReceipt;
  readonly message: MessageItem | null;
  readonly group: boolean;
}

interface ImagePlacement {
  readonly boundImages: ReadonlySet<string>;
  readonly hidden: ReadonlySet<string>;
  readonly replyStartedAt: string | null;
}

export function attachImageOperations(
  items: readonly MessageItem[],
  receipts: readonly ImageOperationReceipt[],
  placement: ImagePlacement,
): readonly (MessageItem | ImageOperationItem)[] {
  if (receipts.length === 0) return items;
  const inlineResultIds = new Set<string | null>();
  const standalone = receipts.filter((receipt) => {
    const resultId = resultMessageId(receipt);
    if (
      placement.boundImages.has(receipt.id) ||
      awaitsImageAnchor(receipt, placement.replyStartedAt)
    ) {
      inlineResultIds.add(resultId);
      return false;
    }
    return !placement.hidden.has(resultId ?? receipt.id);
  });
  return withImageOperations(
    inlineResultIds.size === 0 ? items : items.filter((item) => !inlineResultIds.has(item.row.id)),
    standalone,
  );
}

export function withImageOperations(
  items: readonly MessageItem[],
  receipts: readonly ImageOperationReceipt[],
): readonly (MessageItem | ImageOperationItem)[] {
  if (receipts.length === 0) return items;
  const messageIds = new Set(receipts.map(resultMessageId));
  const messages = items.filter((item) => !messageIds.has(item.row.id));
  const group = items.some((item) => item.group);
  const operations = receipts
    .filter((receipt) => receipt.message_deleted !== true)
    .map((receipt): ImageOperationItem => ({
      type: 'image-operation',
      key: `image-operation-${receipt.id}`,
      receipt,
      message: items.find((item) => item.row.id === resultMessageId(receipt)) ?? null,
      group,
    }));
  const chronological = [...messages, ...operations].sort((left, right) =>
    compareText(createdAt(right), createdAt(left)),
  );
  return chronological;
}

export function resultMessageId(receipt: ImageOperationReceipt): string | null {
  return receipt.message_id ?? receipt.result_message_id ?? null;
}

const TOOL_OPERATION_ID = /^[a-f\d]{8}-[a-f\d]{4}-5/;

export function awaitsImageAnchor(
  receipt: Pick<ImageOperationReceipt, 'id' | 'origin' | 'created_at'>,
  replyStartedAt: string | null,
): boolean {
  return (
    replyStartedAt !== null &&
    receipt.created_at >= replyStartedAt &&
    receipt.origin?.kind === 'execution' &&
    TOOL_OPERATION_ID.test(receipt.id)
  );
}

export function showImageReceiptLoading(
  known: boolean,
  loading: boolean,
  awaitingReceipt: boolean,
): boolean {
  return !known && (loading || awaitingReceipt);
}

function createdAt(item: MessageItem | ImageOperationItem): string {
  return item.type === 'message' ? item.row.created_at : item.receipt.created_at;
}

const IMAGE_MAX = 360;

export function pendingImageFrame(receipt: ImageOperationReceipt | null): {
  readonly width: number;
  readonly aspectRatio: number;
} {
  const options = receipt?.request.options;
  const size = options?.size ?? options?.aspect_ratio;
  const dimensions = size === undefined ? null : /^(\d+)[x:](\d+)$/.exec(size);
  const width = Number(dimensions?.[1]);
  const height = Number(dimensions?.[2]);
  const aspectRatio = width > 0 && height > 0 ? width / height : 1;
  return { width: Math.round(IMAGE_MAX * Math.min(1, aspectRatio)), aspectRatio };
}
