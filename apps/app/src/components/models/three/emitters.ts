import { placementFacts } from '@smarteverything/domain/model-placement';
import type { ModelSpec } from '@smarteverything/domain/model-spec';
import { PointLight, SpotLight, Vector3, type Object3D } from 'three';
import {
  splitLights,
  type LightSplit,
  type ScalerLight,
} from '../../house-map/live-visibility/quality-scaler';
import { GLOW_LIFT, type GlowDecal, type GlowDecalFactory, type GlowLook } from './glow-decal';
import type { SceneEmitter } from './scene-signals';

export interface GlowSurfaces {
  readonly floorY: number;
  readonly wallZ: number | undefined;
}

export interface EmitterSource {
  readonly object3d: Object3D;
  readonly emitters: readonly SceneEmitter[];
}

interface RigLight {
  readonly emitter: SceneEmitter;
  readonly light: PointLight | SpotLight;
  readonly floor: GlowDecal;
  readonly wall: GlowDecal | null;
}

export interface EmitterRig {
  readonly root: Object3D;
  readonly lights: readonly RigLight[];
  readonly dispose: () => void;
}

export interface EmitterRigOptions {
  readonly model: EmitterSource;
  readonly surfaces: GlowSurfaces;
  readonly decals: GlowDecalFactory;
}

export const MIN_GLOW_SPREAD_M = 0.15;

export const POINT_GLOW_RATIO = 1.2;

const DEGREE = Math.PI / 180;

export function emitterSurfaces(spec: ModelSpec, heightAboveFloorM?: number): GlowSurfaces {
  const facts = placementFacts(spec.id, spec);
  const raised = facts !== undefined && facts.mount !== 'floor';
  const height = raised ? (heightAboveFloorM ?? facts.defaultHeightM) : 0;
  const wall = facts?.mount === 'wall';
  return { floorY: -Math.max(0, height), wallZ: wall ? -spec.footprint.depth / 2 : undefined };
}

export function glowSpread(distanceM: number, cone: number | undefined): number {
  const reach = Math.max(0, distanceM);
  const spread =
    cone !== undefined && cone < 180
      ? reach * Math.tan((cone / 2) * DEGREE)
      : reach * POINT_GLOW_RATIO;
  return Math.max(MIN_GLOW_SPREAD_M, spread);
}

function realLight(emitter: SceneEmitter): PointLight | SpotLight {
  const { cone } = emitter;
  if (cone === undefined || cone >= 180) return new PointLight(emitter.color, 0, 0, 2);
  const light = new SpotLight(emitter.color, 0, 0, Math.min(cone / 2, 90) * DEGREE, 0.4, 2);
  light.target.position.set(0, -1, 0);
  light.add(light.target);
  return light;
}

function rigLight(emitter: SceneEmitter, options: EmitterRigOptions): RigLight {
  const { model, surfaces, decals } = options;
  const light = realLight(emitter);
  light.name = `${emitter.id}:light`;
  light.visible = false;
  emitter.node.add(light);
  const floor = decals.create('floor', `${emitter.id}:glow-floor`);
  model.object3d.add(floor.mesh);
  const wall =
    surfaces.wallZ === undefined ? null : decals.create('wall', `${emitter.id}:glow-wall`);
  if (wall !== null) model.object3d.add(wall.mesh);
  return { emitter, light, floor, wall };
}

export function createEmitterRig(options: EmitterRigOptions): EmitterRig {
  const lights = options.model.emitters.map((emitter) => rigLight(emitter, options));
  return {
    root: options.model.object3d,
    lights,
    dispose: (): void => {
      for (const { light, floor, wall } of lights) {
        light.removeFromParent();
        light.dispose();
        floor.dispose();
        wall?.dispose();
      }
    },
  };
}

function shown(root: Object3D): boolean {
  for (let at: Object3D | null = root; at !== null; at = at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

function look(emitter: SceneEmitter, distanceM: number): GlowLook {
  const { color, intensity, cone } = emitter;
  return { color, intensity, spreadM: glowSpread(distanceM, cone) };
}

function placeGlow(rig: EmitterRig, entry: RigLight, surfaces: GlowSurfaces, on: boolean): void {
  const at = rig.root.worldToLocal(entry.emitter.node.getWorldPosition(new Vector3()));
  entry.floor.mesh.position.set(at.x, surfaces.floorY + GLOW_LIFT, at.z);
  entry.floor.apply(on ? look(entry.emitter, at.y - surfaces.floorY) : null);
  if (entry.wall === null || surfaces.wallZ === undefined) return;
  entry.wall.mesh.position.set(at.x, at.y, surfaces.wallZ + GLOW_LIFT);
  entry.wall.apply(on ? look(entry.emitter, at.z - surfaces.wallZ) : null);
}

export interface PlacedRig {
  readonly rig: EmitterRig;
  readonly surfaces: GlowSurfaces;
}

function lightId(rigIndex: number, lightIndex: number): string {
  return `${String(rigIndex)}:${String(lightIndex)}`;
}

function syncRig(placed: PlacedRig, rigIndex: number, candidates: ScalerLight[]): void {
  const { rig, surfaces } = placed;
  rig.root.updateWorldMatrix(true, true);
  const visible = shown(rig.root);
  for (const [lightIndex, entry] of rig.lights.entries()) {
    const { light, emitter } = entry;
    const on = visible && emitter.on && emitter.intensity > 0;
    placeGlow(rig, entry, surfaces, on);
    light.color.set(emitter.color);
    light.intensity = emitter.intensity;
    if (on) candidates.push({ id: lightId(rigIndex, lightIndex), intensity: emitter.intensity });
  }
}

export function syncEmitterRigs(rigs: readonly PlacedRig[], decalShare: number): LightSplit {
  const candidates: ScalerLight[] = [];
  for (const [rigIndex, placed] of rigs.entries()) syncRig(placed, rigIndex, candidates);
  const split = splitLights(candidates, decalShare);
  const real = new Set(split.real);
  for (const [rigIndex, { rig }] of rigs.entries()) {
    for (const [lightIndex, entry] of rig.lights.entries()) {
      const { light } = entry;
      light.visible = real.has(lightId(rigIndex, lightIndex));
    }
  }
  return split;
}
