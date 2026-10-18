import { extentOf } from './scale';

export interface TimelineSegment<S extends string> {
  readonly start: number;
  readonly end: number;
  readonly state: S;
}

export interface TimelinePlace {
  readonly left: number;
  readonly width: number;
  readonly top: number;
  readonly height: number;
}

export interface TimelineFrame {
  readonly from: number;
  readonly span: number;
  readonly width: number;
  readonly height: number;
}

export class UnknownTimelineStateError extends Error {
  override readonly name = 'UnknownTimelineStateError';

  constructor(
    readonly state: string,
    readonly lanes: readonly string[],
  ) {
    super(`Expected a timeline state in [${lanes.join(', ')}], received ${state}.`);
  }
}

const BLOCK_PADDING_PX = 2;
const MIN_VISIBLE_PX = 3;
const MIN_SEGMENT_PX = MIN_VISIBLE_PX + BLOCK_PADDING_PX;

function laneOf<S extends string>(state: S, lanes: readonly S[] | undefined): number {
  if (lanes === undefined) {
    return 0;
  }
  const lane = lanes.indexOf(state);
  if (lane < 0) {
    throw new UnknownTimelineStateError(state, lanes);
  }
  return lane;
}

export function placeSegment<S extends string>(
  segment: TimelineSegment<S>,
  lanes: readonly S[] | undefined,
  frame: TimelineFrame,
): TimelinePlace {
  const height = frame.height / (lanes?.length ?? 1);
  return {
    left: ((segment.start - frame.from) / frame.span) * frame.width,
    width: Math.max(MIN_SEGMENT_PX, ((segment.end - segment.start) / frame.span) * frame.width),
    top: laneOf(segment.state, lanes) * height,
    height,
  };
}

export interface TimelineWindow {
  readonly from: number;
  readonly to: number;
}

export function windowOf<S extends string>(
  segments: readonly TimelineSegment<S>[],
  given: Partial<TimelineWindow>,
): TimelineWindow | null {
  const bounds = extentOf(segments.flatMap((segment) => [segment.start, segment.end]));
  const from = given.from ?? bounds?.min;
  const to = given.to ?? bounds?.max;
  return from === undefined || to === undefined ? null : { from, to };
}

export function shareOf(at: number, window: TimelineWindow): number {
  return (at - window.from) / Math.max(1, window.to - window.from);
}
