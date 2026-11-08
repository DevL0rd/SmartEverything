import type { HomeMapObject, HomeMapOp } from '@smarteverything/domain';

export function objectOp(floorId: string, id: string, patch: Partial<HomeMapObject>): HomeMapOp {
  return { op: 'update', kind: 'object', floorId, id, patch: { ...patch } };
}
