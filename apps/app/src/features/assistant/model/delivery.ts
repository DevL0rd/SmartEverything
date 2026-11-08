import { isInterruption, type AssistantMessageRow } from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import { failedBubbleLabel } from './turn-notice';

export type DeliveryMark =
  'sending' | 'queued' | 'sent' | 'delivered' | 'seen' | 'failed' | 'interrupted';

export const DELIVERY_LABEL: Readonly<Record<DeliveryMark, string>> = {
  sending: 'Sending',
  queued: 'Queued · delivered at the next step',
  sent: 'Sent',
  delivered: 'Delivered',
  seen: 'Seen by the assistant',
  failed: 'Not sent',
  interrupted: 'Stopped',
};

export function deliveryOf(
  row: Pick<AssistantMessageRow, 'state' | 'reason_code'>,
  duringWork: boolean,
): DeliveryMark {
  if (row.state === 'failed') return isInterruption(row.reason_code) ? 'interrupted' : 'failed';
  if (duringWork && row.state === 'queued') return 'queued';
  if (duringWork && row.state === 'delivered') return 'delivered';
  return row.state === 'working' || row.state === 'answered' ? 'seen' : 'sent';
}

export function deliveryNoteOf(
  row: Pick<AssistantMessageRow, 'reason_code'>,
  mark: DeliveryMark,
): string | null {
  if (mark === 'failed') return failedBubbleLabel(row.reason_code);
  return mark === 'interrupted' && row.reason_code === 'interrupted'
    ? failedBubbleLabel(row.reason_code)
    : null;
}

export function sentByVoice(row: Pick<AssistantMessageRow, 'origin'>): boolean {
  return row.origin?.source === 'voice';
}

export function deliveryAnnouncement(
  row: Pick<AssistantMessageRow, 'reason_code' | 'origin'>,
  mark: DeliveryMark,
  time: string,
): string {
  return joinParts([
    sentByVoice(row) ? 'By voice' : null,
    time,
    deliveryNoteOf(row, mark) ?? DELIVERY_LABEL[mark],
  ]);
}
