import type { HomeMapFloor } from '@smarteverything/domain';
import type { ActionTarget } from './object-actions';

export function selectionTarget(floor: HomeMapFloor, id: string | null): ActionTarget | null {
  if (id === null) return null;
  const object = floor.objects.find((item) => item.id === id);
  if (object !== undefined) return { kind: 'object', object };
  const placement = floor.placements.find((item) => item.deviceId === id);
  if (placement !== undefined) return { kind: 'device', placement };
  const room = floor.rooms.find((item) => item.id === id);
  return room === undefined ? null : { kind: 'room', room };
}
