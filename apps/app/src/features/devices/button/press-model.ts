import {
  AUTOMATION_V2,
  walkSteps,
  type AutomationRow,
  type AutomationV2,
  type EventRow,
} from '@smarteverything/domain';
import { GESTURE_ACTIONS, pressesOf, type ButtonGesture, type Press } from '../../device-visuals';
import { DAY_MS } from '../../../format/time';

export const GESTURES: readonly ButtonGesture[] = ['single', 'double', 'long'];

export const GESTURE_WORDS: Readonly<Record<ButtonGesture, string>> = {
  single: 'Press',
  double: 'Double-press',
  long: 'Hold',
};

export const STRIP_HOURS = 24;
export const STRIP_PRESS_MS = 12 * 60_000;
const MENTIONED = 2;
const BOOKKEEPING: ReadonlySet<string> = new Set(['value', 'wait', 'stop']);
const GESTURE_LEAD = /^(?:long |double )?press(?:es)?\s+/i;

export interface Meaning {
  readonly automationId: string;
  readonly name: string;
  readonly gestures: readonly ButtonGesture[];
}

export function actsOnSomething(definition: AutomationV2): boolean {
  return walkSteps(definition.steps).some((step) => !BOOKKEEPING.has(step.do));
}

function gesturesOf(
  match: Readonly<Record<string, unknown>> | undefined,
): readonly ButtonGesture[] {
  const action = match?.['action'];
  if (action === undefined) {
    return GESTURES;
  }
  return GESTURES.filter((gesture) => GESTURE_ACTIONS[gesture] === action);
}

function triggeredGestures(definition: AutomationV2, deviceId: string): readonly ButtonGesture[] {
  const found = new Set<ButtonGesture>();
  for (const trigger of definition.when) {
    if (
      trigger.on === 'signal' &&
      trigger.source === 'event' &&
      trigger.kind === 'button' &&
      trigger.subject === deviceId
    ) {
      gesturesOf(trigger.match).forEach((gesture) => found.add(gesture));
    }
  }
  return GESTURES.filter((gesture) => found.has(gesture));
}

export function meaningOf(rows: readonly AutomationRow[], deviceId: string): readonly Meaning[] {
  return rows.flatMap((row) => {
    const parsed = row.enabled ? AUTOMATION_V2.safeParse(row.definition) : null;
    if (parsed === null || !parsed.success || !actsOnSomething(parsed.data)) {
      return [];
    }
    const gestures = triggeredGestures(parsed.data, deviceId);
    return gestures.length === 0 ? [] : [{ automationId: row.id, name: row.name, gestures }];
  });
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
