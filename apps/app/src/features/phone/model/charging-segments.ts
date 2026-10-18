import type { TimelineSegment } from '../../../components/charts';
import { clock } from '../../../format/time';
import type { TimeSpan } from '../data/phone-history';

export type ChargingState = 'charging' | 'battery';

export function chargingSegmentsOf(
  spans: readonly TimeSpan[],
  from: number,
  to: number,
): readonly TimelineSegment<ChargingState>[] {
  const segments: TimelineSegment<ChargingState>[] = [];
  let cursor = from;
  for (const span of spans) {
    const start = Math.max(span.start, from);
    const end = Math.min(span.end, to);
    if (end <= start) continue;
    if (start > cursor) segments.push({ start: cursor, end: start, state: 'battery' });
    segments.push({ start, end, state: 'charging' });
    cursor = end;
  }
  if (cursor < to) segments.push({ start: cursor, end: to, state: 'battery' });
  return segments;
}

export function chargingSummary(spans: readonly TimeSpan[]): string {
  const last = spans.at(-1);
  if (last === undefined) return 'Charging: not charged in this period';
  return `Charging: ${String(spans.length)} ${spans.length === 1 ? 'time' : 'times'}, last from ${clock(last.start)}`;
}
