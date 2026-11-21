import {
  ApiError,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapSummary,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HomeMapPatch } from '../store/repositories/home-maps';
import type { HomeMapService } from './service';

export interface MapSetPorts {
  readonly maps: Pick<HomeMapService, 'exclusive' | 'list' | 'forget'>;
  readonly removeScan: (mapId: HomeMapId) => void;
  readonly log: Logger;
}

const placementsOf = (map: ReturnType<HomeMapService['get']>, deviceId: string): HomeMapOp[] =>
  map.floors.flatMap((floor) =>
    floor.placements
      .filter((placement) => placement.deviceId === deviceId)
      .map((placement): HomeMapOp => ({
        op: 'remove',
        kind: 'placement',
        floorId: floor.id,
        id: placement.deviceId,
      })),
  );

const addOp = (placement: HomeMapPlacement): HomeMapOp => ({
  op: 'add',
  kind: 'placement',
  floorId: placement.floorId,
  element: placement,
});

export class HomeMapSet {
  constructor(private readonly ports: MapSetPorts) {}

  list(): HomeMapSummary[] {
    return this.ports.maps.list();
  }

  create(name: string, actor: HomeMapActor): Promise<HomeMapSummary> {
    return this.ports.maps.exclusive((maps) => maps.create(name, actor));
  }

  update(mapId: HomeMapId, patch: HomeMapPatch, actor: HomeMapActor): Promise<HomeMapSummary> {
    return this.ports.maps.exclusive((maps) => maps.update(mapId, patch, actor));
  }

  async remove(mapId: HomeMapId): Promise<void> {
    if (!(await this.ports.maps.exclusive((maps) => maps.remove(mapId)))) {
      throw new ApiError('not_found', `There is no map ${mapId}.`);
    }
    this.ports.maps.forget(mapId);
    try {
      this.ports.removeScan(mapId);
    } catch (error) {
      this.ports.log.error('home_map.scan_removal_failed', { mapId, error: String(error) });
    }
  }

  placeDevice(placement: HomeMapPlacement, mapId: HomeMapId, actor: HomeMapActor): Promise<number> {
    return this.ports.maps.exclusive(async (maps) => {
      const ids = maps.ids();
      if (!ids.includes(mapId)) throw new ApiError('not_found', `There is no map ${mapId}.`);
      const target = maps.get(mapId);
      if (!target.floors.some((floor) => floor.id === placement.floorId)) {
        throw new ApiError('not_found', `There is no floor ${placement.floorId} on map ${mapId}.`);
      }
      const added = await maps.apply(
        [...placementsOf(target, placement.deviceId), addOp(placement)],
        actor,
        {},
        mapId,
      );
      if (!added.applied.some((op) => op.op === 'add')) {
        throw new ApiError(
          'conflict',
          `The device cannot be placed on floor ${placement.floorId} of map ${mapId}.`,
        );
      }
      for (const other of ids.filter((id) => id !== mapId)) {
        const ops = placementsOf(maps.get(other), placement.deviceId);
        if (ops.length > 0) await maps.apply(ops, actor, {}, other);
      }
      return added.revision;
    });
  }
}
