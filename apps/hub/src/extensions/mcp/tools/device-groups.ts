import {
  groupTargets,
  presentDevice,
  roomLightTargets,
  targetState,
  type DeviceScope,
  type JsonValue,
  type Spread,
  type TargetEntry,
  type TargetReadings,
  type TargetState,
} from '@smarteverything/domain';
import { deviceHidden, deviceIdReachable } from '../../../server/person-scope';
import type { Store } from '../../../store/store';
import { z } from 'zod';
import { deviceScopeOfActor } from './person-reach';
import { READS, defineTool, type Tool } from './registry';

export interface TargetSummary extends TargetEntry {
  readonly state: TargetState;
}

function readingsOf(store: Store): TargetReadings {
  const byDevice = new Map<string, Record<string, { readonly value: JsonValue }>>();
  for (const row of store.state.list()) {
    const readings = byDevice.get(row.device_id) ?? {};
    readings[row.capability] = { value: row.value };
    byDevice.set(row.device_id, readings);
  }
  return (deviceId) => byDevice.get(deviceId);
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right);
}

export function deviceGroupSummaries(
  store: Store,
  scope: DeviceScope | null,
): readonly TargetSummary[] {
  const devices = store.devices.list().filter((device) => !deviceHidden(scope, device));
  const readings = readingsOf(store);
  const groups = store.deviceGroups
    .list()
    .filter((group) => group.device_ids.every((id) => deviceIdReachable(store, scope, id)));
  return [
    ...groupTargets(devices, groups),
    ...roomLightTargets(devices, store.rooms.list(), compareNames),
  ].map((entry) => ({
    ...entry,
    state: targetState(entry.members, readings, presentDevice),
  }));
}

function range(spread: Spread | null): { min: number; max: number; mean: number } | null {
  return spread === null ? null : { min: spread.min, max: spread.max, mean: spread.mean };
}

function summaryRow(summary: TargetSummary): Record<string, unknown> {
  const { state } = summary;
  return {
    key: summary.key,
    name: summary.name,
    kind: summary.kind,
    member_ids: summary.members.map((member) => member.id),
    lost: summary.lost,
    state: {
      power: state.power,
      members: state.members,
      online: state.online,
      on: state.on,
      level: range(state.level),
      white_temperature: range(state.whiteTemperature),
      colours: state.colours.length,
      support: state.support,
    },
  };
}

export const DEVICE_GROUP_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_device_groups',
    input: z.strictObject({}),
    annotations: READS,
    run: (context) => ({
      structured: {
        device_groups: deviceGroupSummaries(context.store, deviceScopeOfActor(context)).map(
          summaryRow,
        ),
      },
    }),
  }),
];
