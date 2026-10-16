import {
  ApiError,
  planGroupCommands,
  targetDevices,
  type CommandRow,
  type DeviceRow,
  type DeviceTarget,
  type GroupCommandPlan,
  type TargetChange,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export function resolveTarget(store: Store, target: DeviceTarget): readonly DeviceRow[] {
  if (target.kind === 'room') store.rooms.byId(target.roomId);
  if (target.kind === 'group') store.deviceGroups.byId(target.groupId);
  if (target.kind === 'devices')
    target.deviceIds.forEach((id) => {
      store.devices.byId(id);
    });
  return targetDevices(store.devices.list(), store.deviceGroups.list(), target);
}

export function prepareTargetCommands(store: Store, change: TargetChange): GroupCommandPlan {
  const devices = resolveTarget(store, change.target);
  if (devices.length === 0 && change.target.kind !== 'group')
    throw new ApiError('not_found', 'This target has no devices.');
  const plan = planGroupCommands(devices, change);
  if (change.target.kind !== 'group') return plan;
  const members = store.deviceGroups.byId(change.target.groupId).device_ids;
  const missing = members.filter((id) => !devices.some((device) => device.id === id));
  return {
    ...plan,
    skipped: [
      ...plan.skipped,
      ...missing.map((deviceId) => ({ deviceId, reason: 'This device no longer exists.' })),
    ],
  };
}

export async function submitPreparedTarget(
  plan: GroupCommandPlan,
  submit: (
    commands: GroupCommandPlan['commands'],
  ) => Promise<readonly CommandRow[]> | readonly CommandRow[],
): Promise<{
  readonly commands: CommandRow[];
  readonly skipped: { deviceId: string; reason: string }[];
}> {
  return {
    commands: plan.commands.length === 0 ? [] : [...(await submit(plan.commands))],
    skipped: [...plan.skipped],
  };
}
