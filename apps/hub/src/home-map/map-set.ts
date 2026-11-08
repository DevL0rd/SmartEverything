import {
  ApiError,
  type HomeMapActor,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapSummary,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HomeMapPatch, HomeMapsRepository } from '../store/repositories/home-maps';
import type { HomeMapService } from './service';

export interface MapSetPorts {
  readonly sets: Pick<HomeMapsRepository, 'ids' | 'list' | 'create' | 'update' | 'remove'>;
  readonly maps: Pick<HomeMapService, 'get' | 'apply' | 'forget'>;
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
    return this.ports.sets.list();
  }

  create(name: string, actor: HomeMapActor): HomeMapSummary {
    return this.ports.sets.create(name, actor);
  }

  update(mapId: HomeMapId, patch: HomeMapPatch, actor: HomeMapActor): HomeMapSummary {
    return this.ports.sets.update(mapId, patch, actor);
  }

  remove(mapId: HomeMapId): void {
    if (!this.ports.sets.remove(mapId)) {
      throw new ApiError('not_found', `There is no map ${mapId}.`);
    }
    this.ports.maps.forget(mapId);
    try {
      this.ports.removeScan(mapId);
    } catch (error) {
      this.ports.log.error('home_map.scan_removal_failed', { mapId, error: String(error) });
    }
  }

  placeDevice(placement: HomeMapPlacement, mapId: HomeMapId, actor: HomeMapActor): number {
    const ids = this.ports.sets.ids();
    if (!ids.includes(mapId)) throw new ApiError('not_found', `There is no map ${mapId}.`);
    const target = this.ports.maps.get(mapId);
    if (!target.floors.some((floor) => floor.id === placement.floorId)) {
      throw new ApiError('not_found', `There is no floor ${placement.floorId} on map ${mapId}.`);
    }
    const added = this.ports.maps.apply(
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
      const ops = placementsOf(this.ports.maps.get(other), placement.deviceId);
      if (ops.length > 0) this.ports.maps.apply(ops, actor, {}, other);
    }
    return added.revision;
  }
}
