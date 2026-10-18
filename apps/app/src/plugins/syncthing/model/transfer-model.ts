import { formatByteRate } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { clock } from '../../../format/time';

export const TRANSFER_RANGES = [
  { value: 'live', label: 'Live' },
  { value: '24h', label: '24 h' },
] as const;

export type TransferRange = (typeof TRANSFER_RANGES)[number]['value'];

export function transferSummary(
  incoming: readonly ChartPoint[],
  outgoing: readonly ChartPoint[],
): string | null {
  const peak = incoming.reduce<ChartPoint | null>(
    (best, point) => (best === null || point.v > best.v ? point : best),
    null,
  );
  const last = incoming[incoming.length - 1];
  if (peak === null || last === undefined) {
    return null;
  }
  const out = outgoing[outgoing.length - 1];
  return [
    `Incoming transfer peaked at ${formatByteRate(peak.v)} at ${clock(peak.t)}; now ${formatByteRate(last.v)}.`,
    out === undefined ? null : `Outgoing now ${formatByteRate(out.v)}.`,
  ]
    .filter((part) => part !== null)
    .join(' ');
}

export function hasTransfer(
  incoming: readonly ChartPoint[],
  outgoing: readonly ChartPoint[],
): boolean {
  return incoming.length >= 2 || outgoing.length >= 2;
}
