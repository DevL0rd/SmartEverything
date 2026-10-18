import { clock, dayKeyOf, startOfDayKey } from '../../../format/time';
import type { OnSegment } from '../button/relay-model';

interface Window {
  readonly from: number;
  readonly to: number;
}

export interface OpenSince {
  readonly at: number;
  readonly carried: boolean;
  readonly today: boolean;
}

export function openingsToday(segments: readonly OnSegment[], window: Window): number {
  const midnight = startOfDayKey(dayKeyOf(window.to));
  return segments.filter((segment) => segment.start > window.from && segment.start >= midnight)
    .length;
}

export function openSince(
  segments: readonly OnSegment[],
  window: Window,
  open: boolean | null,
): OpenSince | null {
  if (open !== true) {
    return null;
  }
  const last = segments.at(-1);
  return last?.end === window.to
    ? {
        at: last.start,
        carried: last.start === window.from,
        today: last.start >= startOfDayKey(dayKeyOf(window.to)),
      }
    : null;
}

export function openingsText(count: number, short: boolean): string {
  if (short) {
    return `${String(count)}× today`;
  }
  return count === 0 ? 'Not opened today' : `Opened ${String(count)}× today`;
}

function sinceText(since: OpenSince): string {
  if (since.carried) {
    return 'Open for over 24 h';
  }
  return `Open since ${since.today ? '' : 'yesterday '}${clock(since.at)}`;
}

export function contactStateText(open: boolean | null, since: OpenSince | null): string {
  if (open === null) {
    return 'Waiting for the first reading';
  }
  if (!open) {
    return 'Closed';
  }
  return since === null ? 'Open' : sinceText(since);
}
