import { Vector3, type Object3D, type PerspectiveCamera, type Ray } from 'three';
import type {
  RenderFloor,
  RenderObject,
  RenderOpening,
  RenderPlacement,
  RenderPoint,
  RenderWall,
} from '../render-scene';
import { HIT_RADIUS_PX } from '../edit/radii';
import { styledWallHeight } from './cutaway';
import { metresForPixels, planeAt, screenRay } from './edit/ground';
import type { EditHit } from './map-3d-edit-protocol';
import {
  nearestHit,
  pickRoom,
  type Ndc,
  type PickTargets,
  type Viewport,
} from './render-core-orbit';
import { unknownDevice, unknownObject } from './scene-object-boxes';
import type { WallView } from './wall-mounts';

const PARALLEL_EPS = 1e-9;

const SURFACE_TOLERANCE_M = 1e-4;

export type ScenePick = EditHit;

export interface PickPrism {
  readonly ring: readonly RenderPoint[];
  readonly base: number;
  readonly top: number;
}

export interface PickBox extends PickPrism {
  readonly id: string;
}

export interface ObjectPickBox extends PickBox {
  readonly locked: boolean;
}

export interface PickSegment {
  readonly id: string;
  readonly from: RenderPoint;
  readonly to: RenderPoint;
  readonly thickness: number;
  readonly base: number;
  readonly top: number;
}

export interface PickInput {
  readonly targets: PickTargets;
  readonly viewport: Viewport;
  readonly elevation: number;
  readonly devices: readonly PickBox[];
  readonly objects: readonly ObjectPickBox[];
  readonly openings: readonly PickSegment[];
  readonly walls: readonly PickSegment[];
}

export interface PressPick {
  readonly pick: ScenePick;
  readonly onBody: boolean;
}

export interface SizedBox {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

type ItemHit = Exclude<ScenePick, { readonly kind: 'room' } | { readonly kind: 'none' }>;

interface Candidate {
  readonly hit: ItemHit;
  readonly distance: number;
}

const KIND_ORDER: readonly ItemHit['kind'][] = ['device', 'object', 'opening', 'wall'];

const CORNER_SIGNS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

export function nodePrism(node: Object3D, size: SizedBox): PickPrism {
  node.updateWorldMatrix(true, false);
  const ring = CORNER_SIGNS.map(([sx, sz]) => {
    const world = new Vector3((sx * size.width) / 2, 0, (sz * size.depth) / 2).applyMatrix4(
      node.matrixWorld,
    );
    return { x: world.x, y: -world.z };
  });
  const base = new Vector3().applyMatrix4(node.matrixWorld).y;
  return { ring, base, top: base + size.height };
}

export function deviceBoxesOf(
  floor: Pick<RenderFloor, 'placements' | 'walls'>,
  modelPrism: (placement: RenderPlacement) => PickPrism | null,
): readonly PickBox[] {
  const walls = new Map(floor.walls.map((wall) => [wall.id, wall]));
  return floor.placements.flatMap((placement) => {
    const { ring, base, top } = unknownDevice(placement, walls);
    const mount: PickBox = { id: placement.deviceId, ring, base, top };
    const model = modelPrism(placement);
    return model === null ? [mount] : [mount, { id: placement.deviceId, ...model }];
  });
}

export function objectBoxesOf(
  objects: readonly RenderObject[],
  modelPrism: (item: RenderObject) => PickPrism | null,
): readonly ObjectPickBox[] {
  return objects.map((item) => {
    const prism = modelPrism(item) ?? unknownObject(item);
    return { id: item.id, locked: item.locked, ring: prism.ring, base: prism.base, top: prism.top };
  });
}

export interface WallPickLook {
  readonly view: WallView;
  readonly cutHeight: number;
}

function visibleTop(wall: RenderWall, look: WallPickLook): number {
  if (look.view.cutIds.has(wall.id)) return Math.min(wall.height, look.cutHeight);
  return styledWallHeight(look.view.style, wall.height, look.view.lowHeight);
}

export function wallSegmentsOf(
  walls: readonly RenderWall[],
  look: WallPickLook,
  elevation: number,
): readonly PickSegment[] {
  return walls.map((wall) => ({
    id: wall.id,
    from: wall.from,
    to: wall.to,
    thickness: wall.thickness,
    base: elevation,
    top: elevation + visibleTop(wall, look),
  }));
}

export function openingSegmentsOf(
  openings: readonly RenderOpening[],
  walls: readonly PickSegment[],
  elevation: number,
): readonly PickSegment[] {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  return openings.flatMap((opening) => {
    const wall = opening.wallId === null ? undefined : byId.get(opening.wallId);
    const base = elevation + opening.sillHeight;
    const head = elevation + opening.headHeight;
    const top = wall === undefined ? head : Math.min(head, wall.top);
    if (top <= base) return [];
    return [
      {
        id: opening.id,
        from: opening.from,
        to: opening.to,
        thickness: wall?.thickness ?? 0,
        base,
        top,
      },
    ];
  });
}

function insideRing(ring: readonly RenderPoint[], point: RenderPoint): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if (a === undefined || b === undefined) continue;
    if (a.y > point.y === b.y > point.y) continue;
    const crossX = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (point.x < crossX) inside = !inside;
  }
  return inside;
}

