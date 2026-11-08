import {
  Box3,
  DataTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import type { BuiltModel } from './build-model';
import type { ModelLod } from './geometry';
import { STAGE_RIGS, type StageTheme } from './stage';

export interface ContactFootprint {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly floorY: number;
}

export interface ShadowRect {
  readonly centerX: number;
  readonly centerZ: number;
  readonly width: number;
  readonly depth: number;
  readonly floorY: number;
}

export interface ShadowPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface ContactShadow {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly rect: ShadowRect;
  readonly pixels: ShadowPixels;
  readonly setTheme: (theme: StageTheme) => void;
  readonly dispose: () => void;
}

export const SHADOW_SPREAD = 0.22;

export const SHADOW_LIFT = 0.0005;

const SHADOW_RESOLUTION: Readonly<Record<ModelLod, number>> = { 0: 32, 1: 64, 2: 128 };

export function contactFootprint(model: BuiltModel): ContactFootprint | null {
  model.group.updateMatrixWorld(true);
  const box = new Box3();
  for (const part of model.parts) {
    if (part.contact) box.expandByObject(part.mesh);
  }
  if (box.isEmpty()) return null;
  return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, floorY: box.min.y };
}

export function shadowRect(footprint: ContactFootprint): ShadowRect {
  const width = footprint.maxX - footprint.minX;
  const depth = footprint.maxZ - footprint.minZ;
  const margin = Math.max(width, depth) * SHADOW_SPREAD;
  return {
    centerX: (footprint.minX + footprint.maxX) / 2,
    centerZ: (footprint.minZ + footprint.maxZ) / 2,
    width: width + margin * 2,
    depth: depth + margin * 2,
    floorY: footprint.floorY,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface RoundedRect {
  readonly halfX: number;
  readonly halfZ: number;
  readonly radius: number;
}

function roundedRectDistance(x: number, z: number, shape: RoundedRect): number {
  const r = shape.radius;
  const qx = Math.abs(x) - shape.halfX + r;
  const qz = Math.abs(z) - shape.halfZ + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qz), 0) - r;
}

export function shadowPixels(rect: ShadowRect, resolution: number): ShadowPixels {
  const long = Math.max(rect.width, rect.depth);
  const width = Math.max(2, Math.round((resolution * rect.width) / long));
  const height = Math.max(2, Math.round((resolution * rect.depth) / long));
  const margin = (long * SHADOW_SPREAD) / (1 + SHADOW_SPREAD * 2);
  const halfX = rect.width / 2 - margin;
  const halfZ = rect.depth / 2 - margin;
  const shape = { halfX, halfZ, radius: Math.min(halfX, halfZ) * 0.6 };
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = ((column + 0.5) / width - 0.5) * rect.width;
      const z = ((row + 0.5) / height - 0.5) * rect.depth;
      const distance = roundedRectDistance(x, z, shape);
      const alpha = 1 - smoothstep(-margin * 0.6, margin, distance);
      data[(row * width + column) * 4 + 3] = Math.round(alpha * alpha * 255);
    }
  }
  return { width, height, data };
}

function shadowTexture(pixels: ShadowPixels): DataTexture {
  const texture = new DataTexture(
    pixels.data,
    pixels.width,
    pixels.height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadow(model: BuiltModel, theme: StageTheme): ContactShadow | null {
  const footprint = contactFootprint(model);
  if (footprint === null) return null;
  const rect = shadowRect(footprint);
  const pixels = shadowPixels(rect, SHADOW_RESOLUTION[model.lod]);
  const texture = shadowTexture(pixels);
  const material = new MeshBasicMaterial({
    color: 0x000000,
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: STAGE_RIGS[theme].shadowOpacity,
  });
  const geometry = new PlaneGeometry(rect.width, rect.depth);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = `${model.id}.contact-shadow`;
  mesh.renderOrder = -1;
  mesh.position.set(rect.centerX, rect.floorY + SHADOW_LIFT, rect.centerZ);
  return {
    mesh,
    rect,
    pixels,
    setTheme: (next): void => {
      material.opacity = STAGE_RIGS[next].shadowOpacity;
    },
    dispose: (): void => {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
