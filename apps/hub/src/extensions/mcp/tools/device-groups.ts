import {
  API_ENDPOINTS as E,
  TARGET_CHANGE,
  deviceFamily,
  groupTargets,
  memberOutcomes,
  presentDevice,
  roomLightTargets,
  skippedText,
  targetResultHeadline,
  targetState,
  type DeviceScope,
  type JsonValue,
  type MemberOutcome,
  type ResultNoun,
  type SkippedGroupDevice,
  type Spread,
  type TargetEntry,
  type TargetReadings,
  type TargetState,
} from '@smarteverything/domain';
import { deviceHidden, deviceIdReachable } from '../../../server/person-scope';
import type { Store } from '../../../store/store';
import { z } from 'zod';
import { submitAndWait } from '../command-waiter';
import { operate } from './acting';
import { reported } from './commanding';
import { deviceScopeOfActor } from './person-reach';
import { PHYSICAL, READS, defineTool, type Tool } from './registry';
import { deviceNames } from './targets';

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
    target: summary.target,
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

function noun(store: Store, outcomes: readonly MemberOutcome[]): ResultNoun {
  const lights = new Set(
    store.devices
      .list()
      .filter((device) => deviceFamily(device) === 'light')
      .map((device) => device.id),
  );
  return outcomes.every((outcome) => lights.has(outcome.deviceId)) ? 'light' : 'device';
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
  defineTool({
    name: 'control_device_target',
    input: TARGET_CHANGE,
    annotations: PHYSICAL,
    run: async (context, input) => {
      let skipped: readonly SkippedGroupDevice[] = [];
      const outcome = await submitAndWait({
        feed: context.store.feed,
        clock: context.clock,
        waitMs: context.commandWaitMs,
        submit: async () => {
          const result = E.sendTargetCommands.response.parse(
            await operate(context, 'sendTargetCommands', { body: input }),
          );
          skipped = result.skipped;
          return result.commands;
        },
        current: (id) => context.store.commands.byId(id),
      });
      const outcomes = memberOutcomes(skipped, outcome.commands);
      const names = deviceNames(context.store);
      return {
        structured: {
          ...reported(context, outcome),
          headline: targetResultHeadline(outcomes, noun(context.store, outcomes)),
          skipped: skipped.map((skip) => ({
            device: names.get(skip.deviceId) ?? skip.deviceId,
            reason: skippedText(skip),
          })),
        },
      };
    },
  }),
];
