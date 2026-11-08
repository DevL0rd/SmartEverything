import { Frustum, Light, Matrix4, Mesh, type Camera, type Group, type Object3D } from 'three';
import type { DuskAmbient } from '../lighting';
import type { RenderFloor } from '../render-scene';
import {
  applySplit,
  createDuskRig,
  splitLights,
  type DeviceLights,
  type DuskRig,
  type GlowDecals,
} from './light-pools';
import type { LiveWire } from './map-3d-protocol';
import { createOverlayLayer, type LiveClimateChip, type OverlayLayer, type Seen } from './overlays';
import { deviceKey } from './scene-object-boxes';
import type { SceneObjectItem, SceneObjectModel } from './scene-objects';
import type { SceneTheme } from './vacuum-geometry';
import type { WallView } from './wall-mounts';

export interface LiveHook {
  readonly setFloor: (floor: RenderFloor, theme: SceneTheme) => void;
  readonly setLive: (wire: LiveWire) => void;
}

export interface ItemSource {
  readonly item: (key: string) => SceneObjectItem<SceneObjectModel> | undefined;
}

export interface LiveLayerOptions {
  readonly lights: readonly Light[];
  readonly createDecals: GlowDecals;
  readonly items: ItemSource | null;
  readonly onChange: () => void;
}

function modelLights(root: Object3D, decals: ReadonlySet<Light>): readonly Light[] {
  const found: Light[] = [];
  const walk = (object: Object3D): void => {
    const held = object instanceof Light && decals.has(object);
    if (!object.visible && !held) return;
    if (object instanceof Light) found.push(object);
    for (const child of object.children) walk(child);
  };
  walk(root);
  return found;
}

export function deviceLightsOf(
  floor: RenderFloor,
  items: ItemSource | null,
  decals: ReadonlySet<Light> = new Set(),
): readonly DeviceLights[] {
  return floor.placements.flatMap(({ deviceId }) => {
    const model = items?.item(deviceKey(deviceId))?.model ?? null;
    return model === null ? [] : [{ deviceId, lights: modelLights(model.object3d, decals) }];
  });
}

function shownInScene(object: Object3D): boolean {
  for (let node: Object3D | null = object; node !== null; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

export function seenBy(camera: Camera): Seen {
  camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  return (object): boolean => {
    if (!shownInScene(object)) return false;
    if (!(object instanceof Mesh)) return true;
    object.updateWorldMatrix(true, false);
    return frustum.intersectsObject(object);
  };
}

const sameDusk = (left: DuskAmbient | null, right: DuskAmbient): boolean =>
  left !== null &&
  left.ambientScale === right.ambientScale &&
  left.sunScale === right.sunScale &&
  left.tint === right.tint;

interface Shown {
  readonly floor: RenderFloor;
  readonly source: RenderFloor;
  readonly theme: SceneTheme;
}

const NO_CHIPS: readonly LiveClimateChip[] = [];

export class LiveLayer implements LiveHook {
  readonly group: Group;
  private readonly overlay: OverlayLayer;
  private readonly dusk: DuskRig;
  private shown: Shown | null = null;
  private wire: LiveWire | null = null;
  private applied: DuskAmbient | null = null;
  private decalShare = 0;
  private decals: ReadonlySet<Light> = new Set();

  constructor(private readonly options: LiveLayerOptions) {
    this.overlay = createOverlayLayer(options.createDecals);
    this.group = this.overlay.group;
    this.dusk = createDuskRig(options.lights);
  }

  setFloor(floor: RenderFloor, theme: SceneTheme): void {
    if (this.shown?.source === floor && this.shown.theme === theme) return;
    this.shown = { floor: { ...floor, elevation: 0 }, source: floor, theme };
    this.apply();
  }

  setLive(wire: LiveWire): void {
    this.wire = wire;
    this.apply();
  }

  setDecalShare(share: number): void {
    if (this.decalShare === share) return;
    this.decalShare = share;
    this.apply();
  }

  refresh(): void {
    this.apply();
  }

  chips(): readonly LiveClimateChip[] {
    return this.wire?.overlay.climate ?? NO_CHIPS;
  }

  motion(allowed: boolean): void {
    if (this.overlay.motion(allowed)) this.options.onChange();
  }

  walls(view: WallView): boolean {
    return this.overlay.walls(view);
  }

  tick(nowMs: number, camera: Camera): boolean {
    const seen = seenBy(camera);
    return this.overlay.animating(seen) && this.overlay.tick(nowMs, seen);
  }

  dispose(): void {
    this.overlay.dispose();
  }

  private apply(): void {
    const { shown, wire } = this;
    if (shown === null || wire === null) return;
    const devices = deviceLightsOf(shown.floor, this.options.items, this.decals);
    const split = splitLights(devices, this.decalShare);
    const relit = applySplit(devices, split);
    this.decals = new Set(
      devices.flatMap(({ deviceId, lights }) => (split.decal.has(deviceId) ? lights : [])),
    );
    const changed = this.overlay.update({
      floor: shown.floor,
      model: wire.overlay,
      lighting: wire.lighting,
      realDeviceIds: split.real,
      theme: shown.theme,
    });
    const dusked = this.applyDusk(wire.lighting.dusk);
    if (changed || dusked || relit) this.options.onChange();
  }

  private applyDusk(dusk: DuskAmbient): boolean {
    if (sameDusk(this.applied, dusk)) return false;
    this.applied = dusk;
    this.dusk.apply(dusk);
    return true;
  }
}
