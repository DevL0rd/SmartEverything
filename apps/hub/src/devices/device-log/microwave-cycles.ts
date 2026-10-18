import {
  COMMAND_CAUSE_WINDOW_MS,
  MICROWAVE_KEYS,
  MICROWAVE_MODE_LABELS,
  MICROWAVE_SPECIFICATION,
  humanizeEnum,
  microwaveSeconds,
  presentDevice,
  type DeviceLogEntry,
  type DeviceRow,
  type EventRow,
  type JsonValue,
  type MicrowaveMode,
} from '@smarteverything/domain';
import { causesFor } from './causes';
import { eventsWhere } from './events';
import type { DeviceLogSource, LogRequest, LogStore } from './types';

const BEGINNING = new Date(0).toISOString();
const EVENTS_PER_CYCLE = 5;
const SETTLE_MS = 5000;
const NO_DURATION = '00:00:00';
const START_COMMANDS: ReadonlySet<string> = new Set([
  MICROWAVE_KEYS.start,
  'raw:oven_operating_state:start',
  MICROWAVE_KEYS.cookDefinedRecipe,
  MICROWAVE_KEYS.cookRecipe,
]);
const CYCLE_CAPABILITIES: ReadonlySet<string> = new Set([MICROWAVE_KEYS.state, MICROWAVE_KEYS.job]);

interface MicrowaveCycle {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly finished: boolean;
}

function capabilityOf(event: EventRow): unknown {
  return event.details['capability'];
}

function isCycleEvent(event: EventRow): boolean {
  const capability = capabilityOf(event);
  return (
    event.kind === 'activity' &&
    typeof capability === 'string' &&
    CYCLE_CAPABILITIES.has(capability)
  );
}

export function cyclesOf(events: readonly EventRow[]): readonly MicrowaveCycle[] {
  const ordered = events
    .filter(isCycleEvent)
    .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at));
  const finishedAt = ordered
    .filter(
      (event) =>
        capabilityOf(event) === MICROWAVE_KEYS.job && event.details['value'] === 'finished',
    )
    .map((event) => Date.parse(event.occurred_at));
  const cycles: MicrowaveCycle[] = [];
  let startedAt: string | null = null;
  for (const event of ordered) {
    if (capabilityOf(event) !== MICROWAVE_KEYS.state) continue;
    const state = event.details['value'];
    if (state === 'running' && startedAt === null) startedAt = event.occurred_at;
    if (state === 'ready' && startedAt !== null) {
      const from = Date.parse(startedAt);
      const to = Date.parse(event.occurred_at);
      cycles.push({
        startedAt,
        endedAt: event.occurred_at,
        finished: finishedAt.some((moment) => moment >= from && moment <= to),
      });
      startedAt = null;
    }
  }
  return cycles;
}

function valueAt(
  store: LogStore,
  device: DeviceRow,
  capability: string,
  at: string,
): JsonValue | undefined {
  return store.state.history({
    capabilities: [capability],
    deviceIds: [device.id],
    from: BEGINNING,
    to: new Date(Date.parse(at) + SETTLE_MS).toISOString(),
    order: 'desc',
    limit: 1,
  })[0]?.value;
}

function modeSpecification(
  store: LogStore,
  device: DeviceRow,
  mode: string,
): MicrowaveMode | undefined {
  const specification = store.state.value(device.id, MICROWAVE_KEYS.specification);
  return specification === undefined
    ? undefined
    : MICROWAVE_SPECIFICATION.parse(specification).single.find((entry) => entry.mode === mode);
}

function numeric(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function programmedSeconds(value: JsonValue | undefined): number | undefined {
  return typeof value === 'string' && value !== NO_DURATION ? microwaveSeconds(value) : undefined;
}

function programAt(
  store: LogStore,
  device: DeviceRow,
  at: string,
): Readonly<Record<string, JsonValue>> {
  const mode = valueAt(store, device, MICROWAVE_KEYS.mode, at);
  if (typeof mode !== 'string' || mode === 'NoOperation') return {};
  const options = modeSpecification(store, device, mode)?.supportedOptions;
  const read = (key: string): JsonValue | undefined => valueAt(store, device, key, at);
  const program: Record<string, JsonValue | undefined> = {
    mode,
    temperature:
      options?.temperature === undefined ? undefined : numeric(read(MICROWAVE_KEYS.temperature)),
    power: options?.powerLevel === undefined ? undefined : read(MICROWAVE_KEYS.power),
    seconds: programmedSeconds(read(MICROWAVE_KEYS.duration)),
  };
  return Object.fromEntries(
    Object.entries(program).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  );
}

function minutesText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return [minutes > 0 ? `${String(minutes)} min` : '', rest > 0 ? `${String(rest)} s` : '']
    .filter((part) => part !== '')
    .join(' ');
}

function programText(program: Readonly<Record<string, JsonValue>>): string | undefined {
  const { mode, temperature, power, seconds } = program;
  const parts = [
    typeof mode === 'string' ? (MICROWAVE_MODE_LABELS[mode] ?? humanizeEnum(mode)) : undefined,
    typeof temperature === 'number' ? `${String(temperature)} °C` : undefined,
    typeof power === 'string' ? power : undefined,
    typeof seconds === 'number' ? minutesText(seconds) : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' · ');
}

function readCycles(store: LogStore, request: LogRequest): readonly DeviceLogEntry[] {
  const { device, limit } = request;
  if (presentDevice(device).family !== 'microwave') return [];
  const events = eventsWhere(store, { ...request, limit: limit * EVENTS_PER_CYCLE }, (event) =>
    isCycleEvent(event),
  );
  const before = request.to === undefined ? Number.POSITIVE_INFINITY : Date.parse(request.to);
  const cycles = cyclesOf(events)
    .filter((cycle) => Date.parse(cycle.endedAt) < before)
    .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
    .slice(0, limit);
  const oldest = cycles.at(-1);
  if (oldest === undefined) return [];
  const commands = store.commands.ofDevice(device.id, {
    capabilities: [...START_COMMANDS],
    from: new Date(Date.parse(oldest.startedAt) - COMMAND_CAUSE_WINDOW_MS).toISOString(),
  });
  const causes = causesFor(store, commands);
  return cycles.map((cycle): DeviceLogEntry => {
    const started = Date.parse(cycle.startedAt);
    const command = commands.find((candidate) => {
      const sent = Date.parse(candidate.created_at);
      return sent <= started + 1000 && started - sent <= COMMAND_CAUSE_WINDOW_MS;
    });
    const program = programAt(store, device, cycle.startedAt);
    const value = programText(program);
    return {
      at: cycle.endedAt,
      started_at: cycle.startedAt,
      kind: 'cycle',
      title: cycle.finished ? 'Cooking finished' : 'Stopped early',
      ...(value === undefined ? {} : { value, settings: program }),
      cause: command === undefined ? { kind: 'device' } : causes.ofCommand(command),
    };
  });
}

export function microwaveCyclesSource(): DeviceLogSource {
  return {
    claims: (device, event) => isCycleEvent(event) && presentDevice(device).family === 'microwave',
    read: readCycles,
  };
}
