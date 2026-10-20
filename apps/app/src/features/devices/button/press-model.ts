import { NODE_REGISTRY, type EventRow } from '@smarteverything/domain';
import { pressesOf, type ButtonGesture, type Press } from '../../device-visuals';
import { DAY_MS } from '../../../format/time';
import {
  GESTURES,
  automationRowsOf,
  meaningOf as meaningOfRows,
  type Meaning,
} from '../../automations';

export { GESTURES };
export type { Meaning };

export const GESTURE_WORDS: Readonly<Record<ButtonGesture, string>> = {
  single: 'Press',
  double: 'Double-press',
  long: 'Hold',
};

export const STRIP_HOURS = 24;
export const STRIP_PRESS_MS = 12 * 60_000;
const MENTIONED = 2;
const GESTURE_LEAD = /^(?:long |double )?press(?:es)?\s+/i;

export function meaningOf(rows: readonly unknown[], deviceId: string): readonly Meaning[] {
  return meaningOfRows(automationRowsOf(rows).rows, deviceId, NODE_REGISTRY.get);
}

export function phraseOf(name: string): string {
  const tail = name.includes(' - ') ? name.slice(name.lastIndexOf(' - ') + 3) : name;
  const phrase = tail.replace(GESTURE_LEAD, '').trim();
  return phrase === '' ? tail : phrase;
}

export function meaningFor(
  meaning: readonly Meaning[],
  gesture: ButtonGesture,
): readonly Meaning[] {
  return meaning.filter((entry) => entry.gestures.includes(gesture));
}

export function meaningLine(meaning: readonly Meaning[]): string | null {
  const parts = GESTURES.flatMap((gesture) => {
    const first = meaningFor(meaning, gesture)[0];
    return first === undefined ? [] : [`${GESTURE_WORDS[gesture]}: ${phraseOf(first.name)}`];
  });
  if (parts.length === 0) {
    return null;
  }
  const shown = parts.slice(0, MENTIONED).join(' · ');
  return parts.length > MENTIONED ? `${shown} · +${String(parts.length - MENTIONED)} more` : shown;
}

export interface PressSegment {
  readonly start: number;
  readonly end: number;
  readonly state: ButtonGesture;
}

export function stripSegments(presses: readonly Press[]): readonly PressSegment[] {
  return presses.map((press) => {
    const start = Date.parse(press.at);
    return { start, end: start + STRIP_PRESS_MS, state: press.gesture };
  });
}

export type WeekCounts = Readonly<Record<ButtonGesture, number>>;

export function weekCounts(events: readonly EventRow[], deviceId: string, now: number): WeekCounts {
  const counts: Record<ButtonGesture, number> = { single: 0, double: 0, long: 0 };
  for (const press of pressesOf(events, deviceId, now - 7 * DAY_MS)) {
    counts[press.gesture] += 1;
  }
  return counts;
}

export interface PressWindow {
  readonly from: number;
  readonly to: number;
}

export function pressDayWindow(now: number): PressWindow {
  return { from: now - STRIP_HOURS * 60 * 60_000, to: now };
}
