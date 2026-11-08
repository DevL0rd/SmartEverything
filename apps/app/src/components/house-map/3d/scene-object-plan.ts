import type { ModelSpec } from '@smarteverything/domain';
import { Vector3, type Object3D } from 'three';
import type { RenderObject, RenderPlacement, RenderPoint, RenderWall } from '../render-scene';
import { groundPosition } from './mesh';
import {
  deviceKey,
  objectKey,
  unknownDevice,
  unknownObject,
  type SceneItemKind,
  type UnknownBox,
} from './scene-object-boxes';
import { sizedModel, type SizedModel } from '../../models/three/sized-model';
import { mountedPose, type MountedPose } from './wall-mounts';
import type {
  SceneObjectLod,
  SceneObjectModel,
  SceneObjectsFloor,
  SceneObjectsInput,
} from './scene-objects';

const DEGREE = Math.PI / 180;

const FRONT_YAW_DEG = 90;

export type Walls = ReadonlyMap<string, RenderWall>;

export interface Modelled {
  readonly key: string;
  readonly kind: SceneItemKind;
  readonly spec: ModelSpec;
  readonly finish: string | undefined;
  readonly params: Readonly<Record<string, number>> | undefined;
  readonly place: (node: Object3D) => void;
}

function placedYaw(rotationDeg: number): number {
  return (rotationDeg + FRONT_YAW_DEG) * DEGREE;
}

function placeAt(node: Object3D, at: RenderPoint, y: number, rotationDeg: number): void {
  node.position.set(...groundPosition(at, y));
  node.rotation.set(0, placedYaw(rotationDeg), 0);
}

type MountAnchor = Extract<NonNullable<ModelSpec['anchors']>[number], { kind: 'mount' }>;

function mountAnchor(spec: ModelSpec, mount: string): MountAnchor | undefined {
  const anchors = (spec.anchors ?? []).filter(
    (anchor): anchor is MountAnchor => anchor.kind === 'mount',
  );
  return anchors.find((anchor) =>
    anchor.mount === 'desk' ? mount === 'table' : anchor.mount === mount,
  );
}

function anchorAt(anchor: MountAnchor, sized: SizedModel): Vector3 {
  return new Vector3(...(anchor.position ?? [0, 0, 0])).multiply(sized.stretch);
}

function mountOffset(
  sized: SizedModel,
  mount: RenderPlacement['mount'],
  onWall: boolean,
  anchor = mountAnchor(sized.spec, mount),
): Vector3 {
  if (anchor !== undefined) return anchorAt(anchor, sized).negate();
  const { height, depth } = sized.size;
  if (mount === 'ceiling') return new Vector3(0, -height, 0);
  if (mount === 'wall') return new Vector3(0, -height / 2, onWall ? depth / 2 : 0);
  return new Vector3();
}

function wallBack(sized: SizedModel): Vector3 {
  const anchor = mountAnchor(sized.spec, 'wall');
  const back = anchor === undefined ? -sized.size.depth / 2 : anchorAt(anchor, sized).z;
  return new Vector3(0, 0, -back);
}

function placer(
  pose: MountedPose,
  y: number,
  offset: Vector3,
  inverted = false,
): (node: Object3D) => void {
  return (node): void => {
    placeAt(node, pose.at, y, pose.rotationDeg);
    if (inverted) node.rotateZ(Math.PI);
    node.position.add(offset.clone().applyQuaternion(node.quaternion));
  };
}

export function modelledObject(item: RenderObject, spec: ModelSpec, walls: Walls): Modelled {
  const pose = mountedPose(walls, item);
  const sized = sizedModel(spec, item.params);
  return {
    key: objectKey(item.id),
    kind: 'object',
    spec,
    finish: item.finish ?? undefined,
    params: Object.keys(item.params).length === 0 ? undefined : item.params,
    place: placer(pose, item.elevation, pose.normal === null ? new Vector3() : wallBack(sized)),
  };
}

export function modelledDevice(
  placement: RenderPlacement,
  spec: ModelSpec,
  walls: Walls,
): Modelled {
  const pose = mountedPose(walls, placement);
  const matching = mountAnchor(spec, placement.mount);
  const base =
    placement.mount === 'ceiling' && matching === undefined
      ? (mountAnchor(spec, 'floor') ?? mountAnchor(spec, 'table'))
      : undefined;
  const offset = mountOffset(
    sizedModel(spec, {}),
    placement.mount,
    pose.normal !== null,
    matching ?? base,
  );
  return {
    key: deviceKey(placement.deviceId),
    kind: 'device',
    spec,
    finish: undefined,
    params: undefined,
    place: placer(pose, placement.height, offset, base !== undefined),
  };
}

export function planFloor<M extends SceneObjectModel>(
  floor: SceneObjectsFloor,
  walls: Walls,
  input: SceneObjectsInput<M>,
): { readonly modelled: readonly Modelled[]; readonly unknown: readonly UnknownBox[] } {
  const modelled: Modelled[] = [];
  const unknown: UnknownBox[] = [];
  for (const item of floor.objects) {
    const spec = item.modelId === null ? undefined : input.specOf(item.modelId);
    if (spec === undefined) unknown.push(unknownObject(item));
    else modelled.push(modelledObject(item, spec, walls));
  }
  for (const placement of floor.placements) {
    const spec = input.deviceSpecOf(placement);
    if (spec === undefined) unknown.push(unknownDevice(placement, walls));
    else modelled.push(modelledDevice(placement, spec, walls));
  }
  return { modelled, unknown };
}

export const hasSignals = (spec: ModelSpec): boolean => (spec.channels ?? []).length > 0;

export function batchKey(entry: Modelled, lod: SceneObjectLod): string {
  const { spec, finish, params } = entry;
  return JSON.stringify([
    spec.id,
    spec.version,
    lod,
    finish ?? spec.defaultFinish ?? null,
    params ?? {},
  ]);
}
