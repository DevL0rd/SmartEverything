import type { ModelSpec, ModelSpecShot } from '@smarteverything/domain/model-spec';
import { Box3, PerspectiveCamera, Sphere, Vector3, type Object3D } from 'three';
import type { BuiltModel } from './build-model';

export type ModelView = 'tile' | 'card' | 'hero';

export type Point3 = readonly [number, number, number];

export interface CameraPose {
  readonly target: Point3;
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly fov: number;
  readonly reach: number;
}

interface Aim {
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly padding: number;
  readonly aspect: number;
}

const DEG = Math.PI / 180;

function shown(node: Object3D, root: Object3D): boolean {
  for (let at: Object3D | null = node; at !== null; at = at === root ? null : at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

function inside(node: Object3D, root: Object3D): boolean {
  for (let at: Object3D | null = node; at !== null; at = at.parent) if (at === root) return true;
  return false;
}

function bodyBounds(model: BuiltModel, root: Object3D): Box3 {
  model.group.updateMatrixWorld(true);
  const box = new Box3();
  for (const part of model.parts) {
    const { mesh } = part;
    if (part.draw === 'glow' || !inside(mesh, root) || !shown(mesh, model.group)) continue;
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox;
    if (local !== null) box.union(local.clone().applyMatrix4(mesh.matrixWorld));
  }
  return box;
}

export function modelBounds(model: BuiltModel): Box3 {
  return bodyBounds(model, model.group);
}

function point(vector: Vector3): Point3 {
  return [vector.x, vector.y, vector.z];
}

function meshOf(model: BuiltModel, id: string): Object3D | undefined {
  return model.parts.find((part) => part.id === id)?.mesh;
}

function builtAncestor(
  model: BuiltModel,
  spec: ModelSpec,
  id: string | undefined,
): Object3D | undefined {
  if (id === undefined) return undefined;
  const mesh = meshOf(model, id);
  if (mesh !== undefined) return mesh;
  return builtAncestor(model, spec, spec.parts.find((part) => part.id === id)?.parent);
}

function anchorPoint(model: BuiltModel, spec: ModelSpec, id: string): Vector3 | undefined {
  const anchor = spec.anchors?.find((item) => item.id === id);
  if (anchor === undefined) return undefined;
  const local = new Vector3(...(anchor.position ?? [0, 0, 0]));
  const parent = builtAncestor(model, spec, anchor.parent);
  return parent === undefined ? local : local.applyMatrix4(parent.matrixWorld);
}

export function focusPoint(model: BuiltModel, spec: ModelSpec, focus: string | undefined): Point3 {
  const bounds = modelBounds(model);
  if (focus === undefined) return point(bounds.getCenter(new Vector3()));
  const anchor = anchorPoint(model, spec, focus);
  if (anchor !== undefined) return point(anchor);
  const mesh = builtAncestor(model, spec, focus);
  const box = mesh === undefined ? bounds : bodyBounds(model, mesh);
  return point((box.isEmpty() ? bounds : box).getCenter(new Vector3()));
}

export function cameraBasis(yaw: number, pitch: number): readonly [Vector3, Vector3, Vector3] {
  const y = yaw * DEG;
  const p = pitch * DEG;
  const back = new Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
  const right = new Vector3(Math.cos(y), 0, -Math.sin(y));
  const up = new Vector3().crossVectors(back, right);
  return [right, up, back];
}

function corners(box: Box3): Vector3[] {
  const out: Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) out.push(new Vector3(x, y, z));
    }
  }
  return out;
}

export function fitDistance(box: Box3, target: Point3, aim: Aim): number {
  const [right, up, back] = cameraBasis(aim.yaw, aim.pitch);
  const fill = 1 - Math.min(aim.padding, 0.95);
  const tanV = Math.tan((aim.fov * DEG) / 2) * fill;
  const tanH = tanV * aim.aspect;
  const centre = new Vector3(...target);
  let distance = 0;
  for (const corner of corners(box)) {
    const offset = corner.sub(centre);
    const depth = offset.dot(back);
    distance = Math.max(
      distance,
      depth + Math.abs(offset.dot(right)) / tanH,
      depth + Math.abs(offset.dot(up)) / tanV,
    );
  }
  return distance;
}

export function frameView(
  model: BuiltModel,
  spec: ModelSpec,
  view: ModelView,
  aspect: number,
): CameraPose {
  const framing = spec.framing[view];
  const bounds = modelBounds(model);
  const target = focusPoint(model, spec, framing.focus);
  const aim = { ...framing, aspect };
  return {
    target,
    yaw: framing.yaw,
    pitch: framing.pitch,
    distance: fitDistance(bounds, target, aim),
    fov: framing.fov,
    reach: bounds.getBoundingSphere(new Sphere()).radius,
  };
}

export function shotPose(
  framed: CameraPose,
  shot: ModelSpecShot,
  focus: Point3,
  elapsedS: number,
): CameraPose {
  return {
    target: focus,
    yaw: shot.yaw + (shot.orbit ?? 0) * elapsedS,
    pitch: shot.pitch,
    distance: framed.distance / shot.zoom,
    fov: framed.fov,
    reach: framed.reach,
  };
}

