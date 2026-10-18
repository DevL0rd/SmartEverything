import {
  COMMAND_CAUSE_WINDOW_MS,
  PHYSICAL_CONTROL_FAMILIES,
  phoneValueHidden,
  presentDevice,
  presentValue,
  type DeviceLogCause,
  type CommandRow,
  type DeviceLogEntry,
  type DeviceRow,
  type HistoryRow,
  type JsonValue,
  type PhoneTier,
  type PresentedCapability,
} from '@smarteverything/domain';
import { causesFor } from './causes';
import type { DeviceLogSource, LogRequest, LogStore } from './types';

const LOGGED_TIERS: ReadonlySet<string> = new Set(['primary', 'control', 'reading']);
const LOGGED_VALUES: ReadonlySet<string> = new Set(['boolean', 'enum']);
const BEGINNING = new Date(0).toISOString();
const COMMAND_LEAD_MS = COMMAND_CAUSE_WINDOW_MS;
const COMMAND_LAG_MS = 1000;

function titleOf(presented: PresentedCapability, value: JsonValue): string {
  const text = presentValue(presented, value);
  if (presented.role === 'power' && typeof value === 'boolean') {
    return value ? 'Turned on' : 'Turned off';
  }
  return presented.states === null ? `${presented.label}: ${text}` : text;
}

interface Loggable {
  readonly logged: ReadonlyMap<string, PresentedCapability>;
  readonly physical: boolean;
}

function loggableOf(device: DeviceRow, tier: PhoneTier | null): Loggable {
  const presentation = presentDevice(device);
  return {
    physical: PHYSICAL_CONTROL_FAMILIES.has(presentation.family),
    logged: new Map(
      presentation.capabilities
        .filter(
          (presented) =>
            LOGGED_TIERS.has(presented.tier) &&
            LOGGED_VALUES.has(presented.capability.value.kind) &&
            (tier === null || !phoneValueHidden(presented.key, tier)),
        )
        .map((presented) => [presented.key, presented]),
    ),
  };
}

function changeRows(store: LogStore, request: LogRequest, keys: readonly string[]): HistoryRow[] {
  const { device, to, limit } = request;
  const first = store.state.firstHistoryIds(device.id, keys);
  return store.state
    .history({
      capabilities: keys,
      deviceIds: [device.id],
      from: BEGINNING,
      to,
      order: 'desc',
      limit: limit + keys.length,
    })
    .filter((row) => !first.has(row.id) && row.value !== null)
    .slice(0, limit);
}

function commandsAround(
  store: LogStore,
  device: DeviceRow,
  rows: readonly HistoryRow[],
): CommandRow[] {
  const newest = rows[0];
  const oldest = rows.at(-1);
  if (newest === undefined || oldest === undefined) return [];
  return store.commands.ofDevice(device.id, {
    from: new Date(Date.parse(oldest.observed_at) - COMMAND_LEAD_MS).toISOString(),
    to: new Date(Date.parse(newest.observed_at) + COMMAND_LAG_MS + 1).toISOString(),
  });
}

function readChanges(store: LogStore, request: LogRequest): readonly DeviceLogEntry[] {
  const { logged, physical } = loggableOf(request.device, request.tier);
  if (logged.size === 0) return [];
  const rows = changeRows(store, request, [...logged.keys()]);
  const commands = commandsAround(store, request.device, rows);
  const causes = causesFor(store, commands);
  return rows.flatMap((row): DeviceLogEntry[] => {
    const presented = logged.get(row.capability);
    if (presented === undefined) return [];
    const command = causes.nearest(commands, row.capability, row.observed_at);
    const cause: DeviceLogCause =
      command === undefined
        ? { kind: presented.writable && !physical ? 'unknown' : 'device' }
        : causes.ofCommand(command);
    return [{ at: row.observed_at, kind: 'change', title: titleOf(presented, row.value), cause }];
  });
}

export function changesSource(): DeviceLogSource {
  return { claims: () => false, read: readChanges };
}
