import { useListedDevices, useRooms } from '../../../store/selectors';
import type { RequestNames } from '../model/requests';

export function useRequestNames(): RequestNames {
  const rooms = useRooms();
  const devices = useListedDevices();
  return {
    places: new Map([
      ...rooms.map((room): [string, string] => [room.id, room.name]),
      ...devices.map((device): [string, string] => [device.id, device.label]),
    ]),
  };
}
