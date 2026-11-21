import {
  targetCapability,
  type DeviceTarget,
  type GroupCommandPlan,
  type JsonValue,
  type PresentedCapability,
  type TargetChange,
} from '@smarteverything/domain';
import { prepareTargetCommands, resolveTarget } from '../../device-groups/commands';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { restrictedTo, snappedValue, steppedValue, type Member } from './device-set';

export interface MembersAsk {
  readonly target: DeviceTarget;
  readonly control: string;
}

export interface SteppedAsk {
  readonly members: readonly Member[];
  readonly value: JsonValue;
  readonly percent: boolean;
  readonly snapped: boolean;
}

function admittedMembers(
  store: HostStore,
  target: DeviceTarget,
  control: string,
): readonly Member[] {
  const members = resolveTarget(store, target).flatMap((device) => {
    const presented = targetCapability(device, control);
    return presented?.writable === true ? [{ deviceId: device.id, capability: presented.key }] : [];
  });
  return [...new Map(members.map((member) => [JSON.stringify(member), member])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, member]) => member);
}

function nextValue(
  store: HostStore,
  member: Member,
  presented: PresentedCapability,
  ask: SteppedAsk,
): number | string {
  return ask.snapped
    ? snappedValue(presented, ask.value, ask.percent)
    : steppedValue(
        presented,
        store.state.value(member.deviceId, member.capability),
        ask.value,
        ask.percent,
      );
}

function steppedPlan(store: HostStore, ask: SteppedAsk): GroupCommandPlan {
  const steps = ask.members.map((member) => {
    const presented = targetCapability(store.devices.byId(member.deviceId), member.capability);
    const next =
      presented === undefined
        ? 'This control is unsupported.'
        : nextValue(store, member, presented, ask);
    return { member, next };
  });
  const reached = steps.flatMap(({ member, next }) =>
    typeof next === 'number'
      ? [
          prepareTargetCommands(
            store,
            {
              target: { kind: 'devices', deviceIds: [member.deviceId] },
              capability: member.capability,
              value: next,
            },
            null,
          ),
        ]
      : [],
  );
  const unsteppable = steps.flatMap(({ member, next }) =>
    typeof next === 'string'
      ? [{ deviceId: member.deviceId, reason: 'unsupported' as const, detail: next }]
      : [],
  );
  return restrictedTo(
    {
      commands: reached.flatMap((planned) => planned.commands),
      skipped: [...reached.flatMap((planned) => planned.skipped), ...unsteppable],
    },
    ask.members,
  );
}

export const ADMITTED_DEVICE_MEMBERS_UNIT = storeUnit((store, ask: MembersAsk): readonly Member[] =>
  admittedMembers(store, ask.target, ask.control),
);

export const PREPARE_TARGET_COMMANDS_UNIT = storeUnit(
  (store, changes: readonly TargetChange[]): readonly GroupCommandPlan[] =>
    changes.map((change) => prepareTargetCommands(store, change, null)),
);

export const STEPPED_DEVICE_PLAN_UNIT = storeUnit((store, ask: SteppedAsk): GroupCommandPlan =>
  steppedPlan(store, ask),
);
