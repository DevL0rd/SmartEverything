import {
  AdditiveBlending,
  DataTexture,
  DirectionalLight,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  Color,
  type Light,
  type Object3D,
} from 'three';
import type {
  CeilingGlow,
  DuskAmbient,
  FloorLighting,
  LightPool,
  RoomLightPools,
} from '../lighting';
import { compareText } from '../../../format/text';
import { pooledLightAt } from '../light-blend';
import type { RenderBounds } from '../render-scene';
import { groundPosition } from './mesh';

export const POOL_PIXELS_PER_M = 12;

export const POOL_LIFT_M = 0.004;

export const POOL_PEAK_OPACITY = 0.85;

export const CEILING_GLOW_DROP_M = 0.02;

export const CEILING_GLOW_SPREAD_M = 0.5;

export const CEILING_GLOW_INTENSITY = 3;

export interface PoolRaster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly bounds: RenderBounds;
}

const byte = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);

export function rasterRoomPools(
  pools: readonly LightPool[],
  bounds: RenderBounds,
  pixelsPerM: number,
): PoolRaster {
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) * pixelsPerM));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) * pixelsPerM));
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const y = bounds.minY + ((row + 0.5) / height) * (bounds.maxY - bounds.minY);
    for (let column = 0; column < width; column += 1) {
      const x = bounds.minX + ((column + 0.5) / width) * (bounds.maxX - bounds.minX);
      const light = pooledLightAt(pools, { x, y });
      const at = (row * width + column) * 4;
      data[at] = byte(light.rgb[0]);
      data[at + 1] = byte(light.rgb[1]);
      data[at + 2] = byte(light.rgb[2]);
      data[at + 3] = byte(Math.min(1, light.weight) * POOL_PEAK_OPACITY);
    }
  }
  return { width, height, data, bounds };
}

function rasterTexture(raster: PoolRaster): DataTexture {
  const texture = new DataTexture(
    raster.data,
    raster.width,
    raster.height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function roomDecal(room: RoomLightPools, pools: readonly LightPool[], elevation: number): PoolMesh {
  const { bounds } = room;
  const texture = rasterTexture(rasterRoomPools(pools, bounds, POOL_PIXELS_PER_M));
  const geometry = new PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = `light-pool:${room.id}`;
  mesh.userData = { lights: pools.map((pool) => pool.deviceId) };
  mesh.renderOrder = 1;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(
    (bounds.minX + bounds.maxX) / 2,
    elevation + POOL_LIFT_M,
    -(bounds.minY + bounds.maxY) / 2,
  );
  return mesh;
}

export interface LightPoolUpdate {
  readonly lighting: FloorLighting;
  readonly elevation: number;
  readonly realDeviceIds: ReadonlySet<string>;
}

function updateKey(update: LightPoolUpdate): string {
  return [update.lighting.key, update.elevation, ...[...update.realDeviceIds].sort()].join('|');
}

export interface GlowLook {
  readonly color: string;
  readonly intensity: number;
  readonly spreadM: number;
}

export interface GlowDecal {
  readonly mesh: Object3D;
  readonly apply: (look: GlowLook | null) => void;
  readonly dispose: () => void;
}

export interface GlowDecalFactory {
  readonly create: (surface: 'floor', name: string) => GlowDecal;
  readonly dispose: () => void;
}

export type GlowDecals = (() => GlowDecalFactory) | null;

export interface LightPoolLayer {
  readonly group: Group;
  readonly update: (next: LightPoolUpdate) => boolean;
  readonly dispose: () => void;
}

type PoolMesh = Mesh<PlaneGeometry, MeshBasicMaterial>;

function disposeMeshes(meshes: PoolMesh[]): void {
  for (const mesh of meshes.splice(0)) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
  }
}

function placeGlow(decals: GlowDecalFactory, glow: CeilingGlow, elevation: number): GlowDecal {
  const decal = decals.create('floor', `ceiling-glow:${glow.deviceId}`);
  decal.mesh.position.set(
    ...groundPosition(glow.at, elevation + glow.heightM - CEILING_GLOW_DROP_M),
  );
  decal.apply({
    color: glow.colour,
    intensity: glow.strength * CEILING_GLOW_INTENSITY,
    spreadM: CEILING_GLOW_SPREAD_M,
  });
  return decal;
}

function disposeGlows(glows: GlowDecal[]): void {
  for (const glow of glows.splice(0)) glow.dispose();
}

function buildLayer(group: Group, next: LightPoolUpdate, built: Built): void {
  for (const room of next.lighting.rooms) {
    const pools = room.pools.filter((pool) => !next.realDeviceIds.has(pool.deviceId));
    if (pools.length === 0) continue;
    const mesh = roomDecal(room, pools, next.elevation);
    built.meshes.push(mesh);
    group.add(mesh);
  }
  const { decals } = built;
  if (decals === null) return;
  for (const glow of next.lighting.glows) {
    const decal = placeGlow(decals, glow, next.elevation);
    built.glows.push(decal);
    group.add(decal.mesh);
  }
}

interface Built {
  readonly meshes: PoolMesh[];
  readonly glows: GlowDecal[];
  readonly decals: GlowDecalFactory | null;
}

export function createLightPoolLayer(createDecals: GlowDecals): LightPoolLayer {
  const group = new Group();
  group.name = 'light-pools';
  const built: Built = { meshes: [], glows: [], decals: createDecals?.() ?? null };
  let last: string | null = null;
  return {
    group,
    update: (next): boolean => {
      const key = updateKey(next);
      if (key === last) return false;
      last = key;
      disposeMeshes(built.meshes);
      disposeGlows(built.glows);
      buildLayer(group, next, built);
      return true;
    },
    dispose: (): void => {
      disposeMeshes(built.meshes);
      disposeGlows(built.glows);
      built.decals?.dispose();
      group.removeFromParent();
    },
  };
}

export interface DeviceLights {
  readonly deviceId: string;
  readonly lights: readonly Light[];
}

export interface LightSplit {
  readonly real: ReadonlySet<string>;
  readonly decal: ReadonlySet<string>;
}

export function splitLights(devices: readonly DeviceLights[], decalShare: number): LightSplit {
  const lit = devices
    .filter((device) => device.lights.length > 0)
    .map((device) => device.deviceId)
    .sort(compareText);
  const share = Math.min(1, Math.max(0, decalShare));
  const decals = Math.ceil(share * lit.length);
  return { real: new Set(lit.slice(decals)), decal: new Set(lit.slice(0, decals)) };
}

export function applySplit(devices: readonly DeviceLights[], split: LightSplit): boolean {
  let changed = false;
  for (const { deviceId, lights } of devices) {
    const shown = !split.decal.has(deviceId);
    for (const light of lights) {
      changed ||= light.visible !== shown;
      light.visible = shown;
    }
  }
  return changed;
}

interface DuskEntry {
  readonly light: Light;
  readonly intensity: number;
  readonly colour: Color;
}

export interface DuskRig {
  readonly apply: (dusk: DuskAmbient) => void;
}

const scaleOf = (light: Light, dusk: DuskAmbient): number =>
  light instanceof DirectionalLight ? dusk.sunScale : dusk.ambientScale;

export function createDuskRig(lights: readonly Light[]): DuskRig {
  const entries: readonly DuskEntry[] = lights.map((light) => ({
    light,
    intensity: light.intensity,
    colour: light.color.clone(),
  }));
  return {
    apply: (dusk): void => {
      for (const { light, intensity, colour } of entries) {
        light.intensity = intensity * scaleOf(light, dusk);
        light.color.copy(colour).multiply(new Color(dusk.tint));
      }
    },
  };
}
