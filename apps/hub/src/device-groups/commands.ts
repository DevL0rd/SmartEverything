import {
  ApiError,
  baseNameOf,
  memberOutcomeLine,
  planGroupCommands,
  presentDevice,
  targetDevices,
  withRole,
  type CommandRow,
  type DeviceGroupRow,
  type DeviceRow,
  type DeviceScope,
  type DeviceTarget,
  type GroupCommandPlan,
  type RoomRow,
  type StateRow,
  type TargetChange,
} from '@smarteverything/domain';
import { deviceHidden } from '../server/person-scope';

export interface TargetHome {
  readonly rooms: { readonly byId: (id: string) => RoomRow };
  readonly deviceGroups: {
    readonly byId: (id: string) => DeviceGroupRow;
    readonly list: () => DeviceGroupRow[];
  };
  readonly devices: { readonly byId: (id: string) => DeviceRow; readonly list: () => DeviceRow[] };
  readonly state: { readonly list: () => StateRow[] };
}

export function resolveTarget(home: TargetHome, target: DeviceTarget): readonly DeviceRow[] {
  if (target.kind === 'room') home.rooms.byId(target.roomId);
  if (target.kind === 'group') home.deviceGroups.byId(target.groupId);
  if (target.kind === 'devices')
    target.deviceIds.forEach((id) => {
      home.devices.byId(id);
    });
  return targetDevices(home.devices.list(), home.deviceGroups.list(), target);
}

export function litMembers(home: TargetHome, devices: readonly DeviceRow[]): readonly DeviceRow[] {
  const lit = new Set(
    home.state
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
  home: TargetHome,
  change: TargetChange,
  scope: DeviceScope | null,
): GroupCommandPlan {
  const everything = resolveTarget(home, change.target);
  if (everything.length === 0 && change.target.kind !== 'group')
    throw new ApiError('not_found', 'This target has no devices.');
  const resolved = everything.filter((device) => !deviceHidden(scope, device));
  const plan = planGroupCommands(
    change.scope === 'on' ? litMembers(home, resolved) : resolved,
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
  const members = home.deviceGroups.byId(change.target.groupId).device_ids;
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
  home: Pick<TargetHome, 'devices'>,
  skipped: GroupCommandPlan['skipped'],
): string | null {
  if (skipped.length === 0) return null;
  const names = new Map(home.devices.list().map((device) => [device.id, baseNameOf(device)]));
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
