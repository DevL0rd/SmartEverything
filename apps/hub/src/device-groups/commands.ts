import {
  ApiError,
  baseNameOf,
  memberOutcomeLine,
  planGroupCommands,
  presentDevice,
  targetDevices,
  withRole,
  type CommandRow,
  type DeviceRow,
  type DeviceScope,
  type DeviceTarget,
  type GroupCommandPlan,
  type TargetChange,
} from '@smarteverything/domain';
import { deviceHidden } from '../server/person-scope';
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

function litMembers(store: Store, devices: readonly DeviceRow[]): readonly DeviceRow[] {
  const lit = new Set(
    store.state
      .list()
      .filter((row) => row.value === true)
      .map((row) => `${row.device_id}:${row.capability}`),
  );
  return devices.filter((device) => {
    const power = withRole(presentDevice(device), 'power');
    return power !== undefined && lit.has(`${device.id}:${power.key}`);
  });
}

const OUT_OF_REACH = 'not one of the devices this person may use';

export function prepareTargetCommands(
  store: Store,
  change: TargetChange,
  scope: DeviceScope | null,
): GroupCommandPlan {
  const everything = resolveTarget(store, change.target);
  if (everything.length === 0 && change.target.kind !== 'group')
    throw new ApiError('not_found', 'This target has no devices.');
  const resolved = everything.filter((device) => !deviceHidden(scope, device));
  const plan = planGroupCommands(
    change.scope === 'on' ? litMembers(store, resolved) : resolved,
    change,
  );
  const outOfReach = everything
    .filter((device) => deviceHidden(scope, device))
    .map((device) => ({
      deviceId: device.id,
      reason: 'unsupported' as const,
      detail: OUT_OF_REACH,
    }));
  if (change.target.kind !== 'group') return { ...plan, skipped: [...plan.skipped, ...outOfReach] };
  const members = store.deviceGroups.byId(change.target.groupId).device_ids;
  const missing = members.filter((id) => !everything.some((device) => device.id === id));
  return {
    ...plan,
    skipped: [
      ...plan.skipped,
      ...outOfReach,
      ...missing.map((deviceId) => ({ deviceId, reason: 'removed' as const })),
    ],
  };
}

export function skippedMembersNote(
  store: Store,
  skipped: GroupCommandPlan['skipped'],
): string | null {
  if (skipped.length === 0) return null;
  const names = new Map(store.devices.list().map((device) => [device.id, baseNameOf(device)]));
  const lines = skipped.map((skip) =>
    memberOutcomeLine(names.get(skip.deviceId) ?? skip.deviceId, { status: 'skipped', ...skip }),
  );
  return `Skipped members: ${lines.join('; ')}`;
}

export async function submitPreparedTarget(
  plan: GroupCommandPlan,
  submit: (
    commands: GroupCommandPlan['commands'],
  ) => Promise<readonly CommandRow[]> | readonly CommandRow[],
): Promise<{
  readonly commands: CommandRow[];
  readonly skipped: GroupCommandPlan['skipped'][number][];
}> {
  return {
    commands: plan.commands.length === 0 ? [] : [...(await submit(plan.commands))],
    skipped: [...plan.skipped],
  };
}
