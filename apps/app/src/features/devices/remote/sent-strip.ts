import type { TimelineSegment } from '../../../components/charts';

export const STRIP_WINDOW_MS = 86_400_000;
const SEND_WIDTH_MS = 420_000;

type SentState = 'sent';

export interface SentWindow {
  readonly segments: readonly TimelineSegment<SentState>[];
  readonly from: number;
  readonly to: number;
}

export function sentWindow(recent: readonly string[], now: number): SentWindow {
  return {
    from: now - STRIP_WINDOW_MS,
    to: now,
    segments: recent.map((at) => {
      const start = Date.parse(at);
      return { start, end: start + SEND_WIDTH_MS, state: 'sent' };
    }),
  };
}
