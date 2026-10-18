import type { ColourRole } from '../../../design/tokens';
import { MINUTE_MS, hoursMinutes } from '../../../format/time';
import { CONTEXT_TEXT } from '../phone-context-text';
import type { PhoneDoingSegment, PhoneDoingState } from '../data/phone-history';

export const DOING_COLOURS: Readonly<Record<PhoneDoingState, ColourRole>> = {
  still: 'on-surface-faint',
  walking: 'viz-1',
  running: 'viz-2',
  cycling: 'viz-3',
  driving: 'viz-4',
  navigating: 'viz-5',
  parked: 'viz-6',
};

export interface DoingTotal {
  readonly state: PhoneDoingState;
  readonly minutes: number;
}

export function doingTotals(segments: readonly PhoneDoingSegment[]): readonly DoingTotal[] {
  const sums = new Map<PhoneDoingState, number>();
  for (const segment of segments) {
    sums.set(
      segment.state,
      (sums.get(segment.state) ?? 0) + Math.round((segment.end - segment.start) / MINUTE_MS),
    );
  }
  return [...sums.entries()]
    .map(([state, minutes]) => ({ state, minutes }))
    .filter((total) => total.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

export function doingLabel(totals: readonly DoingTotal[]): string {
  if (totals.length === 0) return 'Doing today: nothing recorded';
  return `Doing today: ${totals
    .map((total) => `${CONTEXT_TEXT[total.state]} ${hoursMinutes(total.minutes)}`)
    .join(', ')}`;
}
