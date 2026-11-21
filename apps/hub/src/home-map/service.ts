import {
  ApiError,
  HOME_MAP_ID,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditBatch,
  type HomeMapEditResultAnswer,
  type HomeMapId,
  type HomeMapOp,
  type HomeMapRevisionEntry,
  type HomeMapSummary,
  type LiveChange,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import {
  emptyHomeMap,
  listedOf,
  summaryOf,
  type HomeMapApplied,
  type HomeMapHistoryMark,
  type HomeMapPatch,
  type HomeMapRevisionFilter,
  type HomeMapSourceLocation,
} from '../store/repositories/home-maps';
import type { HomeMapStore } from './map-store';
import type { HomeMapBatch, HomeMapEntry, HomeMapSetView, HomeMapWritten } from './map-units';
import { RevisionHistory, type HistoryDirection } from './revisions';

export interface HomeMapPorts {
  readonly store: HomeMapStore;
  readonly knownModel: (modelId: string) => boolean;
  readonly applied: (result: HomeMapApplied, actor: HomeMapActor) => void;
  readonly now: () => string;
  readonly log: Logger;
}

export class HomeMapNotLoadedError extends Error {
  override readonly name = 'HomeMapNotLoadedError';

  constructor() {
    super('The home maps were read before they were loaded from the store.');
  }
}

export interface HomeMapReads {
  get(mapId?: HomeMapId): HomeMap;
  revision(mapId?: HomeMapId): number;
  ids(): HomeMapId[];
  defaultId(): HomeMapId | null;
  list(): HomeMapSummary[];
  sourceLocations(deviceId: string): HomeMapSourceLocation[];
}

export interface HeldMaps extends HomeMapReads {
  apply(
    ops: readonly HomeMapOp[],
    actor: HomeMapActor,
    mark?: HomeMapHistoryMark,
    mapId?: HomeMapId,
  ): Promise<HomeMapApplied>;
  applyAll(
    batches: readonly HomeMapBatch[],
    actor: HomeMapActor,
    refuseSourceConflictOn: HomeMapId | null,
  ): Promise<HomeMapApplied[]>;
  create(name: string, actor: HomeMapActor): Promise<HomeMapSummary>;
  update(mapId: HomeMapId, patch: HomeMapPatch, actor: HomeMapActor): Promise<HomeMapSummary>;
  remove(mapId: HomeMapId): Promise<boolean>;
}

export type HomeMapWork<T> = (held: HeldMaps) => Promise<T> | T;

const answerOf = (result: HomeMapApplied): HomeMapEditResultAnswer => ({
  revision: result.revision,
  conflicts: [...result.conflicts],
});

const notFound = (id: string): ApiError => new ApiError('not_found', `There is no map ${id}.`);

const byId = (a: { readonly id: string }, b: { readonly id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export class HomeMapService implements HomeMapReads {
  private readonly histories = new Map<HomeMapId, RevisionHistory>();
  private readonly unknownModels = new Set<string>();
  private readonly maps = new Map<HomeMapId, HomeMap>();
  private entries: readonly HomeMapEntry[] = [];
  private loading: Promise<void> | null = null;
  private ready = false;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly held: HeldMaps;

  constructor(private readonly ports: HomeMapPorts) {
    this.held = this.heldMaps();
  }

  load(): Promise<void> {
    this.loading ??= this.exclusive(() => this.reload());
    return this.loading;
  }

  follow(change: LiveChange): void {
    if (change.table !== 'home_maps' || this.loading === null) return;
    background(
      this.exclusive(() => (this.matches(change) ? undefined : this.reload())),
      'home_map.copy_refresh_failed',
    );
  }

  exclusive<T>(work: HomeMapWork<T>): Promise<T> {
    const next = this.tail.then(() => work(this.held));
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async settled(): Promise<void> {
    for (let seen = this.tail; ; seen = this.tail) {
      await seen;
      if (seen === this.tail) return;
    }
  }

  get(mapId?: HomeMapId): HomeMap {
    const map = this.read(mapId);
    this.noteUnknownModels(map);
    return map;
  }

  revision(mapId?: HomeMapId): number {
    return this.read(mapId).revision;
  }

  ids(): HomeMapId[] {
    return this.loadedEntries().map((entry) => entry.id);
  }

  defaultId(): HomeMapId | null {
    return this.loadedEntries().find((entry) => entry.isDefault)?.id ?? null;
  }

  list(): HomeMapSummary[] {
    return this.loadedEntries().flatMap((entry) => {
      const map = this.maps.get(entry.id);
      return map === undefined ? [] : [listedOf(map, entry)];
    });
  }

  sourceLocations(deviceId: string): HomeMapSourceLocation[] {
    return [...this.loadedMaps()].sort(byId).flatMap((map) =>
      map.sources
        .filter((source) => source.deviceId === deviceId)
        .sort(byId)
        .map((source) => ({ mapId: map.id, source })),
    );
  }

  revisions(filter: HomeMapRevisionFilter = {}): Promise<HomeMapRevisionEntry[]> {
    return this.ports.store.revisions(filter);
  }

  edit(
    batch: HomeMapEditBatch,
    actor: HomeMapActor,
    mapId?: HomeMapId,
  ): Promise<HomeMapEditResultAnswer> {
    return this.exclusive(async (held) => {
      const current = held.revision(mapId);
      if (batch.baseRevision > current) {
        throw new ApiError(
          'conflict',
          `The edit was made on map revision ${String(batch.baseRevision)} but the hub is at ${String(current)}; load the map again.`,
        );
      }
      return answerOf(await held.apply(batch.ops, actor, {}, mapId));
    });
  }

  apply(
    ops: readonly HomeMapOp[],
    actor: HomeMapActor,
    mark: HomeMapHistoryMark = {},
    mapId?: HomeMapId,
  ): Promise<HomeMapApplied> {
    return this.exclusive((held) => held.apply(ops, actor, mark, mapId));
  }

  undo(actor: HomeMapActor, mapId?: HomeMapId): Promise<HomeMapEditResultAnswer> {
    return this.exclusive((held) => this.step(held, actor, 'undo', mapId));
  }

  redo(actor: HomeMapActor, mapId?: HomeMapId): Promise<HomeMapEditResultAnswer> {
    return this.exclusive((held) => this.step(held, actor, 'redo', mapId));
  }

  forget(mapId: HomeMapId): void {
    this.histories.delete(mapId);
  }

  private heldMaps(): HeldMaps {
    return {
      get: (mapId) => this.get(mapId),
      revision: (mapId) => this.revision(mapId),
      ids: () => this.ids(),
      defaultId: () => this.defaultId(),
      list: () => this.list(),
      sourceLocations: (deviceId) => this.sourceLocations(deviceId),
      apply: async (ops, actor, mark = {}, mapId): Promise<HomeMapApplied> => {
        const [result] = await this.committed(() =>
          this.ports.store.apply({
            batches: [{ mapId: mapId ?? null, ops }],
            actor,
            mark,
            refuseSourceConflictOn: null,
          }),
        );
        if (result === undefined) throw new ApiError('internal', 'The map edit gave no result.');
        this.afterApply(result, actor);
        return result;
      },
      applyAll: async (batches, actor, refuseSourceConflictOn): Promise<HomeMapApplied[]> => {
        const results = await this.committed(() =>
          this.ports.store.apply({ batches, actor, mark: {}, refuseSourceConflictOn }),
        );
        for (const result of results) this.afterApply(result, actor);
        return results;
      },
      create: (name, actor) => this.committed(() => this.ports.store.create({ name, actor })),
      update: (mapId, patch, actor) =>
        this.committed(() => this.ports.store.update({ mapId, patch, actor })),
      remove: (mapId) => this.committed(() => this.ports.store.remove(mapId)),
    };
  }

  private async committed<T>(run: () => Promise<HomeMapWritten<T>>): Promise<T> {
    this.assertReady();
    const written = await run();
    this.take(written.view);
    return written.value;
  }

  private afterApply(result: HomeMapApplied, actor: HomeMapActor): void {
    if (result.applied.length === 0) return;
    this.noteUnknownModels(result.map);
    this.ports.applied(result, actor);
  }

  private async reload(): Promise<void> {
    const view = await this.ports.store.view();
    this.maps.clear();
    this.take(view);
    this.ready = true;
  }

  private take(view: HomeMapSetView): void {
    this.entries = view.entries;
    const present = new Set(view.entries.map((entry) => entry.id));
    for (const id of this.maps.keys()) if (!present.has(id)) this.maps.delete(id);
    for (const map of view.maps) this.maps.set(map.id, map);
  }

  private matches(change: Extract<LiveChange, { table: 'home_maps' }>): boolean {
    if (!this.ready) return false;
    if (change.operation === 'DELETE') {
      const { oldRecord } = change;
      return oldRecord !== null && !this.entries.some((entry) => entry.id === oldRecord.id);
    }
    const { record } = change;
    if (record === null) return false;
    const entry = this.entries.find((candidate) => candidate.id === record.id);
    const map = entry === undefined ? undefined : this.maps.get(entry.id);
    if (map === undefined || entry === undefined) return false;
    return JSON.stringify(summaryOf(map, entry)) === JSON.stringify(record);
  }

  private assertReady(): void {
    if (!this.ready) throw new HomeMapNotLoadedError();
  }

  private loadedEntries(): readonly HomeMapEntry[] {
    this.assertReady();
    return this.entries;
  }

  private loadedMaps(): IterableIterator<HomeMap> {
    this.assertReady();
    return this.maps.values();
  }

  private read(mapId?: HomeMapId): HomeMap {
    const id = mapId ?? this.defaultId();
    const found = id === null ? undefined : this.maps.get(id);
    if (found !== undefined) return found;
    if (mapId !== undefined && !this.mayCreate(mapId)) throw notFound(mapId);
    return emptyHomeMap(this.ports.now(), mapId);
  }

  private mayCreate(id: HomeMapId): boolean {
    return id === HOME_MAP_ID && this.loadedEntries().length === 0;
  }

  private historyOf(id: HomeMapId): RevisionHistory {
    const held = this.histories.get(id);
    if (held !== undefined) return held;
    const created = new RevisionHistory({
      revisions: (filter): Promise<HomeMapRevisionEntry[]> =>
        this.ports.store.revisions({ ...filter, mapId: id }),
    });
    this.histories.set(id, created);
    return created;
  }

  private async step(
    held: HeldMaps,
    actor: HomeMapActor,
    direction: HistoryDirection,
    mapId?: HomeMapId,
  ): Promise<HomeMapEditResultAnswer> {
    const id = held.get(mapId).id;
    const result = await this.historyOf(id).walk(actor, direction, (ops, mark) =>
      held.apply(ops, actor, mark, id),
    );
    return result === null ? { revision: held.revision(id), conflicts: [] } : answerOf(result);
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
