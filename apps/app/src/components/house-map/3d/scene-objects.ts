import type { ModelSpec } from '@smarteverything/domain';
import { Group, type Box3, type Mesh, type Object3D } from 'three';
import type { RenderFloor, RenderObject, RenderPlacement } from '../render-scene';
import type { StructureTheme } from './floor-looks';
import {
  boxBounds,
  boxLabel,
  boxesMesh,
  deviceKey,
  disposeBoxes,
  objectKey,
  type SceneItemKind,
  type SceneObjectLabel,
} from './scene-object-boxes';
import {
  batchKey,
  hasSignals,
  modelledDevice,
  modelledObject,
  planFloor,
  type Modelled,
  type Walls,
} from './scene-object-plan';
import { clearMerged, measure, mergeStatics, type SceneMeasure } from './scene-merge';

export {
  DEVICE_BOX_METRES,
  deviceKey,
  objectKey,
  type SceneItemKind,
  type SceneObjectLabel,
} from './scene-object-boxes';

export type SceneObjectsFloor = Pick<
  RenderFloor,
  'id' | 'elevation' | 'objects' | 'placements' | 'walls'
>;

export type SceneObjectLod = 0 | 1 | 2;

export interface SceneObjectModelOptions {
  readonly lod: SceneObjectLod;
  readonly finish?: string | undefined;
  readonly params?: Readonly<Record<string, number>> | undefined;
}

export interface SceneObjectModel {
  readonly object3d: Object3D;
  readonly dispose: () => void;
}

export interface SceneObjectModelSet<M extends SceneObjectModel> {
  readonly object3d: Object3D;
  readonly createSceneModel: (spec: ModelSpec, options: SceneObjectModelOptions) => M;
  readonly updateInstances: () => void;
  readonly dispose: () => void;
}

export interface SceneObjectModelSetup {
  readonly instancing: boolean;
}

export interface SceneObjectsInput<M extends SceneObjectModel> {
  readonly createModelSet: (setup: SceneObjectModelSetup) => SceneObjectModelSet<M>;
  readonly floors: readonly SceneObjectsFloor[];
  readonly specOf: (modelId: string) => ModelSpec | undefined;
  readonly deviceSpecOf: (placement: RenderPlacement) => ModelSpec | undefined;
  readonly theme: StructureTheme;
  readonly selectedKey?: string | null | undefined;
  readonly lodOf?: ((key: string) => SceneObjectLod) | undefined;
}

export interface SceneObjectItem<M extends SceneObjectModel> {
  readonly key: string;
  readonly kind: SceneItemKind;
  readonly floorId: string;
  readonly lod: SceneObjectLod | null;
  readonly model: M | null;
  readonly box: Box3 | null;
}

export type SceneObjectsStats = SceneMeasure;

export type ScenePosed =
  | { readonly kind: 'object'; readonly item: RenderObject }
  | { readonly kind: 'device'; readonly item: RenderPlacement };

export interface SceneObjects<M extends SceneObjectModel> {
  readonly root: Group;
  readonly item: (key: string) => SceneObjectItem<M> | undefined;
  readonly keys: () => readonly string[];
  readonly labels: readonly SceneObjectLabel[];
  readonly select: (key: string | null) => void;
  readonly pose: (posed: readonly ScenePosed[]) => void;
  readonly refreshLevels: () => void;
  readonly stats: () => SceneObjectsStats;
  readonly dispose: () => void;
}

type Bucket = 'instanced' | 'merged';

interface FloorBuild<M extends SceneObjectModel> {
  readonly id: string;
  readonly group: Group;
  readonly instanced: SceneObjectModelSet<M>;
  readonly sources: SceneObjectModelSet<M>;
  readonly merged: Group;
  readonly entries: readonly Modelled[];
  readonly walls: Walls;
  readonly boxes: Mesh | null;
}

interface Live<M extends SceneObjectModel> {
  readonly floor: FloorBuild<M>;
  readonly entry: Modelled;
  readonly model: M;
  readonly lod: SceneObjectLod;
  readonly bucket: Bucket;
}

