import type { DriveConflict, DriveItem, DriveVersion } from '@smarteverything/domain';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { flattenPages, useDriveItem, useDriveVersions } from '../../nas/data';
import { useByName } from '../folder/folder-list';
import { hubMakerOf, sidesOf, type ConflictNamers, type ConflictSides } from './conflict-model';

export interface ConflictFacts {
  readonly sides: ConflictSides;
  readonly item: DriveItem | null;
  readonly versions: readonly DriveVersion[];
  readonly settled: boolean;
}

function labelsIn(state: StoreState, deviceIds: readonly string[]): readonly string[] {
  return deviceIds.map((deviceId) => state.tables.devices.byId[deviceId]?.label ?? '');
}

function useDeviceNamer(deviceIds: readonly string[]): ConflictNamers['deviceName'] {
  const labels = useStoreSelector((state) => labelsIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  const names = new Map(deviceIds.map((deviceId, index) => [deviceId, labels[index] ?? '']));
  return (deviceId) => {
    const name = names.get(deviceId);
    return name === undefined || name === '' ? null : name;
  };
}

export function useConflictFacts(conflict: DriveConflict): ConflictFacts {
  const item = useDriveItem(conflict.itemId, conflict.rootId).data ?? null;
  const pages = useDriveVersions(conflict.itemId, conflict.rootId).data;
  const versions = flattenPages(pages, (page) => page.items);
  const maker = item === null ? null : hubMakerOf(item, versions, conflict.hubRev);
  const makerDevice = maker === null ? null : maker.deviceId;
  const deviceIds =
    makerDevice === null || makerDevice === conflict.deviceId
      ? [conflict.deviceId]
      : [conflict.deviceId, makerDevice];
  const namers: ConflictNamers = { deviceName: useDeviceNamer(deviceIds), byName: useByName() };
  return {
    sides: sidesOf(conflict, maker, namers),
    item,
    versions,
    settled: item !== null && pages !== undefined,
  };
}
