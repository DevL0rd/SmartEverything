import { targetDevices, type DeviceGroupRow, type DeviceTarget } from '@smarteverything/domain';
import { compareText } from '../../format/text';
import { deviceModelOf } from '../devices';
import { memoOnInputs } from '../../store/memo-selector';
import { rowsOf, type Device, type StoreState } from '../../store/state';
import { shallowEqual, useStoreSelector } from '../../store/store-context';

export type TargetMembers =
  | { readonly status: 'removed' }
  | {
      readonly status: 'ready';
      readonly group: DeviceGroupRow | null;
      readonly members: readonly Device[];
    };

const REMOVED: TargetMembers = { status: 'removed' };

export function allLights(members: readonly Device[]): boolean {
  return members.every((member) => deviceModelOf(member).family === 'light');
}

function inRoomOrder(devices: readonly Device[]): readonly Device[] {
  return [...devices].sort(
    (left, right) =>
      Number(right.favourite) - Number(left.favourite) ||
      left.position - right.position ||
      compareText(left.label, right.label),
  );
}

function buildSelector(target: DeviceTarget): (state: StoreState) => TargetMembers {
  return memoOnInputs(
    (state) => [state.tables.devices, state.tables.device_groups],
    (state): TargetMembers => {
      const devices = rowsOf(state.tables.devices);
      if (target.kind === 'group') {
        const group = state.tables.device_groups.byId[target.groupId];
        if (group === undefined) return REMOVED;
        const members = targetDevices(devices, [group], target);
        const byId = new Map(members.map((device) => [device.id, device]));
        return {
          status: 'ready',
          group,
          members: group.device_ids.flatMap((id) => byId.get(id) ?? []),
        };
      }
      const members = targetDevices(devices, [], target);
      return {
        status: 'ready',
        group: null,
        members: target.kind === 'room' ? inRoomOrder(members) : members,
      };
    },
  );
}

const SELECTORS = new Map<string, (state: StoreState) => TargetMembers>();

export function membersSelector(target: DeviceTarget): (state: StoreState) => TargetMembers {
  const key = JSON.stringify(target);
  const known = SELECTORS.get(key);
  if (known !== undefined) return known;
  const selector = buildSelector(target);
  SELECTORS.set(key, selector);
  return selector;
}

function sameMembers(left: TargetMembers, right: TargetMembers): boolean {
  if (left.status === 'removed' || right.status === 'removed') return left.status === right.status;
  return left.group === right.group && shallowEqual(left.members, right.members);
}

export function useTargetMembers(target: DeviceTarget): TargetMembers {
  return useStoreSelector(membersSelector(target), sameMembers);
}
