import { devicesIn } from '../../../store/selectors';
import { sameJson } from '../../../store/same-json';
import type { Device, StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

type Same<T> = (left: T, right: T) => boolean;

export function sameRows<T>(same: Same<T>): Same<readonly T[]> {
  return (left, right) =>
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index];
      return other !== undefined && (row === other || same(row, other));
    });
}

export function sameFields<T>(fields: readonly (keyof T)[]): Same<T> {
  return (left, right) => fields.every((field) => sameJson(left[field], right[field]));
}

export const shownDevices = (state: StoreState): readonly Device[] => devicesIn(state, {});

const ROOM_FLOW_FIELDS = ['id', 'label', 'room_id'] as const;

export type RoomFlowDevice = Pick<Device, (typeof ROOM_FLOW_FIELDS)[number]>;

export const sameRoomFlowDevices = sameRows(sameFields<RoomFlowDevice>(ROOM_FLOW_FIELDS));

export function useRoomFlowDevices(): readonly RoomFlowDevice[] {
  return useStoreSelector<readonly RoomFlowDevice[]>(shownDevices, sameRoomFlowDevices);
}
