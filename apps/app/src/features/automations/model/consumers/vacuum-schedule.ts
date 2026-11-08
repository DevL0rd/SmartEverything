import {
  TIME_ZONE,
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_MODES,
  nextOccurrence,
  type AutomationV3,
  type FlowNode,
  type VacuumMode,
} from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { EVERY_DAY } from '../templates/build';
import { activeTriggers, literalOf, recordOf, targetsDevice, type ConsumerRow } from './row';

export const VACUUM_CLEANING_CONTROL = 'cleaning';
export const VACUUM_START = 'start';

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export type VacuumRoomRef = number | string;

export type VacuumScheduleClean =
  | { readonly kind: 'home' }
  | {
      readonly kind: 'rooms';
      readonly rooms: readonly VacuumRoomRef[];
      readonly mode: VacuumMode | null;
    };

export interface VacuumScheduleTime {
  readonly at: string;
  readonly days: readonly number[];
}

export interface VacuumScheduleEntry {
  readonly automationId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly times: readonly VacuumScheduleTime[];
  readonly cleans: readonly VacuumScheduleClean[];
}

function nodesOf(nodes: readonly FlowNode[]): readonly FlowNode[] {
  return nodes.flatMap((node) => [
    node,
    ...nodesOf(Object.values(node.scopes ?? {}).flatMap((scope) => scope.nodes)),
    ...nodesOf((node.branches ?? []).flatMap((branch) => branch.scope.nodes)),
    ...nodesOf((node.catches ?? []).flatMap((row) => row.scope.nodes)),
  ]);
}

function daysOf(value: unknown): readonly number[] {
  const days = Array.isArray(value)
    ? value.filter((day): day is number => typeof day === 'number')
    : [];
  return days.length === 0 ? EVERY_DAY : [...new Set(days)].sort((left, right) => left - right);
}

function timesOf(program: AutomationV3): readonly VacuumScheduleTime[] {
  return activeTriggers(program).flatMap((trigger) => {
    const at = literalOf(trigger.ports, 'at');
    return trigger.kind === 'trigger.time' && typeof at === 'string' && CLOCK.test(at)
      ? [{ at, days: daysOf(literalOf(trigger.ports, 'days')) }]
      : [];
  });
}

function modeOf(value: unknown): VacuumMode | null {
  return VACUUM_MODES.find((entry) => entry.mode === value)?.mode ?? null;
}

function roomsOf(value: unknown): readonly VacuumRoomRef[] {
  return Array.isArray(value)
    ? value.filter(
        (room): room is VacuumRoomRef => typeof room === 'number' || typeof room === 'string',
      )
    : [];
}

function setsDevice(node: FlowNode, deviceId: string): boolean {
  return node.enabled !== false && node.kind === 'device.set' && targetsDevice(node, deviceId);
}

function roomsCleanOf(to: unknown): VacuumScheduleClean | null {
  const args = recordOf(to);
  const rooms = roomsOf(args?.['rooms']);
  return rooms.length === 0 ? null : { kind: 'rooms', rooms, mode: modeOf(args?.['mode']) };
}

function cleanOf(node: FlowNode, deviceId: string): VacuumScheduleClean | null {
  if (!setsDevice(node, deviceId)) {
    return null;
  }
  const ports = node.ports ?? {};
  const control = literalOf(ports, 'control');
  const to = literalOf(ports, 'to');
  if (control === VACUUM_CLEANING_CONTROL) {
    return to === VACUUM_START ? { kind: 'home' } : null;
  }
  return control === VACUUM_CLEAN_ROOMS_KEY ? roomsCleanOf(to) : null;
}

function entryOf(row: ConsumerRow, deviceId: string): VacuumScheduleEntry | null {
  const times = timesOf(row.definition);
  const cleans = nodesOf(row.definition.body.nodes).flatMap((node) => {
    const clean = cleanOf(node, deviceId);
    return clean === null ? [] : [clean];
  });
  return times.length === 0 || cleans.length === 0
    ? null
    : { automationId: row.id, name: row.name, enabled: row.enabled, times, cleans };
}

function firstAt(entry: VacuumScheduleEntry): string {
  return entry.times.map((time) => time.at).sort(compareText)[0] ?? '';
}

export function vacuumSchedulesOf(
  rows: readonly ConsumerRow[],
  deviceId: string,
): readonly VacuumScheduleEntry[] {
  return rows
    .flatMap((row) => {
      const entry = entryOf(row, deviceId);
      return entry === null ? [] : [entry];
    })
    .sort(
      (left, right) =>
        compareText(firstAt(left), firstAt(right)) || compareText(left.name, right.name),
    );
}

export function nextVacuumRun(
  entry: VacuumScheduleEntry,
  after: Date,
  timeZone: string,
): Date | null {
  if (!entry.enabled || !TIME_ZONE.safeParse(timeZone).success) {
    return null;
  }
  const place = { timeZone, location: null };
  const runs = entry.times.flatMap((time) => {
    const next = nextOccurrence({ type: 'time', at: time.at, weekdays: time.days }, after, place);
    return next === null ? [] : [next];
  });
  return runs.reduce<Date | null>(
    (soonest, run) => (soonest === null || run < soonest ? run : soonest),
    null,
  );
}
