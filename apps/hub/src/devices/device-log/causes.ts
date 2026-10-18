import {
  COMMAND_CAUSE_WINDOW_MS,
  respondsToSignal,
  runsOnClock,
  type CommandRow,
  type DeviceLogCause,
} from '@smarteverything/domain';
import { readableAutomation, type ReadableAutomation } from './automations';
import { signalOfEvent } from './event-signal';
import type { LogStore } from './types';

const BUTTON_LEAD_MS = 6000;
const CLOCK_SLACK_MS = 1000;

export function causeOfDetails(
  people: ReadonlyMap<string, string>,
  details: Readonly<Record<string, unknown>>,
): DeviceLogCause | undefined {
  if (details['source'] === 'assistant') return { kind: 'assistant' };
  if (details['source'] !== 'app') return undefined;
  const requester = details['requestedBy'];
  const name = typeof requester === 'string' ? people.get(requester) : undefined;
  return { kind: 'app', ...(name === undefined ? {} : { name }) };
}

interface Causes {
  readonly ofCommand: (command: CommandRow) => DeviceLogCause;
  readonly nearest: (
    commands: readonly CommandRow[],
    capability: string,
    at: string,
  ) => CommandRow | undefined;
  readonly person: (clientId: string | null) => string | undefined;
}

export function peopleByClient(store: LogStore): ReadonlyMap<string, string> {
  const names = new Map(store.profiles.list().map((profile) => [profile.id, profile.name]));
  return new Map(
    store.clients.list().flatMap((client) => {
      const name = client.profile_id === null ? undefined : names.get(client.profile_id);
      return name === undefined ? [] : [[client.id, name] as const];
    }),
  );
}

function buttonCause(
  store: LogStore,
  automation: ReadableAutomation,
  startedAt: string,
): DeviceLogCause | undefined {
  const at = Date.parse(startedAt);
  const press = store.events
    .list({
      from: new Date(at - BUTTON_LEAD_MS).toISOString(),
      to: new Date(at + CLOCK_SLACK_MS).toISOString(),
      kinds: ['button'],
      limit: 50,
    })
    .find((event) => respondsToSignal(automation.definition, signalOfEvent(event)));
  if (press?.device_id === null || press === undefined) return undefined;
  const device = store.devices.find(press.device_id);
  return {
    kind: 'button',
    id: press.device_id,
    ...(device === undefined ? {} : { name: device.display_name ?? device.name }),
  };
}

function automationCause(
  store: LogStore,
  automation: ReadableAutomation,
  startedAt: string,
): DeviceLogCause {
  return (
    buttonCause(store, automation, startedAt) ?? {
      kind: runsOnClock(automation.definition) ? 'schedule' : 'automation',
      name: automation.name,
      id: automation.id,
    }
  );
}

export function causesFor(store: LogStore, commands: readonly CommandRow[]): Causes {
  const people = peopleByClient(store);
  const runs = store.automationRuns.runsOfCommands(commands.map((command) => command.id));
  const person = (clientId: string | null): string | undefined =>
    clientId === null ? undefined : people.get(clientId);
  const ofAutomation = (command: CommandRow): DeviceLogCause => {
    const run = runs.get(command.id);
    const row = run === undefined ? undefined : store.automations.find(run.automation_id);
    const automation = row === undefined ? undefined : readableAutomation(row);
    return run === undefined || automation === undefined
      ? { kind: 'automation' }
      : automationCause(store, automation, run.created_at);
  };
  return {
    person,
    nearest: (candidates, capability, at): CommandRow | undefined => {
      const happened = Date.parse(at);
      return candidates.find((command) => {
        const sent = Date.parse(command.created_at);
        return (
          command.capability === capability &&
          command.status !== 'failed' &&
          command.status !== 'expired' &&
          sent <= happened + CLOCK_SLACK_MS &&
          happened - sent <= COMMAND_CAUSE_WINDOW_MS
        );
      });
    },
    ofCommand: (command): DeviceLogCause => {
      if (command.source === 'assistant') return { kind: 'assistant' };
      if (command.source === 'automation') return ofAutomation(command);
      const name = person(command.requested_by);
      return { kind: 'app', ...(name === undefined ? {} : { name }) };
    },
  };
}
