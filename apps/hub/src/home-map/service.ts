import {
  ApiError,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditBatch,
  type HomeMapEditResultAnswer,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapRevisionEntry,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type {
  HomeMapApplied,
  HomeMapHistoryMark,
  HomeMapRevisionFilter,
  HomeMapsRepository,
} from '../store/repositories/home-maps';
import { RevisionHistory, type HistoryDirection } from './revisions';

export interface HomeMapPorts {
  readonly maps: Pick<HomeMapsRepository, 'read' | 'revisions' | 'apply'>;
  readonly knownModel: (modelId: string) => boolean;
  readonly log: Logger;
}

const answerOf = (result: HomeMapApplied): HomeMapEditResultAnswer => ({
  revision: result.revision,
  conflicts: [...result.conflicts],
});

export class HomeMapService {
  private readonly histories = new Map<HomeMapId, RevisionHistory>();
  private readonly unknownModels = new Set<string>();

  constructor(private readonly ports: HomeMapPorts) {}

  get(mapId?: HomeMapId): HomeMap {
    const map = this.ports.maps.read(mapId);
    this.noteUnknownModels(map);
    return map;
  }

  revision(mapId?: HomeMapId): number {
    return this.ports.maps.read(mapId).revision;
  }

  revisions(filter?: HomeMapRevisionFilter): HomeMapRevisionEntry[] {
    return this.ports.maps.revisions(filter);
  }

  edit(batch: HomeMapEditBatch, actor: HomeMapActor, mapId?: HomeMapId): HomeMapEditResultAnswer {
    const current = this.revision(mapId);
    if (batch.baseRevision > current) {
      throw new ApiError(
        'conflict',
        `The edit was made on map revision ${String(batch.baseRevision)} but the hub is at ${String(current)}; load the map again.`,
      );
    }
    return answerOf(this.apply(batch.ops, actor, {}, mapId));
  }

  apply(
    ops: readonly HomeMapOp[],
    actor: HomeMapActor,
    mark: HomeMapHistoryMark = {},
    mapId?: HomeMapId,
  ): HomeMapApplied {
    const result = this.ports.maps.apply(ops, actor, mark, mapId);
    if (result.applied.length > 0) this.noteUnknownModels(result.map);
    return result;
  }

  undo(actor: HomeMapActor, mapId?: HomeMapId): HomeMapEditResultAnswer {
    return this.step(actor, 'undo', mapId);
  }

  redo(actor: HomeMapActor, mapId?: HomeMapId): HomeMapEditResultAnswer {
    return this.step(actor, 'redo', mapId);
  }

  forget(mapId: HomeMapId): void {
    this.histories.delete(mapId);
  }

  private historyOf(id: HomeMapId): RevisionHistory {
    const held = this.histories.get(id);
    if (held !== undefined) return held;
    const created = new RevisionHistory({
      revisions: (filter): HomeMapRevisionEntry[] =>
        this.ports.maps.revisions({ ...filter, mapId: id }),
    });
    this.histories.set(id, created);
    return created;
  }

  private step(
    actor: HomeMapActor,
    direction: HistoryDirection,
    mapId?: HomeMapId,
  ): HomeMapEditResultAnswer {
    const id = this.ports.maps.read(mapId).id;
    const result = this.historyOf(id).walk(actor, direction, (ops, mark) =>
      this.apply(ops, actor, mark, id),
    );
    return result === null ? { revision: this.revision(id), conflicts: [] } : answerOf(result);
  }

  private noteUnknownModels(map: HomeMap): void {
    for (const floor of map.floors) {
      for (const object of floor.objects) {
        const modelId: string = object.modelId;
        if (this.unknownModels.has(modelId) || this.ports.knownModel(modelId)) continue;
        this.unknownModels.add(modelId);
        this.ports.log.warn('home_map.unknown_model', {
          modelId,
          mapId: map.id,
          floorId: floor.id,
        });
      }
    }
  }
}
