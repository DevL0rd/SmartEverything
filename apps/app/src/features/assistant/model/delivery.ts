import type { AssistantMessageRow } from '@smarteverything/domain';

export type DeliveryMark = 'sent' | 'seen' | 'queued' | 'delivered' | 'failed';

export const DELIVERY_LABEL: Readonly<Record<DeliveryMark, string>> = {
  sent: 'Sent',
  seen: 'Seen by the assistant',
  queued: 'Queued · delivered at the next step',
  delivered: 'Delivered',
  failed: 'Not sent',
};

export function deliveryOf(
  row: Pick<AssistantMessageRow, 'state'>,
  duringWork: boolean,
): DeliveryMark {
  if (row.state === 'failed') return 'failed';
  if (duringWork && row.state === 'queued') return 'queued';
  if (duringWork && row.state === 'delivered') return 'delivered';
  return row.state === 'working' || row.state === 'answered' ? 'seen' : 'sent';
}
