import {
  ApiError,
  HOME_MAP_ID,
  HOME_MAP_MAP_ID,
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditResult,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapRevisionEntry,
  type HomeMapSource,
  type HomeMapSummary,
  type HomeMapSummaryRow,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { flag, jsonText } from '../sql';
import {
  ADD_SOURCE,
  CLEAR_SOURCES,
  DEFAULT_ENTRY,
  DELETE,
  ENTRIES,
  ENTRY,
  LOG,
  READ,
  REVISIONS,
  ROBOT_MAP_OWNER,
  SAVE,
  SET_DEFAULT,
  SET_ENTRY,
  SET_POSITION,
  SOURCES_OF_DEVICE,
  SOURCE_LOCATIONS,
  STORED_LOCATION,
  STORED_MAP,
  STORED_REVISION,
  STORED_SOURCE,
  OWNER,
  emptyHomeMap,
  listedOf,
  sourceProblem,
  summaryOf,
  type HomeMapApplied,
  type HomeMapHistoryMark,
  type HomeMapPatch,
  type HomeMapPublisher,
  type HomeMapRevisionFilter,
  type HomeMapSourceLocation,
  type SetEntry,
  type Target,
} from './home-maps-shape';

export {
  emptyHomeMap,
  listedOf,
  sourceLabel,
  summaryOf,
  type HomeMapApplied,
  type HomeMapHistoryMark,
  type HomeMapPatch,
  type HomeMapPublisher,
  type HomeMapRevisionFilter,
  type HomeMapSourceLocation,
} from './home-maps-shape';

const notFound = (id: string): ApiError => new ApiError('not_found', `There is no map ${id}.`);

export class HomeMapsRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly publish: HomeMapPublisher,
  ) {}

  ids(): HomeMapId[] {
    return this.entries().map((entry) => entry.id);
  }

  defaultId(): HomeMapId | null {
    return this.context.sql.get(SET_ENTRY, DEFAULT_ENTRY)?.id ?? null;
  }

  stored(mapId?: HomeMapId): HomeMap | null {
    const id = mapId ?? this.defaultId();
    if (id === null) return null;
    return this.context.sql.get(STORED_MAP, READ, { id })?.document ?? null;
  }

  read(mapId?: HomeMapId): HomeMap {
    const found = this.stored(mapId);
    if (found !== null) return found;
    if (mapId !== undefined && !this.mayCreate(mapId)) throw notFound(mapId);
    return emptyHomeMap(this.context.now(), mapId);
  }

  summary(mapId?: HomeMapId): HomeMapSummaryRow | null {
    const target = this.target(mapId);
    return target.before === null || target.entry === null
      ? null
      : summaryOf(target.before, target.entry);
  }

  list(): HomeMapSummary[] {
    return this.entries().flatMap((entry) => {
      const map = this.stored(entry.id);
      return map === null ? [] : [listedOf(map, entry)];
    });
  }

  revisions(filter: HomeMapRevisionFilter = {}): HomeMapRevisionEntry[] {
    const id = filter.mapId ?? this.defaultId() ?? HOME_MAP_ID;
    return this.context.sql
      .all(STORED_REVISION, REVISIONS, {
        id,
        after: filter.after ?? 0,
        actor: filter.actor ?? null,
      })
      .map(({ undoes, redoes, ...entry }) => ({
        ...entry,
        ...(undoes === null ? {} : { undoes }),
        ...(redoes === null ? {} : { redoes }),
      }));
  }

  sourcesOfDevice(deviceId: string, mapId?: HomeMapId): HomeMapSource[] {
    const id = mapId ?? this.defaultId() ?? HOME_MAP_ID;
    return this.context.sql
      .all(STORED_SOURCE, SOURCES_OF_DEVICE, { id, deviceId })
      .map((row) => row.document);
  }

  sourceLocations(deviceId: string): HomeMapSourceLocation[] {
    return this.context.sql
      .all(STORED_LOCATION, SOURCE_LOCATIONS, { deviceId })
      .map((row) => ({ mapId: row.mapId, source: row.document }));
  }

  apply(
    ops: readonly HomeMapOp[],
    actor: HomeMapActor,
    mark: HomeMapHistoryMark = {},
    mapId?: HomeMapId,
  ): HomeMapApplied {
    return this.context.write(() => {
      const target = this.target(mapId);
      if (target.before === null && !this.mayCreate(target.id)) throw notFound(target.id);
      const base = target.before ?? emptyHomeMap(this.context.now(), target.id);
      const result = applyHomeMapEdits(base, ops, { actor, at: this.context.now() });
      if (result.applied.length > 0) this.save(target, result, actor, mark);
      return { ...result, revision: result.map.revision };
    });
  }

  create(name: string, actor: HomeMapActor): HomeMapSummary {
    return this.context.write(() => {
      const entries = this.entries();
      const at = this.context.now();
      const set = {
        position: entries.reduce((next, entry) => Math.max(next, entry.position + 1), 0),
        isDefault: entries.length === 0,
      };
      const map = {
        ...emptyHomeMap(at, HOME_MAP_MAP_ID.parse(this.context.newId()), name),
        revision: 1,
      };
      this.store(map, set);
      this.log(map, { applied: [], inverse: [] }, actor, {});
      this.publish('INSERT', summaryOf(map, set), null);
      return listedOf(map, set);
    });
  }

  update(mapId: HomeMapId, patch: HomeMapPatch, actor: HomeMapActor): HomeMapSummary {
    return this.context.write(() => {
      const before = this.entries();
      if (!before.some((entry) => entry.id === mapId)) throw notFound(mapId);
      if (patch.name !== undefined) {
        this.apply([{ op: 'setMap', patch: { name: patch.name } }], actor, {}, mapId);
      }
      if (patch.isDefault === true) this.makeDefault(mapId);
      if (patch.position !== undefined) this.move(mapId, patch.position);
      this.publishSetChanges(before);
      const map = this.read(mapId);
      return listedOf(map, this.entryOf(mapId));
    });
  }

  remove(mapId: HomeMapId): boolean {
    return this.context.write(() => {
      const before = this.entries();
      const removed = before.find((entry) => entry.id === mapId);
      const map = this.stored(mapId);
      if (removed === undefined || map === null) return false;
      this.context.sql.run('delete the home map', DELETE, { id: mapId });
      const rest = before.filter((entry) => entry.id !== mapId);
      const first = rest[0];
      if (removed.isDefault && first !== undefined) this.setDefault(first.id, true);
      this.renumber(rest.map((entry) => entry.id));
      this.publish('DELETE', null, summaryOf(map, removed));
      this.publishSetChanges(rest);
      return true;
    });
  }

  private entries(): SetEntry[] {
    return this.context.sql.all(SET_ENTRY, ENTRIES);
  }

  private entryOf(id: HomeMapId): SetEntry {
    const entry = this.context.sql.get(SET_ENTRY, ENTRY, { id });
    if (entry === undefined) throw notFound(id);
    return entry;
  }

  private mayCreate(id: HomeMapId): boolean {
    return id === HOME_MAP_ID && this.defaultId() === null && this.entries().length === 0;
  }

  private target(mapId?: HomeMapId): Target {
    const id = mapId ?? this.defaultId() ?? HOME_MAP_ID;
    const entry = this.context.sql.get(SET_ENTRY, ENTRY, { id }) ?? null;
    const before = entry === null ? null : this.stored(id);
    return { id, before, entry };
  }

  private makeDefault(id: HomeMapId): void {
    for (const entry of this.entries()) {
      if (entry.isDefault && entry.id !== id) this.setDefault(entry.id, false);
    }
    this.setDefault(id, true);
  }

  private setDefault(id: HomeMapId, isDefault: boolean): void {
    this.context.sql.run('set the default home map', SET_DEFAULT, {
      id,
      isDefault: flag(isDefault),
    });
  }

  private move(id: HomeMapId, position: number): void {
    const order = this.ids().filter((candidate) => candidate !== id);
    order.splice(Math.min(position, order.length), 0, id);
    this.renumber(order);
  }

  private renumber(order: readonly HomeMapId[]): void {
    for (const [position, id] of order.entries()) {
      this.context.sql.run('order the home maps', SET_POSITION, { id, position });
    }
  }

  private publishSetChanges(before: readonly SetEntry[]): void {
    for (const previous of before) {
      const entry = this.context.sql.get(SET_ENTRY, ENTRY, { id: previous.id });
      const map = this.stored(previous.id);
      const unchanged =
        entry?.position === previous.position && entry.isDefault === previous.isDefault;
      if (entry === undefined || map === null || unchanged) continue;
      this.publish('UPDATE', summaryOf(map, entry), summaryOf(map, previous));
    }
  }

  private store(map: HomeMap, set: Pick<SetEntry, 'position' | 'isDefault'>): void {
    this.context.sql.run('save the home map', SAVE, {
      id: map.id,
      revision: map.revision,
      document: jsonText(map),
      updatedAt: map.updatedAt,
      position: set.position,
      isDefault: flag(set.isDefault),
    });
  }

  private log(
    map: HomeMap,
    result: Pick<HomeMapEditResult, 'applied' | 'inverse'>,
    actor: HomeMapActor,
    mark: HomeMapHistoryMark,
  ): void {
    this.context.sql.run('log the home map revision', LOG, {
      id: map.id,
      revision: map.revision,
      ops: jsonText(result.applied),
      inverse: jsonText(result.inverse),
      actor,
      at: map.updatedAt,
      undoes: mark.undoes ?? null,
      redoes: mark.redoes ?? null,
    });
  }

  private save(
    target: Target,
    result: HomeMapEditResult,
    actor: HomeMapActor,
    mark: HomeMapHistoryMark,
  ): void {
    const { map } = result;
    const set = target.entry ?? { position: 0, isDefault: true };
    this.checkSources(map);
    this.store(map, set);
    this.log(map, result, actor, mark);
    this.syncSources(map);
    this.publish(
      target.before === null ? 'INSERT' : 'UPDATE',
      summaryOf(map, set),
      target.before === null ? null : summaryOf(target.before, set),
    );
  }

  private checkSources(map: HomeMap): void {
    const problem = sourceProblem(map);
    if (problem !== null) throw new ApiError('conflict', problem);
    for (const source of map.sources) {
      if (source.robotMapId === undefined) continue;
      const owner = this.context.sql.get(OWNER, ROBOT_MAP_OWNER, {
        id: map.id,
        deviceId: source.deviceId,
        robotMapId: source.robotMapId,
      });
      if (owner !== undefined) {
        throw new ApiError(
          'conflict',
          `Robot map ${String(source.robotMapId)} of that device already feeds the map ${owner.mapId}.`,
        );
      }
    }
  }

  private syncSources(map: HomeMap): void {
    this.context.sql.run('clear the home map sources', CLEAR_SOURCES, { id: map.id });
    for (const source of map.sources) {
      this.context.sql.run('record the home map source', ADD_SOURCE, {
        id: map.id,
        sourceId: source.id,
        kind: source.kind,
        deviceId: source.deviceId,
        document: jsonText(source),
        robotMapId: source.robotMapId ?? null,
      });
    }
  }
}
