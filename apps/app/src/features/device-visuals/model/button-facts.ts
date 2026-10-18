import { BUTTON_ACTIONS, type ButtonAction, type EventRow } from '@smarteverything/domain';
import type { ButtonGesture, ButtonFacts } from '../types';

export const GESTURE_ACTIONS: Readonly<Record<ButtonGesture, ButtonAction>> = {
  single: 'single_press',
  double: 'double_press',
  long: 'long_press',
};

export interface Press {
  readonly gesture: ButtonGesture;
  readonly at: string;
}

function gestureOfAction(action: unknown): ButtonGesture | null {
  const found = BUTTON_ACTIONS.find((candidate) => candidate === action);
  if (found === undefined) {
    return null;
  }
  return found === 'single_press' ? 'single' : found === 'double_press' ? 'double' : 'long';
}

export function pressOf(event: EventRow): Press | null {
  if (event.kind !== 'button') {
    return null;
  }
  const gesture = gestureOfAction(event.details['action']);
  return gesture === null ? null : { gesture, at: event.occurred_at };
}

export function pressesOf(
  events: readonly EventRow[],
  deviceId: string,
  since: number,
): readonly Press[] {
  const found: Press[] = [];
  for (const event of events) {
    const press = event.device_id === deviceId ? pressOf(event) : null;
    if (press !== null && Date.parse(press.at) >= since) {
      found.push(press);
    }
  }
  return found.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

export function lastPressOf(events: readonly EventRow[], deviceId: string): Press | null {
  let last: Press | null = null;
  for (const event of events) {
    const press = event.device_id === deviceId ? pressOf(event) : null;
    if (press !== null && (last === null || Date.parse(press.at) > Date.parse(last.at))) {
      last = press;
    }
  }
  return last;
}

export function buttonFactsOf(events: readonly EventRow[], deviceId: string): ButtonFacts {
  return { lastPress: lastPressOf(events, deviceId) };
}