export const CONTAIN_PADDING = 0.06;

function partBox(model: BuiltModel, spec: ModelSpec, id: string): Box3 {
  const anchor = anchorPoint(model, spec, id);
  if (anchor !== undefined) return new Box3(anchor.clone(), anchor.clone());
  const mesh = builtAncestor(model, spec, id);
  const box = mesh === undefined ? undefined : bodyBounds(model, mesh);
  return box === undefined || box.isEmpty() ? modelBounds(model) : box;
}

export function keptBox(
  model: BuiltModel,
  spec: ModelSpec,
  view: ModelView,
  shotFocus: string | undefined,
): Box3 | undefined {
  const feature = spec.framing[view].focus;
  if (view === 'tile' || (view === 'card' && feature === undefined)) return modelBounds(model);
  if (feature === undefined) return undefined;
  const box = partBox(model, spec, feature);
  return shotFocus === undefined ? box : box.union(partBox(model, spec, shotFocus));
}

function frameReach(offset: Vector3, aim: Aim): readonly number[] {
  const [right, up, back] = cameraBasis(aim.yaw, aim.pitch);
  const fill = 1 - Math.min(aim.padding, 0.95);
  const tanV = Math.tan((aim.fov * DEG) / 2) * fill;
  const tanH = tanV * aim.aspect;
  const depth = offset.dot(back);
  const across = offset.dot(right) / tanH;
  const along = offset.dot(up) / tanV;
  return [depth + across, depth - across, depth + along, depth - along];
}

interface Recentre {
  readonly from: Vector3;
  readonly towards: Vector3;
  readonly distance: number;
}

function recentreShare(box: Box3, move: Recentre, aim: Aim): number {
  const gains = frameReach(move.towards.clone().sub(move.from), aim);
  let share = 0;
  for (const corner of corners(box)) {
    frameReach(corner.sub(move.from), aim).forEach((reach, index) => {
      const over = reach - move.distance;
      const gain = gains[index] ?? 0;
      if (over > 0 && gain > 0) share = Math.max(share, over / gain);
    });
  }
  return Math.min(1, share);
}

export function containPose(pose: CameraPose, kept: Box3 | undefined, aspect: number): CameraPose {
  if (kept === undefined) return pose;
  const aim = { yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov, padding: CONTAIN_PADDING, aspect };
  if (fitDistance(kept, pose.target, aim) <= pose.distance) return pose;
  const towards = kept.getCenter(new Vector3());
  const distance = Math.max(pose.distance, fitDistance(kept, point(towards), aim));
  const from = new Vector3(...pose.target);
  const share = recentreShare(kept, { from, towards, distance }, aim);
  return { ...pose, target: point(from.lerp(towards, share)), distance };
}

export interface ShotFrame {
  readonly view: ModelView;
  readonly aspect: number;
  readonly shot: ModelSpecShot | undefined;
  readonly elapsedS: number;
  readonly progress: number;
}

export function framedShot(model: BuiltModel, spec: ModelSpec, frame: ShotFrame): CameraPose {
  const { view, aspect, shot } = frame;
  const framed = frameView(model, spec, view, aspect);
  if (shot === undefined) return framed;
  const focus = focusPoint(model, spec, shot.focus);
  const aimed = shotPose(framed, shot, focus, frame.elapsedS);
  const pose = blendPose(framed, aimed, frame.progress);
  return containPose(pose, keptBox(model, spec, view, shot.focus), aspect);
}

export function easeInOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

export function shotProgress(sinceMs: number, easeMs: number): number {
  if (easeMs <= 0) return 1;
  return easeInOut(sinceMs / easeMs);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function shortestYaw(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function blendPose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const [fx, fy, fz] = from.target;
  const [tx, ty, tz] = to.target;
  return {
    target: [lerp(fx, tx, t), lerp(fy, ty, t), lerp(fz, tz, t)],
    yaw: from.yaw + shortestYaw(from.yaw, to.yaw) * t,
    pitch: lerp(from.pitch, to.pitch, t),
    distance: from.distance * (to.distance / from.distance) ** t,
    fov: lerp(from.fov, to.fov, t),
    reach: lerp(from.reach, to.reach, t),
  };
}

export function posePosition(pose: CameraPose): Point3 {
  const [, , back] = cameraBasis(pose.yaw, pose.pitch);
  return point(back.multiplyScalar(pose.distance).add(new Vector3(...pose.target)));
}

export interface ViewCamera {
  readonly camera: PerspectiveCamera;
  readonly apply: (pose: CameraPose, aspect: number) => void;
}

export function createViewCamera(): ViewCamera {
  const camera = new PerspectiveCamera();
  return {
    camera,
    apply: (pose, aspect): void => {
      camera.position.set(...posePosition(pose));
      camera.lookAt(...pose.target);
      camera.fov = pose.fov;
      camera.aspect = aspect;
      camera.near = Math.max(pose.distance * 0.02, pose.distance - pose.reach * 2);
      camera.far = pose.distance + pose.reach * 2;
      camera.updateProjectionMatrix();
    },
  };
}
