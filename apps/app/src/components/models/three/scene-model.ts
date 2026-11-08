import type {
  ModelExtraRole,
  ModelRef,
  ModelResolution,
  ModelSpec,
  ModelSpecAnchor,
} from '@smarteverything/domain';
import { Box3, Group, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from 'three';
import {
  buildModel,
  createModelResources,
  type BuiltModel,
  type BuiltPart,
  type ModelResources,
} from './build-model';
import type { ModelLod, ModelParamValues } from './geometry';
import {
  DEGREE,
  channelParts,
  emitterOf,
  lookOf,
  signalSetter,
  targetOf,
  type Emitter,
  type Look,
  type SceneEmitter,
  type SceneSignalSetter,
  type Target,
} from './scene-signals';
import { sizedModel, type SizedModel } from './sized-model';

export type { SceneEmitter, SceneSignalOptions, SceneSignalSetter } from './scene-signals';

export interface SceneModelOptions {
  readonly lod: ModelLod;
  readonly finish?: string | undefined;
  readonly params?: ModelParamValues | undefined;
}

export interface SceneHitBox {
  readonly id: string;
  readonly node: Object3D;
  readonly box: Box3;
}

export interface SceneModel {
  readonly object3d: Group;
  readonly setSignals: SceneSignalSetter;
  readonly emitters: readonly SceneEmitter[];
  readonly hitBoxes: readonly SceneHitBox[];
  readonly dispose: () => void;
}

export interface SceneModelSet {
  readonly object3d: Group;
  readonly createSceneModel: (spec: ModelSpec, options: SceneModelOptions) => SceneModel;
  readonly updateInstances: () => void;
  readonly dispose: () => void;
}

export interface SceneRole {
  readonly role: 'main' | ModelExtraRole;
  readonly ref: ModelRef;
  readonly finish: string | undefined;
  readonly params: ModelParamValues | undefined;
}

interface Batch {
  readonly key: string;
  readonly spec: ModelSpec;
  readonly template: BuiltModel;
  readonly sized: SizedModel;
  readonly resources: ModelResources;
  readonly perItem: ReadonlySet<string>;
  readonly matrices: ReadonlyMap<string, Matrix4>;
  readonly items: Map<Group, () => void>;
  readonly instanced: InstancedMesh[];
}

interface ItemBuild {
  readonly group: Group;
  readonly targets: Map<string, Target>;
  readonly emitters: Emitter[];
  readonly hitBoxes: SceneHitBox[];
  readonly looks: Look[];
}

function perItemParts(spec: ModelSpec, template: BuiltModel, instancing: boolean): Set<string> {
  if (!instancing) return new Set(template.parts.map((part) => part.id));
  const targets = channelParts(spec).targeted;
  const parentOf = new Map(template.parts.map((part) => [part.id, part.parent]));
  const moves = (id: string | null | undefined): boolean =>
    id !== null && id !== undefined && (targets.has(id) || moves(parentOf.get(id)));
  return new Set(template.parts.filter((part) => moves(part.id)).map((part) => part.id));
}

function createBatch(
  key: string,
  spec: ModelSpec,
  options: SceneModelOptions,
  instancing: boolean,
): Batch {
  const resources = createModelResources();
  const { lod, finish, params } = options;
  const template = buildModel(spec, { lod, finish, params, resources });
  template.group.updateMatrixWorld(true);
  return {
    key,
    spec,
    template,
    sized: sizedModel(spec, params ?? {}),
    resources,
    perItem: perItemParts(spec, template, instancing),
    matrices: new Map(template.parts.map((part) => [part.id, part.mesh.matrixWorld.clone()])),
    items: new Map(),
    instanced: [],
  };
}

function partMesh(part: BuiltPart, look: Look | null): Mesh {
  const mesh = new Mesh(part.mesh.geometry, look?.material ?? part.mesh.material);
  mesh.name = part.id;
  mesh.visible = part.mesh.visible;
  mesh.renderOrder = part.mesh.renderOrder;
  mesh.position.copy(part.mesh.position);
  mesh.rotation.copy(part.mesh.rotation);
  mesh.scale.copy(part.mesh.scale);
  return mesh;
}

function itemMeshes(
  batch: Batch,
  build: ItemBuild,
  targeted: ReadonlySet<string>,
): Map<string, Object3D> {
  const { looked } = channelParts(batch.spec);
  const nodes = new Map<string, Object3D>();
  for (const part of batch.template.parts) {
    if (!batch.perItem.has(part.id)) continue;
    const look = looked.has(part.id) ? lookOf(part.mesh.material) : null;
    const mesh = partMesh(part, look);
    if (look !== null) build.looks.push(look);
    nodes.set(part.id, mesh);
    const poses = batch.spec.parts.find((spec) => spec.id === part.id)?.poses ?? {};
    if (targeted.has(part.id)) build.targets.set(part.id, { ...targetOf(mesh, look, null), poses });
  }
  return nodes;
}

function attachParts(batch: Batch, build: ItemBuild): void {
  const { targeted } = channelParts(batch.spec);
  const nodes = itemMeshes(batch, build, targeted);
  const at = attachPoint(batch, build.group, nodes);
  for (const part of batch.template.parts) {
    const node = nodes.get(part.id);
    if (node !== undefined) at(part.parent).add(node);
  }
  const built = new Set(batch.template.parts.map((part) => part.id));
  for (const anchor of batch.spec.anchors ?? []) {
    if (anchor.parent === undefined || built.has(anchor.parent)) {
      attachAnchor(anchor, at, build, { targeted, stretch: batch.sized.stretch });
    }
  }
}

function attachPoint(
  batch: Batch,
  group: Group,
  nodes: Map<string, Object3D>,
): (parent: string | null | undefined) => Object3D {
  const holders = new Map<string, Object3D>();
  return (parent) => {
    const node = parent === null || parent === undefined ? group : nodes.get(parent);
    if (node !== undefined) return node;
    const matrix = batch.matrices.get(parent ?? '');
    if (matrix === undefined || parent === null || parent === undefined) return group;
    const made = holders.get(parent) ?? new Object3D();
    made.name = `${parent}:static`;
    made.matrixAutoUpdate = false;
    made.matrix.copy(matrix);
    group.add(made);
    holders.set(parent, made);
    return made;
  };
}

interface AnchorFit {
  readonly targeted: ReadonlySet<string>;
  readonly stretch: Vector3;
}

function attachAnchor(
  anchor: ModelSpecAnchor,
  at: (parent: string | undefined) => Object3D,
  build: ItemBuild,
  fit: AnchorFit,
): void {
  const { targeted } = fit;
  const stretch = anchor.parent === undefined ? fit.stretch : new Vector3(1, 1, 1);
  const node = new Object3D();
  node.name = anchor.id;
  node.position.fromArray(anchor.position ?? [0, 0, 0]).multiply(stretch);
  const [rx, ry, rz] = anchor.rotation ?? [0, 0, 0];
  node.rotation.set(rx * DEGREE, ry * DEGREE, rz * DEGREE);
  at(anchor.parent).add(node);
  const emitter = emitterOf(anchor, node);
  if (emitter !== null) build.emitters.push(emitter);
  if (anchor.kind === 'hit') {
    const half = new Vector3(...anchor.size).multiply(stretch).multiplyScalar(0.5);
    build.hitBoxes.push({ id: anchor.id, node, box: new Box3(half.clone().negate(), half) });
  }
  if (targeted.has(anchor.id)) build.targets.set(anchor.id, targetOf(node, null, emitter));
}

function footprintBox(sized: SizedModel, node: Group): SceneHitBox {
  const { width, depth, height } = sized.size;
  const min = new Vector3(-width / 2, 0, -depth / 2);
  return { id: 'footprint', node, box: new Box3(min, new Vector3(width / 2, height, depth / 2)) };
}

function disposeInstanced(batch: Batch): void {
  for (const mesh of batch.instanced.splice(0)) {
    mesh.removeFromParent();
    mesh.dispose();
  }
}

function syncBatch(batch: Batch, root: Group): void {
  const shown = [...batch.items.keys()].filter((item) => item.parent !== null && item.visible);
  const statics = batch.template.parts.filter((part) => !batch.perItem.has(part.id));
  if ((batch.instanced[0]?.instanceMatrix.count ?? 0) < shown.length) {
    disposeInstanced(batch);
    for (const part of statics) {
      const mesh = new InstancedMesh(part.mesh.geometry, part.mesh.material, shown.length);
      mesh.name = `${batch.spec.id}:${part.id}`;
      mesh.renderOrder = part.mesh.renderOrder;
      root.add(mesh);
      batch.instanced.push(mesh);
    }
  }
  root.updateWorldMatrix(true, false);
  const inverse = root.matrixWorld.clone().invert();
  const matrix = new Matrix4();
  for (const item of shown) item.updateWorldMatrix(true, false);
  statics.forEach((part, index) => {
    const mesh = batch.instanced[index];
    const local = batch.matrices.get(part.id);
    if (mesh === undefined || local === undefined) return;
    shown.forEach((item, at) => {
      mesh.setMatrixAt(at, matrix.multiplyMatrices(inverse, item.matrixWorld).multiply(local));
    });
    mesh.count = shown.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
}

function releaseBatch(batch: Batch): void {
  disposeInstanced(batch);
  batch.template.dispose();
  batch.resources.dispose();
}

function createItem(batch: Batch, onEmpty: () => void): SceneModel {
  const group = new Group();
  group.name = batch.spec.id;
  const build: ItemBuild = { group, targets: new Map(), emitters: [], hitBoxes: [], looks: [] };
  attachParts(batch, build);
  if (build.hitBoxes.length === 0) build.hitBoxes.push(footprintBox(batch.sized, group));
  const releaseLooks = (): void => {
    for (const look of build.looks.splice(0)) {
      for (const texture of look.textures) texture.dispose();
      look.material.dispose();
    }
  };
  batch.items.set(group, releaseLooks);
  const dispose = (): void => {
    if (!batch.items.has(group)) return;
    group.removeFromParent();
    releaseLooks();
    batch.items.delete(group);
    if (batch.items.size === 0) onEmpty();
  };
  const setSignals = signalSetter({ ...build, spec: batch.spec, params: batch.template.params });
  return {
    object3d: group,
    setSignals,
    emitters: build.emitters,
    hitBoxes: build.hitBoxes,
    dispose,
  };
}

function batchKey(spec: ModelSpec, options: SceneModelOptions): string {
  const finish = options.finish ?? spec.defaultFinish ?? null;
  return JSON.stringify([spec.id, spec.version, options.lod, finish, options.params ?? {}]);
}

export function createSceneModelSet(setup: { readonly instancing: boolean }): SceneModelSet {
  const object3d = new Group();
  object3d.name = 'scene-models';
  const batches = new Map<string, Batch>();
  const release = (batch: Batch): void => {
    releaseBatch(batch);
    batches.delete(batch.key);
  };
  return {
    object3d,
    createSceneModel: (spec, options): SceneModel => {
      const key = batchKey(spec, options);
      const batch = batches.get(key) ?? createBatch(key, spec, options, setup.instancing);
      batches.set(key, batch);
      return createItem(batch, () => {
        release(batch);
      });
    },
    updateInstances: (): void => {
      for (const batch of batches.values()) syncBatch(batch, object3d);
    },
    dispose: (): void => {
      for (const batch of [...batches.values()]) {
        for (const [item, releaseLooks] of batch.items) {
          item.removeFromParent();
          releaseLooks();
        }
        batch.items.clear();
        release(batch);
      }
      object3d.removeFromParent();
    },
  };
}

export function createSceneModel(spec: ModelSpec, options: SceneModelOptions): SceneModel {
  const set = createSceneModelSet({ instancing: false });
  const model = set.createSceneModel(spec, options);
  const dispose = (): void => {
    model.dispose();
    set.dispose();
  };
  return { ...model, dispose };
}

export function sceneRoles(resolution: ModelResolution): readonly SceneRole[] {
  const { main, finish, params } = resolution;
  const head: SceneRole[] = main === null ? [] : [{ role: 'main', ref: main, finish, params }];
  const extras = resolution.extras.map((extra): SceneRole => ({
    role: extra.role,
    ref: { kind: 'catalogue', modelId: extra.modelId },
    finish: undefined,
    params: undefined,
  }));
  return [...head, ...extras];
}