const cross = (a: RenderPoint, b: RenderPoint): number => a.x * b.y - a.y * b.x;

function sideDistance(ray: Ray, a: RenderPoint, b: RenderPoint, prism: PickPrism): number | null {
  const origin = { x: ray.origin.x, y: -ray.origin.z };
  const direction = { x: ray.direction.x, y: -ray.direction.z };
  const edge = { x: b.x - a.x, y: b.y - a.y };
  const denominator = cross(direction, edge);
  if (Math.abs(denominator) < PARALLEL_EPS) return null;
  const toStart = { x: a.x - origin.x, y: a.y - origin.y };
  const distance = cross(toStart, edge) / denominator;
  const along = cross(toStart, direction) / denominator;
  if (distance <= 0 || along < 0 || along > 1) return null;
  const height = ray.origin.y + ray.direction.y * distance;
  return height < prism.base || height > prism.top ? null : distance;
}

export function prismDistance(ray: Ray, prism: PickPrism): number | null {
  let best: number | null = null;
  const keep = (distance: number | null): void => {
    if (distance !== null && (best === null || distance < best)) best = distance;
  };
  for (const height of [prism.base, prism.top]) {
    const hit = planeAt(ray, height);
    if (hit !== null && insideRing(prism.ring, { x: hit.world[0], y: -hit.world[2] })) {
      keep(hit.distance);
    }
  }
  prism.ring.forEach((a, index) => {
    const b = prism.ring[(index + 1) % prism.ring.length];
    if (b !== undefined) keep(sideDistance(ray, a, b, prism));
  });
  return best;
}

function segmentRing(segment: PickSegment): readonly RenderPoint[] {
  const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
  const half = segment.thickness / 2;
  const normal =
    length < PARALLEL_EPS
      ? { x: 0, y: 0 }
      : {
          x: (-(segment.to.y - segment.from.y) / length) * half,
          y: ((segment.to.x - segment.from.x) / length) * half,
        };
  return [
    { x: segment.from.x + normal.x, y: segment.from.y + normal.y },
    { x: segment.to.x + normal.x, y: segment.to.y + normal.y },
    { x: segment.to.x - normal.x, y: segment.to.y - normal.y },
    { x: segment.from.x - normal.x, y: segment.from.y - normal.y },
  ];
}

function alongSegment(segment: PickSegment, point: RenderPoint): number {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.hypot(dx, dy);
  if (length < PARALLEL_EPS) return 0;
  const along = ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / length;
  return Math.min(length, Math.max(0, along));
}

function segmentGap(segment: PickSegment, point: RenderPoint): number {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.hypot(dx, dy);
  const along = alongSegment(segment, point);
  const at =
    length < PARALLEL_EPS
      ? segment.from
      : { x: segment.from.x + (dx * along) / length, y: segment.from.y + (dy * along) / length };
  return Math.hypot(point.x - at.x, point.y - at.y);
}

interface GroundPoint {
  readonly at: RenderPoint;
  readonly distance: number;
  readonly radius: number;
}