class SceneObjectsBuild<M extends SceneObjectModel> implements SceneObjects<M> {
  readonly root = new Group();
  readonly labels: SceneObjectLabel[] = [];
  private readonly live = new Map<string, Live<M>>();
  private readonly boxes = new Map<string, SceneObjectItem<M>>();
  private readonly floors: FloorBuild<M>[] = [];
  private posed: ReadonlyMap<string, Modelled> = new Map();
  private selected: string | null;

  constructor(private readonly input: SceneObjectsInput<M>) {
    this.root.name = 'scene-objects';
    this.selected = input.selectedKey ?? null;
    for (const floor of input.floors) this.addFloor(floor);
  }

  item(key: string): SceneObjectItem<M> | undefined {
    const live = this.live.get(key);
    if (live === undefined) return this.boxes.get(key);
    const { entry, floor, model, lod } = live;
    return { key, kind: entry.kind, floorId: floor.id, lod, model, box: null };
  }

  stats(): SceneObjectsStats {
    return measure(this.root);
  }

  keys(): readonly string[] {
    return [...this.live.keys(), ...this.boxes.keys()];
  }

  select(key: string | null): void {
    const previous = this.selected;
    if (previous === key) return;
    this.selected = key;
    const touched = new Set<FloorBuild<M>>();
    for (const changed of [previous, key]) {
      const live = changed === null ? undefined : this.live.get(changed);
      if (live !== undefined) touched.add(live.floor);
    }
    for (const floor of touched) this.assign(floor);
  }

  pose(posed: readonly ScenePosed[]): void {
    const previous = this.posed;
    const next = new Map<string, Modelled>();
    for (const each of posed) {
      const modelled = this.modelledOf(each);
      if (modelled !== null) next.set(modelled.key, modelled);
    }
    this.posed = next;
    const keys = new Set([...previous.keys(), ...next.keys()]);
    const sameKeys = keys.size === previous.size && keys.size === next.size;
    const floors = new Set([...keys].flatMap((key) => this.live.get(key)?.floor ?? []));
    for (const floor of floors) {
      if (sameKeys) this.restateAll(floor);
      else this.assign(floor);
    }
  }

  refreshLevels(): void {
    for (const floor of this.floors) this.assign(floor);
  }

  dispose(): void {
    for (const floor of this.floors.splice(0)) {
      clearMerged(floor.merged);
      floor.instanced.dispose();
      floor.sources.dispose();
      if (floor.boxes !== null) disposeBoxes(floor.boxes);
    }
    this.live.clear();
    this.boxes.clear();
    this.root.removeFromParent();
  }

  private lodFor(key: string): SceneObjectLod {
    const base = this.input.lodOf?.(key) ?? 0;
    return key === this.selected && base === 0 ? 1 : base;
  }

  private create(floor: FloorBuild<M>, entry: Modelled, lod: SceneObjectLod, bucket: Bucket): M {
    const set = bucket === 'merged' ? floor.sources : floor.instanced;
    const model = set.createSceneModel(entry.spec, {
      lod,
      finish: entry.finish,
      params: entry.params,
    });
    entry.place(model.object3d);
    set.object3d.add(model.object3d);
    return model;
  }

  private dynamic(entry: Modelled): boolean {
    return entry.key === this.selected || this.posed.has(entry.key) || hasSignals(entry.spec);
  }

  private entryOf(entry: Modelled): Modelled {
    return this.posed.get(entry.key) ?? entry;
  }

  private modelledOf(posed: ScenePosed): Modelled | null {
    const key = posed.kind === 'object' ? objectKey(posed.item.id) : deviceKey(posed.item.deviceId);
    const live = this.live.get(key);
    if (live === undefined) return null;
    return posed.kind === 'object'
      ? modelledObject(posed.item, live.entry.spec, live.floor.walls)
      : modelledDevice(posed.item, live.entry.spec, live.floor.walls);
  }

