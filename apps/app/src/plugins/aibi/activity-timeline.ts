import { ROBOT_ONLINE_WINDOW_MS, type RobotActivityEntry } from '@smarteverything/domain';
import type { TimelineSegment } from '../../components/charts/timeline-model';
import { DAY_MS, MINUTE_MS } from '../../format/time';

type RobotPhase = 'awake' | 'talk';

export interface RobotDay {
  readonly segments: readonly TimelineSegment<RobotPhase>[];
  readonly from: number;
  readonly to: number;
  readonly talks: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

const TALK_KINDS: ReadonlySet<RobotActivityEntry['kind']> = new Set([
  'heard',
  'said',
  'chat',
  'action',
]);

const TALK_GAP_MS = 2 * MINUTE_MS;
const TALK_MIN_MS = 30_000;

function merged(spans: readonly Span[], gap: number): readonly Span[] {
  const out: Span[] = [];
  for (const span of [...spans].sort((left, right) => left.start - right.start)) {
    const last = out.at(-1);
    if (last !== undefined && span.start - last.end <= gap) {
      out[out.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
    } else {
      out.push(span);
    }
  }
  return out;
}

function clipped(spans: readonly Span[], from: number, to: number): readonly Span[] {
  return spans
    .map((span) => ({ start: Math.max(from, span.start), end: Math.min(to, span.end) }))
    .filter((span) => span.end > span.start);
}

function carved(awake: Span, talks: readonly Span[]): readonly TimelineSegment<RobotPhase>[] {
  const out: TimelineSegment<RobotPhase>[] = [];
  let cursor = awake.start;
  for (const talk of talks) {
    const start = Math.max(awake.start, talk.start);
    const end = Math.min(awake.end, talk.end);
    if (end <= start) continue;
    if (start > cursor) out.push({ start: cursor, end: start, state: 'awake' });
    out.push({ start, end, state: 'talk' });
    cursor = end;
  }
  if (awake.end > cursor) out.push({ start: cursor, end: awake.end, state: 'awake' });
  return out;
}

export function robotDay(entries: readonly RobotActivityEntry[], to: number): RobotDay {
  const from = to - DAY_MS;
  const seen = entries
    .filter((entry) => entry.kind !== 'warning')
    .map((entry) => Date.parse(entry.at));
  const awake = clipped(
    merged(
      seen.map((at) => ({ start: at, end: at + ROBOT_ONLINE_WINDOW_MS })),
      0,
    ),
    from,
    to,
  );
  const talks = clipped(
    merged(
      entries
        .filter((entry) => TALK_KINDS.has(entry.kind))
        .map((entry) => ({
          start: Date.parse(entry.at),
          end: Date.parse(entry.at) + TALK_MIN_MS,
        })),
      TALK_GAP_MS,
    ),
    from,
    to,
  );
  const today = new Date(to).setHours(0, 0, 0, 0);
  return {
    segments: awake.flatMap((span) => carved(span, talks)),
    from,
    to,
    talks: talks.filter((talk) => talk.start >= today).length,
  };
}
