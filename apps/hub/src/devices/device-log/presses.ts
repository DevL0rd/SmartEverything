import {
  PRESS_EFFECT_WINDOW_MS,
  buttonActionTitle,
  respondsToSignal,
  type AutomationRunRow,
  type DeviceLogCause,
  type DeviceLogEffect,
  type DeviceLogEntry,
  type DeviceRow,
  type EventRow,
} from '@smarteverything/domain';
import { readableAutomations, type ReadableAutomation } from './automations';
import { causeOfDetails, peopleByClient } from './causes';
import { signalOfEvent } from './event-signal';
import type { DeviceLogSource, LogRequest, LogStore } from './types';

const RUN_CLOCK_LEAD_MS = 1000;
const PRESS_ACTION = 'action';

const OUTCOMES: Readonly<Record<AutomationRunRow['status'], DeviceLogEffect['outcome']>> = {
  succeeded: 'ok',
  failed: 'failed',
  interrupted: 'failed',
  ignored: 'skipped',
  cancelled: 'skipped',
  queued: 'running',
  running: 'running',
  cancelling: 'running',
};

function pressTitle(details: EventRow['details']): string {
  const action = details[PRESS_ACTION];
  return typeof action === 'string' ? buttonActionTitle(action) : 'Button pressed';
}

function effectsOf(
  press: EventRow,
  automations: readonly ReadableAutomation[],
  runs: readonly AutomationRunRow[],
): DeviceLogEffect[] {
  const signal = signalOfEvent(press);
  const pressedAt = Date.parse(press.occurred_at);
  return automations
    .filter((automation) => automation.enabled && respondsToSignal(automation.definition, signal))
    .flatMap((automation): DeviceLogEffect[] => {
      const run = runs.find((candidate) => {
        const started = Date.parse(candidate.created_at);
        return (
          candidate.automation_id === automation.id &&
          started >= pressedAt - RUN_CLOCK_LEAD_MS &&
          started <= pressedAt + PRESS_EFFECT_WINDOW_MS
        );
      });
      return run === undefined
        ? []
        : [{ title: automation.name, automationId: automation.id, outcome: OUTCOMES[run.status] }];
    });
}

function causeOf(
  people: ReadonlyMap<string, string>,
  device: DeviceRow,
  press: EventRow,
): DeviceLogCause {
  return (
    causeOfDetails(people, press.details) ?? {
      kind: 'button',
      id: device.id,
      name: device.display_name ?? device.name,
    }
  );
}

function readPresses(store: LogStore, request: LogRequest): readonly DeviceLogEntry[] {
  const { device, to, limit } = request;
  const presses = store.events.list({ deviceIds: [device.id], kinds: ['button'], to, limit });
  const newest = presses[0];
  const oldest = presses.at(-1);
  if (newest === undefined || oldest === undefined) return [];
  const automations = readableAutomations(store.automations.list());
  const people = peopleByClient(store);
  const runs = store.automationRuns.startedBetween(
    new Date(Date.parse(oldest.occurred_at) - RUN_CLOCK_LEAD_MS).toISOString(),
    new Date(Date.parse(newest.occurred_at) + PRESS_EFFECT_WINDOW_MS + 1).toISOString(),
  );
  return presses.map((press): DeviceLogEntry => {
    const effects = effectsOf(press, automations, runs);
    return {
      at: press.occurred_at,
      kind: 'press',
      title: pressTitle(press.details),
      cause: causeOf(people, device, press),
      ...(effects.length === 0 ? {} : { effects }),
    };
  });
}

export function pressesSource(): DeviceLogSource {
  return { claims: (_, event) => event.kind === 'button', read: readPresses };
}
