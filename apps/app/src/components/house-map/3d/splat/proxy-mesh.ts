import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
} from 'three';
import { shownRooms } from '../../plan/rooms';
import type { FloorLighting, LightPool, LightPoolKind } from '../../lighting';
import { splitLights } from '../../live-visibility/quality-scaler';
import { objectHeight, objectRing } from '../../iso/project';
import {
  sceneKeyHash,
  type RenderFloor,
  type RenderPoint,
  type RenderWall,
} from '../../render-scene';
import {
  addPolygonFlat,
  addPrism,
  createCollector,
  groundPosition,
  type Collector,
  type Rgb,
  type Vec3,
} from '../mesh';
import { wallPieces } from '../wall-pieces';

export type ProxyFloor = Pick<
  RenderFloor,
  'id' | 'elevation' | 'rooms' | 'walls' | 'openings' | 'objects'
>;

export interface ProxyMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly triangles: number;
  readonly slabs: number;
  readonly wallPieces: number;
  readonly boxes: number;
}

const ALBEDO: Rgb = [1, 1, 1];

const MINIMUM_WALL_THICKNESS_M = 0.02;

function pieceRing(wall: RenderWall, start: number, end: number): readonly RenderPoint[] | null {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length === 0 || end <= start) return null;
  const along = { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length };
  const half = Math.max(wall.thickness, MINIMUM_WALL_THICKNESS_M) / 2;
  const side = { x: -along.y * half, y: along.x * half };
  const at = (station: number, sign: number): RenderPoint => ({
    x: wall.from.x + along.x * station + side.x * sign,
    y: wall.from.y + along.y * station + side.y * sign,
  });
  return [at(start, -1), at(end, -1), at(end, 1), at(start, 1)];
}

function addSlabs(collector: Collector, floor: ProxyFloor): number {
  let count = 0;
  for (const room of shownRooms(floor)) {
    for (const polygon of room.polygons) {
      addPolygonFlat(collector, polygon, { y: floor.elevation, colour: ALBEDO });
      count += 1;
    }
  }
  return count;
}

function addWalls(collector: Collector, floor: ProxyFloor): number {
  let count = 0;
  for (const wall of floor.walls) {
    for (const piece of wallPieces(wall, wall.height, floor.openings)) {
      const ring = piece.glass ? null : pieceRing(wall, piece.start, piece.end);
      if (ring === null || piece.top <= piece.base) continue;
      addPrism(collector, ring, {
        base: floor.elevation + piece.base,
        height: piece.top - piece.base,
        colour: ALBEDO,
      });
      count += 1;
    }
  }
  return count;
}

function addBoxes(collector: Collector, floor: ProxyFloor): number {
  let count = 0;
  for (const item of floor.objects) {
    const height = objectHeight(item);
    if (!(height > 0)) continue;
    addPrism(collector, objectRing(item), {
      base: floor.elevation + item.elevation,
      height,
      colour: ALBEDO,
    });
    count += 1;
  }
  return count;
}

export function buildProxyMesh(floor: ProxyFloor): ProxyMeshData {
  const collector = createCollector();
  const slabs = addSlabs(collector, floor);
  const pieces = addWalls(collector, floor);
  const boxes = addBoxes(collector, floor);
  return {
    positions: Float32Array.from(collector.positions),
    normals: Float32Array.from(collector.normals),
    indices: Uint32Array.from(collector.indices),
    triangles: collector.indices.length / 3,
    slabs,
    wallPieces: pieces,
    boxes,
  };
}

export function proxyGeometry(data: ProxyMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface ProxyMeshes {
  readonly lit: Mesh<BufferGeometry, MeshLambertMaterial>;
  readonly occluder: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly dispose: () => void;
}

export function createProxyMeshes(data: ProxyMeshData, shadows: boolean): ProxyMeshes {
  const geometry = proxyGeometry(data);
  const lit = new Mesh(geometry, new MeshLambertMaterial({ color: new Color(1, 1, 1) }));
  lit.name = 'relight-proxy';
  lit.castShadow = shadows;
  lit.receiveShadow = shadows;
  const occluder = new Mesh(geometry, new MeshBasicMaterial({ color: new Color(0, 0, 0) }));
  occluder.name = 'relight-occluder';
  const materials: readonly Material[] = [lit.material, occluder.material];
  return {
    lit,
    occluder,
    dispose: (): void => {
      lit.removeFromParent();
      occluder.removeFromParent();
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

export const CEILING_LIGHT_DROP_M = 0.05;

export const NEAREST_NOMINAL_M = 1;

export const LAMP_GLOW_RADIUS_M: Readonly<Record<LightPoolKind, number>> = {
  ceiling: 0.35,
  lamp: 0.3,
  strip: 0.2,
};

export interface ProxyLight {
  readonly id: string;
  readonly kind: LightPoolKind;
  readonly position: Vec3;
  readonly colour: string;
  readonly intensity: number;
  readonly distance: number;
  readonly nominalM: number;
}

export interface LampGlow {
  readonly id: string;
  readonly position: Vec3;
  readonly colour: string;
  readonly strength: number;
  readonly radiusM: number;
}

export interface RelightLights {
  readonly key: string;
  readonly real: readonly ProxyLight[];
  readonly decalIds: readonly string[];
  readonly glows: readonly LampGlow[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const proxyWindow = (distance: number, cutoff: number): number =>
  clamp01(1 - (distance / cutoff) ** 4) ** 2;

export const proxyIrradiance = (light: ProxyLight, distance: number): number =>
  (light.intensity * proxyWindow(distance, light.distance)) /
  Math.max(distance ** 2, 0.01) /
  Math.PI;

function liftOf(pool: LightPool): number {
  return pool.kind === 'ceiling' ? pool.heightM - CEILING_LIGHT_DROP_M : pool.heightM;
}

export function proxyLightOf(pool: LightPool, elevation: number): ProxyLight {
  const middle = { x: (pool.from.x + pool.to.x) / 2, y: (pool.from.y + pool.to.y) / 2 };
  const halfLength = Math.hypot(pool.to.x - pool.from.x, pool.to.y - pool.from.y) / 2;
  const lift = liftOf(pool);
  const nominalM = Math.max(lift, NEAREST_NOMINAL_M);
  const distance = Math.hypot(pool.reachM + halfLength, nominalM);
  const intensity = (pool.strength * Math.PI * nominalM ** 2) / proxyWindow(nominalM, distance);
  return {
    id: pool.deviceId,
    kind: pool.kind,
    position: groundPosition(middle, elevation + lift),
    colour: pool.colour,
    intensity,
    distance,
    nominalM,
  };
}

function glowOf(pool: LightPool, elevation: number): LampGlow {
  return {
    id: pool.deviceId,
    position: proxyLightOf(pool, elevation).position,
    colour: pool.colour,
    strength: pool.strength,
    radiusM: LAMP_GLOW_RADIUS_M[pool.kind],
  };
}

export function relightLights(
  lighting: FloorLighting,
  elevation: number,
  decalShare: number,
): RelightLights {
  const pools = lighting.enabled ? lighting.rooms.flatMap((room) => room.pools) : [];
  const split = splitLights(
    pools.map((pool) => ({ id: pool.deviceId, intensity: pool.strength })),
    decalShare,
  );
  const realIds = new Set(split.real);
  return {
    key: sceneKeyHash([lighting.key, String(elevation), ...split.real]),
    real: pools.filter((pool) => realIds.has(pool.deviceId)).map((p) => proxyLightOf(p, elevation)),
    decalIds: split.decal,
    glows: pools.map((pool) => glowOf(pool, elevation)),
  };
}
