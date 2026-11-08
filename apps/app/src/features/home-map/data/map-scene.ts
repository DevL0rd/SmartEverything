import { useMemo } from 'react';
import type { HomeMap } from '@smarteverything/domain';
import {
  homeMapRenderScene,
  type HomeMapSceneDevice,
  type HomeMapSceneLive,
} from '../../../components/house-map/adapters/home-map-scene';
import type { RenderScene } from '../../../components/house-map/render-scene';
import { useDevices, useRooms } from '../../../store/selectors';
import type { Device } from '../../../store/state';

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

export function useHomeMapScene(map: HomeMap | null): RenderScene | null {
  const rooms = useRooms();
  const devices = useDevices();
  return useMemo(
    () =>
      map === null ? null : homeMapRenderScene({ map, live: homeMapSceneLive(rooms, devices) }),
    [map, rooms, devices],
  );
}
