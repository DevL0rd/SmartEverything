import { useMemo } from 'react';
import type { HomeMap } from '@smarteverything/domain';
import {
  homeMapRenderScene,
  type HomeMapSceneDevice,
  type HomeMapSceneLive,
} from '../../../components/house-map/adapters/home-map-scene';
import type { RenderScene } from '../../../components/house-map/render-scene';
import { devicesIn, type DeviceFilter } from '../../../store/selectors';
import { rowsOf, type Device, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';

interface NamedRoom {
  readonly id: string;
  readonly name: string;
}

export function homeMapSceneLive(
  rooms: readonly NamedRoom[],
  devices: readonly Pick<Device, 'id' | 'label' | 'kind'>[],
): HomeMapSceneLive {
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
  const shown = new Map(devices.map((device) => [device.id, device]));
  return {
    homeRoomName: (roomId) => roomNames.get(roomId) ?? null,
    device: (deviceId): HomeMapSceneDevice | null => {
      const device = shown.get(deviceId);
      return device === undefined ? null : { name: device.label, kind: device.kind };
    },
  };
}

type SceneDevice = Pick<Device, 'id' | 'label' | 'kind'>;

export interface HomeMapSceneNames {
  readonly rooms: readonly NamedRoom[];
  readonly devices: readonly SceneDevice[];
}

export function homeMapSceneNamesOf(state: StoreState, filter: DeviceFilter): HomeMapSceneNames {
  return {
    rooms: rowsOf(state.tables.rooms).map(({ id, name }) => ({ id, name })),
    devices: devicesIn(state, filter).map(({ id, label, kind }) => ({ id, label, kind })),
  };
}

export function sameHomeMapSceneNames(left: HomeMapSceneNames, right: HomeMapSceneNames): boolean {
  return (
    left.rooms.length === right.rooms.length &&
    left.devices.length === right.devices.length &&
    left.rooms.every((room, index) => {
      const other = right.rooms[index];
      return room.id === other?.id && room.name === other.name;
    }) &&
    left.devices.every((device, index) => {
      const other = right.devices[index];
      return device.id === other?.id && device.label === other.label && device.kind === other.kind;
    })
  );
}

export function useHomeMapSceneLive(filter: DeviceFilter): HomeMapSceneLive {
  const names = useStoreSelector(
    (state) => homeMapSceneNamesOf(state, filter),
    sameHomeMapSceneNames,
    [filter.room, filter.includeHidden],
  );
  return useMemo(() => homeMapSceneLive(names.rooms, names.devices), [names]);
}

const ALL_DEVICES: DeviceFilter = {};

const allSceneNames = (state: StoreState): HomeMapSceneNames =>
  homeMapSceneNamesOf(state, ALL_DEVICES);

export function useHomeMapScene(map: HomeMap | null): RenderScene | null {
  const names = useStoreSelector(allSceneNames, sameHomeMapSceneNames);
  return useMemo(
    () =>
      map === null
        ? null
        : homeMapRenderScene({ map, live: homeMapSceneLive(names.rooms, names.devices) }),
    [map, names],
  );
}
