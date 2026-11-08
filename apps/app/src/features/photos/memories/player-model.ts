import { count } from '../../../format/number';

export const SLIDE_MS = 4000;

export const FADE_MS = 800;

export const SLOW_ZOOM = 0.06;

export const SEGMENT_MIN_PX = 6;

export interface PlayerPosition {
  readonly index: number;
  readonly previous: number | null;
  readonly paused: boolean;
  readonly ended: boolean;
}

export const START: PlayerPosition = { index: 0, previous: null, paused: false, ended: false };

export function playableTotal(expected: number, loaded: number, loading: boolean): number {
  return loading ? Math.max(expected, loaded) : loaded;
}

export function stepTo(position: PlayerPosition, target: number, total: number): PlayerPosition {
  const index = Math.min(Math.max(target, 0), Math.max(total - 1, 0));
  if (index === position.index) return position;
  return { index, previous: position.index, paused: position.paused, ended: false };
}

export function advance(position: PlayerPosition, total: number): PlayerPosition {
  if (position.index >= total - 1) return { ...position, paused: true, ended: true };
  return stepTo(position, position.index + 1, total);
}

export function toggle(position: PlayerPosition): PlayerPosition {
  if (position.ended) return START;
  return { ...position, paused: !position.paused };
}

export type PlayerKey = 'toggle' | 'next' | 'previous';

const KEYS: Readonly<Record<string, PlayerKey>> = {
  ' ': 'toggle',
  ArrowRight: 'next',
  ArrowLeft: 'previous',
};

export function playerKeyOf(key: string): PlayerKey | null {
  return KEYS[key] ?? null;
}

export function segmentsFit(total: number, width: number): boolean {
  return total > 0 && width / total >= SEGMENT_MIN_PX;
}

export function positionText(index: number, total: number): string {
  return `${count(index + 1)} of ${count(total)}`;
}

export type SegmentFill = 'done' | 'current' | 'left';

export function segmentFillOf(segment: number, index: number): SegmentFill {
  if (segment < index) return 'done';
  return segment === index ? 'current' : 'left';
}

export function photoLine(
  when: { readonly day: string; readonly time: string } | null,
  sameDay: boolean,
  index: number,
  total: number,
): string {
  const where = positionText(index, total);
  if (when === null) return where;
  return sameDay ? `${when.time} · ${where}` : `${when.day}, ${when.time} · ${where}`;
}
