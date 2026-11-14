import type { PlannerAlarmRow, PlannerDay, PlannerOccurrenceView } from '@smarteverything/domain';
import type { FrameClass } from '../../../components/widget-board';
import { TYPE_SCALE, type Idiom } from '../../../design/tokens';
import { clock24 } from '../../../format/time';
import { countdownOf, nextRingOf, type NextRing } from '../clock/alarm-text';
import { anchorOf, riverTimeOf } from '../today/river-model';

export const LINE_GAP = 4;
export const SECTION_GAP = 12;
export const SPLIT_GAP = 16;
export const CHIP_HEIGHT = 32;
export const DIAL_SIZE = 56;
export const DIAL_GAP = 12;
const DIVIDER = 1;
const DIAL_CAPTION_GAP = 2;

export interface DayCounts {
  readonly missed: number;
  readonly left: number;
  readonly done: number;
  readonly share: number;
}

export function dayCountsOf(day: PlannerDay): DayCounts {
  const missed = day.missed.length;
  const left = day.current.length + day.upcoming.length;
  const done = day.done.length;
  const whole = missed + left + done;
  return { missed, left, done, share: whole === 0 ? 0 : done / whole };
}

export function isSplit(cls: FrameClass): boolean {
  return cls === 'w' || cls === 'xl';
}

export function linesFit(room: number, line: number, gap: number): number {
  return Math.max(0, Math.floor((room + gap) / (line + gap)));
}

export function rowLineOf(idiom: Idiom): number {
  return TYPE_SCALE[idiom].footnote[1];
}

export function leadHeightOf(idiom: Idiom, chips: boolean): number {
  const type = TYPE_SCALE[idiom];
  const text = type.body[1] + LINE_GAP + type.caption[1];
  return chips ? text + LINE_GAP + CHIP_HEIGHT : text;
}

export function halfWidthOf(width: number): number {
  return (width - 2 * SPLIT_GAP - DIVIDER) / 2;
}

export function dialsFit(width: number, height: number, idiom: Idiom): number {
  const perRow = linesFit(width, DIAL_SIZE, DIAL_GAP);
  const block = DIAL_SIZE + DIAL_CAPTION_GAP + TYPE_SCALE[idiom].caption[1];
  return perRow * Math.max(1, linesFit(height, block, DIAL_GAP));
}

function spanOf(occurrence: PlannerOccurrenceView, timeZone: string): string {
  const start = riverTimeOf(occurrence, timeZone);
  if (occurrence.all_day || occurrence.start === null || occurrence.end === null) return start;
  return `${start} to ${clock24(occurrence.end, timeZone)}`;
}

export function leadWhenOf(
  occurrence: PlannerOccurrenceView,
  timeZone: string,
  now: number,
): string {
  const span = spanOf(occurrence, timeZone);
  const start = anchorOf(occurrence);
  if (start === null) return span;
  if (start > now) return `In ${countdownOf(start, now)} · ${span}`;
  const end = occurrence.end === null ? null : Date.parse(occurrence.end);
  return end === null || end <= now ? `Now · ${span}` : `Now · ${countdownOf(end, now)} left`;
}

export function deviceIdsOf(occurrence: PlannerOccurrenceView): readonly string[] {
  return occurrence.attachments.flatMap((attachment) =>
    attachment.kind === 'device' ? [attachment.deviceId] : [],
  );
}

export function ringsInOrderOf(
  alarms: readonly PlannerAlarmRow[],
  now: number,
  timeZone: string,
): readonly NextRing[] {
  return alarms
    .flatMap((alarm): NextRing[] => {
      const at = nextRingOf(alarm, now, timeZone);
      return at === null ? [] : [{ alarm, at }];
    })
    .sort((left, right) => left.at - right.at);
}
