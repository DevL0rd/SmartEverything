import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Object3D,
} from 'three';
import type { FloorLighting } from '../lighting';
import type { HomeMapFrustumOutline } from '@smarteverything/domain';
import type {
  OverlayAlertDraw,
  OverlayBadge,
  OverlayCameraDraw,
  OverlayClimateChip,
  OverlayTrackDraw,
  OverlayVacuumDraw,
  OverlayZoneFill,
} from '../overlays/model-types';
import type { StatusTone } from '../../tone';
import type { OpeningLiveDraw } from './openings-live';
import type { RenderFloor, RenderPoint, RenderPolygon } from '../render-scene';
import { addPolygonFlat, createCollector, groundPosition, type Collector } from './mesh';
import type { SceneTheme } from './vacuum-geometry';

export type OverlayMesh = Mesh<BufferGeometry, MeshBasicMaterial>;

export const OVERLAY_LIFT_M = 0.012;

export const OVERLAY_OPACITY = {
  zone: 0.32,
  zoneClear: 0.2,
  activeRoom: 0.16,
  heat: 0.3,
  alert: 0.42,
  glow: 0.55,
  frustumFloor: 0.26,
  frustumSide: 0.1,
  faint: 0.4,
  trail: 0.6,
  halo: 0.25,
  leaf: 0.9,
} as const;

export const TRACK_LOOK_M = { head: 0.12, halo: 0.26, dot: 0.05 } as const;

export const PULSE_PERIOD_MS = 1600;

export const GLOW_M = 0.45;
export const DASH = { dashSize: 0.12, gapSize: 0.08 } as const;
export const LEAF_THICKNESS_M = 0.04;
export const ROBOT_M = { radius: 0.17, height: 0.09, nose: 0.06 } as const;
export const DOCK_M = { width: 0.34, depth: 0.12, height: 0.1 } as const;
export const BADGE_M = { radius: 0.06, lift: 0.18, spacing: 0.14 } as const;
export const SEGMENTS = { circle: 32, ring: 64 } as const;
export const PULSE_FLOOR = 0.55;
export const RAD = Math.PI / 180;

export interface OverlayLook {
  readonly accent: string;
  readonly occupied: string;
  readonly warning: string;
  readonly critical: string;
  readonly muted: string;
  readonly leaf: string;
  readonly cold: string;
  readonly warm: string;
  readonly track: string;
  readonly robot: string;
  readonly dock: string;
}

export const OVERLAY_LOOKS: Readonly<Record<SceneTheme, OverlayLook>> = {
  light: {
    ...{ accent: '#2f6fd0', warning: '#d98a1c', critical: '#d0382d', muted: '#8a8f98' },
    occupied: '#2e9d5b',
    ...{ leaf: '#c9ccd1', cold: '#3b82f6', warm: '#f59e0b', track: '#7c4dff' },
    ...{ robot: '#f4f4f5', dock: '#3a3d44' },
  },
  dark: {
    ...{ accent: '#5a93ef', warning: '#f0a63a', critical: '#ef5a4f', muted: '#9aa0aa' },
    occupied: '#4cc27a',
    ...{ leaf: '#5b6170', cold: '#60a5fa', warm: '#fbbf24', track: '#a78bfa' },
    ...{ robot: '#e4e4e7', dock: '#1f2228' },
  },
};

export interface LiveCamera extends Pick<OverlayCameraDraw, 'deviceId' | 'faint' | 'dashed'> {
  readonly view: { readonly frustum: Pick<HomeMapFrustumOutline, 'ring' | 'floorM' | 'topM'> };
}

export interface LiveClimateChip extends Pick<OverlayClimateChip, 'roomId' | 'at' | 'heat'> {
  readonly text: string;
  readonly tone: StatusTone;
}

export interface LiveOverlay {
  readonly zones: readonly Pick<OverlayZoneFill, 'id' | 'occupied' | 'polygons'>[];
  readonly activeRooms: readonly string[];
  readonly motionDevices: readonly string[];
  readonly tracks: readonly OverlayTrackDraw[];
  readonly climate: readonly LiveClimateChip[];
  readonly openings: readonly OpeningLiveDraw[];
  readonly vacuum: Pick<OverlayVacuumDraw, 'robot' | 'dock' | 'trail'> | null;
  readonly cameras: readonly LiveCamera[];
  readonly alerts: readonly Pick<OverlayAlertDraw, 'deviceId' | 'roomId' | 'pulse'>[];
  readonly badges: readonly OverlayBadge[];
}

export interface OverlayUpdate {
  readonly floor: RenderFloor;
  readonly model: LiveOverlay;
  readonly lighting: FloorLighting | null;
  readonly realDeviceIds: ReadonlySet<string>;
  readonly theme: SceneTheme;
}

export interface Context {
  readonly update: OverlayUpdate;
  readonly look: OverlayLook;
  readonly y: number;
  readonly pulse: (material: MeshBasicMaterial) => MeshBasicMaterial;
}

export const basic = (colour: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });

export function geometryOf(collector: Collector): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(collector.positions), 3));
  geometry.setIndex(collector.indices);
  return geometry;
}

export function mesh(
  name: string,
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
  order = 2,
): OverlayMesh {
  const made = new Mesh(geometry, material);
  made.name = name;
  made.renderOrder = order;
  return made;
}

export function flat(
  name: string,
  polygons: readonly RenderPolygon[],
  y: number,
  material: MeshBasicMaterial,
): readonly Object3D[] {
  const collector = createCollector();
  for (const polygon of polygons) addPolygonFlat(collector, polygon, { y, colour: [1, 1, 1] });
  if (collector.indices.length > 0) return [mesh(name, geometryOf(collector), material)];
  material.dispose();
  return [];
}

export interface Spot {
  readonly name: string;
  readonly at: RenderPoint;
  readonly y: number;
}

export function onFloor(
  spot: Spot,
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
): OverlayMesh {
  const made = mesh(spot.name, geometry, material, 3);
  made.rotation.x = -Math.PI / 2;
  made.position.set(...groundPosition(spot.at, spot.y));
  return made;
}

export const disc = (spot: Spot, radius: number, material: MeshBasicMaterial): OverlayMesh =>
  onFloor(spot, new CircleGeometry(radius, SEGMENTS.circle), material);

export function dot(spot: Spot, colour: string): OverlayMesh {
  const made = mesh(spot.name, new SphereGeometry(BADGE_M.radius, 16, 12), basic(colour, 1), 4);
  made.position.set(...groundPosition(spot.at, spot.y));
  return made;
}

export const roomPolygons = (floor: RenderFloor, roomId: string | null): readonly RenderPolygon[] =>
  floor.rooms.find((room) => room.id === roomId)?.polygons ?? [];

export const placementAt = (
  floor: RenderFloor,
  deviceId: string,
): RenderFloor['placements'][number] | null =>
  floor.placements.find((placement) => placement.deviceId === deviceId) ?? null;
