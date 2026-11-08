import type { PushStatus } from '@smarteverything/domain';
import { relative } from '../../../format/time';

interface PushDelivery {
  readonly data: PushStatus | undefined;
  readonly isError: boolean;
}

export function deliverySummary(
  { data, isError }: PushDelivery,
  now: number,
): { readonly text: string; readonly tone: 'variant' | 'positive' | 'critical' } {
  if (data === undefined) {
    return isError
      ? { text: 'Couldn’t check the last alert', tone: 'critical' }
      : { text: 'Checking the last alert', tone: 'variant' };
  }
  if (data.lastError !== null) {
    return { text: `Last alert failed · ${data.lastError}`, tone: 'critical' };
  }
  if (data.lastSentAt === null) {
    return { text: 'No alert sent yet', tone: 'variant' };
  }
  return { text: `Last alert sent ${relative(data.lastSentAt, now)}`, tone: 'positive' };
}
