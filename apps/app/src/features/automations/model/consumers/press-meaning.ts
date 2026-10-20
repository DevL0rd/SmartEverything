import {
  programNodes,
  signalViewOf,
  type AutomationV3,
  type KindLookup,
} from '@smarteverything/domain';
import { GESTURE_ACTIONS, type ButtonGesture } from '../../../device-visuals';
import { activeTriggers, type ConsumerRow } from './row';

export const GESTURES: readonly ButtonGesture[] = ['single', 'double', 'long'];

export interface Meaning {
  readonly automationId: string;
  readonly name: string;
  readonly gestures: readonly ButtonGesture[];
}

const BOOKKEEPING: ReadonlySet<string> = new Set([
  'var.set',
  'var.change',
  'automation.stop',
  'debug.log',
]);
const CALLS: ReadonlySet<string> = new Set(['fn.call', 'automation.run']);

export function actsOnSomething(program: AutomationV3, kinds: KindLookup): boolean {
  return programNodes(program).some(
    (node) =>
      node.enabled !== false &&
      !BOOKKEEPING.has(node.kind) &&
      (CALLS.has(node.kind) || kinds(node.kind)?.class === 'effect'),
  );
}

function gesturesOf(
  match: Readonly<Record<string, unknown>> | undefined,
): readonly ButtonGesture[] {
  const action = match?.['action'];
  if (action === undefined) return GESTURES;
  return GESTURES.filter((gesture) => GESTURE_ACTIONS[gesture] === action);
}

function triggeredGestures(program: AutomationV3, deviceId: string): readonly ButtonGesture[] {
  const found = new Set<ButtonGesture>();
  for (const trigger of activeTriggers(program)) {
    const view = signalViewOf(trigger);
    if (view?.source === 'event' && view.kind === 'button' && view.subject === deviceId) {
      gesturesOf(view.match).forEach((gesture) => found.add(gesture));
    }
  }
  return GESTURES.filter((gesture) => found.has(gesture));
}

export function meaningOf(
  rows: readonly ConsumerRow[],
  deviceId: string,
  kinds: KindLookup,
): readonly Meaning[] {
  return rows.flatMap((row) => {
    if (!row.enabled || !actsOnSomething(row.definition, kinds)) return [];
    const gestures = triggeredGestures(row.definition, deviceId);
    return gestures.length === 0 ? [] : [{ automationId: row.id, name: row.name, gestures }];
  });
}
