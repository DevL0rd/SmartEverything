import { ROOM_LIGHTS_MINIMUM, visibleLights } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export interface RoomLights {
  readonly lights: readonly Device[];
  readonly rest: readonly Device[];
}

export function splitRoomLights(devices: readonly Device[]): RoomLights | null {
  const lights = visibleLights(devices);
  if (lights.length < ROOM_LIGHTS_MINIMUM) {
    return null;
  }
  const carried = new Set(lights);
  return { lights, rest: devices.filter((device) => !carried.has(device)) };
}
