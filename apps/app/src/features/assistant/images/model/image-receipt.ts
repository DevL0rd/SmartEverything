import type { ImageOperationReceipt } from '@smarteverything/domain';

export function imageReceiptStatus(receipt: ImageOperationReceipt): string {
  if (
    receipt.cancellation_requested &&
    (receipt.state === 'running' || receipt.state === 'reserved')
  )
    return 'Cancellation requested · waiting for confirmation';
  return imageTerminalStatus(receipt);
}

function imageTerminalStatus(receipt: ImageOperationReceipt): string {
  switch (receipt.state) {
    case 'reserved':
      return 'Waiting to start';
    case 'running':
      return receipt.request.mode === 'edit' ? 'Editing image…' : 'Creating image…';
    case 'completed':
      if (receipt.message_deleted === true) return 'Saved image deleted';
      return receipt.results.length > 0
        ? 'Saved to this chat'
        : 'Completed · no saved images reported';
    case 'failed':
      return 'Image request failed';
    case 'cancelled':
      return 'Cancelled · originals preserved';
    case 'unknown':
      return 'Outcome unknown · check receipt before retrying';
  }
}

export function isActiveImageReceipt(receipt: ImageOperationReceipt): boolean {
  return receipt.state === 'reserved' || receipt.state === 'running';
}

export function newestImageReceipt(
  previous: ImageOperationReceipt | undefined,
  incoming: ImageOperationReceipt,
): ImageOperationReceipt {
  const newest = orderedImageReceipt(previous, incoming);
  return previous?.message_deleted === true && newest.message_deleted !== true
    ? { ...newest, message_deleted: true }
    : newest;
}

function orderedImageReceipt(
  previous: ImageOperationReceipt | undefined,
  incoming: ImageOperationReceipt,
): ImageOperationReceipt {
  if (previous === undefined) return incoming;
  if (previous.updated_at > incoming.updated_at) return previous;
  if (previous.updated_at === incoming.updated_at) {
    if (!isActiveImageReceipt(previous) && isActiveImageReceipt(incoming)) return previous;
    if (previous.progress > incoming.progress) return previous;
    if (
      previous.cancellation_requested &&
      !incoming.cancellation_requested &&
      isActiveImageReceipt(incoming)
    )
      return previous;
  }
  return incoming;
}
