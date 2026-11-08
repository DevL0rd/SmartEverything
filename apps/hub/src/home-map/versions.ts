import {
  ApiError,
  diffHomeMaps,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditResultAnswer,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapVersion,
  type HomeMapVersionId,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HomeMapVersionsRepository } from '../store/repositories/home-map-versions';
import type { HomeMapService } from './service';

export interface VersionPorts {
  readonly versions: Pick<HomeMapVersionsRepository, 'save' | 'list' | 'read'>;
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly mapIds: () => readonly HomeMapId[];
  readonly log: Logger;
}

const placedDevices = (map: HomeMap): string[] =>
  map.floors.flatMap((floor) => floor.placements.map((placement) => placement.deviceId));

const addsPlacementOf = (op: HomeMapOp, taken: ReadonlySet<string>): boolean => {
  if (op.op !== 'add' || op.kind !== 'placement') return false;
  const deviceId: unknown = op.element['deviceId'];
  return typeof deviceId === 'string' && taken.has(deviceId);
};

export class HomeMapVersions {
  constructor(private readonly ports: VersionPorts) {}

  list(mapId: HomeMapId): HomeMapVersion[] {
    this.ports.maps.get(mapId);
    return this.ports.versions.list(mapId);
  }

  save(mapId: HomeMapId, name: string | undefined, actor: HomeMapActor): HomeMapVersion {
    const map = this.ports.maps.get(mapId);
    return this.ports.versions.save(mapId, map, name ?? null, actor);
  }

  restore(
    mapId: HomeMapId,
    versionId: HomeMapVersionId,
    actor: HomeMapActor,
  ): HomeMapEditResultAnswer {
    const saved = this.ports.versions.read(mapId, versionId);
    if (saved === null) {
      throw new ApiError('not_found', `Map ${mapId} has no saved version ${versionId}.`);
    }
    const current = this.ports.maps.get(mapId);
    const { ops } = diffHomeMaps(current, saved.document);
    const wanted = this.withoutMovedPlacements(mapId, ops);
    if (wanted.length === 0) return { revision: current.revision, conflicts: [] };
    const applied = this.ports.maps.apply(wanted, actor, {}, mapId);
    return { revision: applied.revision, conflicts: [...applied.conflicts] };
  }

  private withoutMovedPlacements(mapId: HomeMapId, ops: readonly HomeMapOp[]): HomeMapOp[] {
    const elsewhere = new Set(
      this.ports
        .mapIds()
        .filter((id) => id !== mapId)
        .flatMap((id) => placedDevices(this.ports.maps.get(id))),
    );
    const wanted = ops.filter((op) => !addsPlacementOf(op, elsewhere));
    if (wanted.length < ops.length) {
      this.ports.log.info('home_map.restore_kept_placements_elsewhere', {
        mapId,
        skipped: ops.length - wanted.length,
      });
    }
    return wanted;
  }
}