function groundPoint(camera: PerspectiveCamera, ray: Ray, input: PickInput): GroundPoint | null {
  const hit = planeAt(ray, input.elevation);
  if (hit === null) return null;
  const radius = metresForPixels(camera, hit.world, input.viewport, HIT_RADIUS_PX);
  if (radius === null) return null;
  return { at: { x: hit.world[0], y: -hit.world[2] }, distance: hit.distance, radius };
}

function segmentDistance(
  ray: Ray,
  segment: PickSegment,
  ground: GroundPoint | null,
): number | null {
  const direct = prismDistance(ray, { ring: segmentRing(segment), ...segment });
  const reach = ground === null ? Infinity : Math.max(segment.thickness / 2, ground.radius);
  const near = ground !== null && segmentGap(segment, ground.at) <= reach ? ground.distance : null;
  if (direct === null) return near;
  return near === null ? direct : Math.min(direct, near);
}

function planAt(ray: Ray, distance: number): RenderPoint {
  const point = ray.at(distance, new Vector3());
  return { x: point.x, y: -point.z };
}

function candidatesOf(camera: PerspectiveCamera, ray: Ray, input: PickInput): readonly Candidate[] {
  const found: Candidate[] = [];
  for (const box of input.devices) {
    const distance = prismDistance(ray, box);
    if (distance !== null) found.push({ hit: { kind: 'device', id: box.id }, distance });
  }
  for (const box of input.objects) {
    const distance = prismDistance(ray, box);
    if (distance !== null) {
      found.push({ hit: { kind: 'object', id: box.id, locked: box.locked }, distance });
    }
  }
  const ground = groundPoint(camera, ray, input);
  for (const opening of input.openings) {
    const distance = segmentDistance(ray, opening, ground);
    if (distance !== null) found.push({ hit: { kind: 'opening', id: opening.id }, distance });
  }
  for (const wall of input.walls) {
    const distance = segmentDistance(ray, wall, ground);
    if (distance === null) continue;
    const offset = alongSegment(wall, planAt(ray, distance));
    found.push({ hit: { kind: 'wall', id: wall.id, offset }, distance });
  }
  const blocker = nearestBlocker(ray, input.targets);
  return found.filter((candidate) => candidate.distance <= blocker + SURFACE_TOLERANCE_M);
}

function nearestBlocker(ray: Ray, targets: PickTargets): number {
  return [targets.floor, targets.walls].reduce((best, layer) => {
    const hit = layer === null ? null : nearestHit(ray, layer);
    return hit === null ? best : Math.min(best, hit.distance);
  }, Infinity);
}

function firstByOrder(candidates: readonly Candidate[]): ItemHit | null {
  for (const kind of KIND_ORDER) {
    let best: Candidate | null = null;
    for (const candidate of candidates) {
      if (candidate.hit.kind !== kind) continue;
      if (best === null || candidate.distance < best.distance) best = candidate;
    }
    if (best !== null) return best.hit;
  }
  return null;
}

function roomPick(camera: PerspectiveCamera, ndc: Ndc, targets: PickTargets): ScenePick {
  const roomId = pickRoom(camera, ndc, targets);
  return roomId === null ? { kind: 'none' } : { kind: 'room', id: roomId };
}

export function pressPick(
  camera: PerspectiveCamera,
  ndc: Ndc,
  input: PickInput,
  bodyId: string | null,
): PressPick {
  const ray = screenRay(camera, ndc);
  const candidates = candidatesOf(camera, ray, input);
  const room = roomPick(camera, ndc, input.targets);
  const pick = firstByOrder(candidates) ?? room;
  const onBody =
    bodyId !== null &&
    (candidates.some((candidate) => candidate.hit.id === bodyId) ||
      (room.kind === 'room' && room.id === bodyId));
  return { pick, onBody };
}

export function viewerInput(
  targets: PickTargets,
  viewport: Viewport,
  devices: readonly PickBox[],
): PickInput {
  return { targets, viewport, elevation: 0, devices, objects: [], openings: [], walls: [] };
}

export function pickScene(camera: PerspectiveCamera, ndc: Ndc, input: PickInput): ScenePick {
  return pressPick(camera, ndc, input, null).pick;
}