  private restateAll(floor: FloorBuild<M>): void {
    for (const base of floor.entries) {
      const entry = this.entryOf(base);
      const live = this.live.get(entry.key);
      if (live !== undefined && live.entry !== entry) this.restate(live, entry);
    }
    floor.instanced.updateInstances();
  }

  private restate(current: Live<M>, entry: Modelled): void {
    const same = batchKey(entry, current.lod) === batchKey(current.entry, current.lod);
    const model = same
      ? current.model
      : this.create(current.floor, entry, current.lod, current.bucket);
    if (same) entry.place(model.object3d);
    else current.model.dispose();
    this.live.set(entry.key, { ...current, entry, model });
  }

  private buckets(
    floor: FloorBuild<M>,
    levels: ReadonlyMap<string, SceneObjectLod>,
  ): Map<string, Bucket> {
    const repeats = new Map<string, number>();
    const entries = floor.entries.map((entry) => this.entryOf(entry));
    const batchOf = (entry: Modelled): string => batchKey(entry, levels.get(entry.key) ?? 0);
    for (const entry of entries) {
      if (!this.dynamic(entry)) repeats.set(batchOf(entry), (repeats.get(batchOf(entry)) ?? 0) + 1);
    }
    const single = (entry: Modelled): boolean =>
      !this.dynamic(entry) && repeats.get(batchOf(entry)) === 1;
    return new Map(entries.map((entry) => [entry.key, single(entry) ? 'merged' : 'instanced']));
  }

  private assign(floor: FloorBuild<M>): void {
    const levels = new Map(floor.entries.map((entry) => [entry.key, this.lodFor(entry.key)]));
    const buckets = this.buckets(floor, levels);
    for (const base of floor.entries) {
      const entry = this.entryOf(base);
      const lod = levels.get(entry.key) ?? 0;
      const bucket = buckets.get(entry.key) ?? 'instanced';
      const current = this.live.get(entry.key);
      if (current?.lod === lod && current.bucket === bucket) {
        if (current.entry !== entry) this.restate(current, entry);
        continue;
      }
      const model = this.create(floor, entry, lod, bucket);
      current?.model.dispose();
      this.live.set(entry.key, { floor, entry, model, lod, bucket });
    }
    floor.instanced.updateInstances();
    floor.sources.updateInstances();
    const sources = floor.entries.flatMap((entry) => {
      const live = this.live.get(entry.key);
      return live?.bucket === 'merged' ? [live.model.object3d] : [];
    });
    mergeStatics(floor.merged, sources, floor.group);
  }

  private addFloor(floor: SceneObjectsFloor): void {
    const walls: Walls = new Map(floor.walls.map((wall) => [wall.id, wall]));
    const plan = planFloor(floor, walls, this.input);
    const group = new Group();
    group.name = `floor:${floor.id}`;
    group.position.y = floor.elevation;
    const instanced = this.input.createModelSet({ instancing: true });
    const sources = this.input.createModelSet({ instancing: false });
    sources.object3d.name = 'merge-sources';
    sources.object3d.visible = false;
    const merged = new Group();
    merged.name = 'merged-statics';
    group.add(instanced.object3d, sources.object3d, merged);
    const boxes = boxesMesh(plan.unknown, this.input.theme);
    if (boxes !== null) group.add(boxes);
    const build: FloorBuild<M> = {
      id: floor.id,
      group,
      instanced,
      sources,
      merged,
      entries: plan.modelled,
      walls,
      boxes,
    };
    this.floors.push(build);
    this.root.add(group);
    this.assign(build);
    for (const box of plan.unknown) {
      const bounds = boxBounds(box, floor.elevation);
      const { key, kind } = box;
      this.boxes.set(key, { key, kind, floorId: floor.id, lod: null, model: null, box: bounds });
      this.labels.push(boxLabel(box, floor.id, bounds));
    }
  }
}

export function buildSceneObjects<M extends SceneObjectModel>(
  input: SceneObjectsInput<M>,
): SceneObjects<M> {
  return new SceneObjectsBuild(input);
}
