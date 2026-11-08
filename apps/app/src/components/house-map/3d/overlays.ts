import type { HomeMapOpeningStates } from '@smarteverything/domain';
import { Group, Line, Mesh, type Material, type MeshBasicMaterial, type Object3D } from 'three';
import type { RenderFloor } from '../render-scene';
import { createLightPoolLayer, type GlowDecals, type LightPoolLayer } from './light-pools';
import { OVERLAY_LOOKS, PULSE_FLOOR, PULSE_PERIOD_MS, type OverlayUpdate } from './overlay-kit';
import {
  buildOpeningPulse,
  buildOpenings,
  changedOpenings,
  openingStatesOf,
  OPENING_POSITIVE,
  OPENING_PULSE_MS,
  type OpeningPulse,
  type OpeningsContext,
} from './openings-live';
import { OVERLAY_PARTS, type Part } from './overlay-parts';
import {
  buildWallStems,
  wallCutOf,
  wallMountItems,
  wallMountKey,
  type WallView,
} from './wall-mounts';

export * from './overlay-kit';
export { OVERLAY_PARTS } from './overlay-parts';

function disposeOf(object: Mesh | Line): void {
  object.geometry.dispose();
  const materials: Material | readonly Material[] = object.material;
  for (const material of [materials].flat()) material.dispose();
}

function release(group: Group): void {
  for (const child of [...group.children]) {
    child.removeFromParent();
    child.traverse((object) => {
      if (object instanceof Mesh || object instanceof Line) disposeOf(object);
    });
  }
}

export type Seen = (object: Object3D) => boolean;

export interface OverlayLayer {
  readonly group: Group;
  readonly update: (next: OverlayUpdate) => boolean;
  readonly motion: (allowed: boolean) => boolean;
  readonly walls: (view: WallView) => boolean;
  readonly animating: (seen: Seen) => boolean;
  readonly tick: (nowMs: number, seen: Seen) => boolean;
  readonly dispose: () => void;
}

const pulseWave = (nowMs: number): number =>
  PULSE_FLOOR + (1 - PULSE_FLOOR) * (0.5 + 0.5 * Math.cos((2 * Math.PI * nowMs) / PULSE_PERIOD_MS));

interface Slot {
  readonly part: Part;
  readonly group: Group;
}

function holderOf(part: Part): Slot {
  const group = new Group();
  group.name = `overlay:${part.name}`;
  return { part, group };
}

function poolsOf(createDecals: GlowDecals): {
  readonly layer: LightPoolLayer;
  readonly update: (next: OverlayUpdate) => boolean;
} {
  const layer = createLightPoolLayer(createDecals);
  return {
    layer,
    update: (next): boolean => {
      const shown = next.lighting !== null;
      const toggled = layer.group.visible !== shown;
      layer.group.visible = shown;
      if (next.lighting === null) return toggled;
      const { lighting, realDeviceIds } = next;
      return layer.update({ lighting, elevation: next.floor.elevation, realDeviceIds }) || toggled;
    },
  };
}

function slotRebuilder(
  pulses: Map<Material, number>,
): (slot: Slot, next: OverlayUpdate) => boolean {
  const keys = new Map<string, string>();
  const floors = new Map<string, RenderFloor>();
  const pulse = (material: MeshBasicMaterial): MeshBasicMaterial => {
    pulses.set(material, material.opacity);
    return material;
  };
  return (slot, next) => {
    const key = JSON.stringify([slot.part.key(next.model), next.theme]);
    const { name } = slot.part;
    if (keys.get(name) === key && floors.get(name) === next.floor) return false;
    keys.set(name, key);
    floors.set(name, next.floor);
    if (name === 'alerts') pulses.clear();
    release(slot.group);
    const look = OVERLAY_LOOKS[next.theme];
    const built = slot.part.build({ update: next, look, y: next.floor.elevation, pulse });
    if (built.length > 0) slot.group.add(...built);
    return true;
  };
}

const openingsContext = (next: OverlayUpdate): OpeningsContext => ({
  floor: next.floor,
  y: next.floor.elevation,
  tones: { look: OVERLAY_LOOKS[next.theme], positive: OPENING_POSITIVE[next.theme] },
});

interface Running {
  readonly pulse: OpeningPulse;
  startedAt: number | null;
}

interface PulseRunner {
  readonly start: (id: string, pulse: OpeningPulse) => void;
  readonly tick: (nowMs: number) => boolean;
  readonly running: () => boolean;
  readonly clear: () => void;
}

function pulseRunner(rings: Group): PulseRunner {
  const running = new Map<string, Running>();
  const stop = (id: string): void => {
    const ring = running.get(id)?.pulse.ring;
    if (ring !== undefined) disposeOf(ring);
    ring?.removeFromParent();
    running.delete(id);
  };
  return {
    start: (id, pulse): void => {
      stop(id);
      running.set(id, { pulse, startedAt: null });
      rings.add(pulse.ring);
    },
    tick: (nowMs): boolean => {
      const active = running.size > 0;
      for (const [id, entry] of running) {
        entry.startedAt ??= nowMs;
        const progress = (nowMs - entry.startedAt) / OPENING_PULSE_MS;
        entry.pulse.at(progress);
        if (progress >= 1) stop(id);
      }
      return active;
    },
    running: (): boolean => running.size > 0,
    clear: (): void => {
      for (const id of [...running.keys()]) stop(id);
    },
  };
}

interface OpeningsSlot extends Omit<PulseRunner, 'start'> {
  readonly update: (next: OverlayUpdate) => boolean;
  readonly motion: (allowed: boolean) => boolean;
}

function openingsSlot(group: Group): OpeningsSlot {
  const leaves = new Group();
  leaves.name = 'openings-live';
  const rings = new Group();
  rings.name = 'opening-pulses';
  group.add(leaves, rings);
  const runner = pulseRunner(rings);
  let last: OverlayUpdate | null = null;
  let key = '';
  let states: HomeMapOpeningStates | null = null;
  let moving = false;
  const pulse = (next: OverlayUpdate, ids: readonly string[]): boolean => {
    const made = next.model.openings
      .filter((draw) => ids.includes(draw.id))
      .flatMap((draw) => {
        const ring = buildOpeningPulse(draw, openingsContext(next));
        return ring === null ? [] : [{ id: draw.id, ring }];
      });
    for (const { id, ring } of made) runner.start(id, ring);
    return made.length > 0;
  };
  return {
    update: (next): boolean => {
      const nextStates = openingStatesOf(next.model.openings);
      const changed = changedOpenings(states, nextStates, moving);
      states = nextStates;
      const nextKey = JSON.stringify([next.model.openings, next.theme]);
      if (last?.floor === next.floor && key === nextKey) return false;
      last = next;
      key = nextKey;
      release(leaves);
      const built = buildOpenings(next.model.openings, openingsContext(next));
      if (built.length > 0) leaves.add(...built);
      pulse(next, changed);
      return true;
    },
    motion: (allowed): boolean => {
      moving = allowed;
      if (allowed || !runner.running()) return false;
      runner.clear();
      return true;
    },
    tick: runner.tick,
    running: runner.running,
    clear: (): void => {
      runner.clear();
      release(leaves);
    },
  };
}

interface MountsSlot {
  readonly update: (view: WallView, current: OverlayUpdate | null) => boolean;
  readonly clear: () => void;
}

function mountsSlot(group: Group): MountsSlot {
  const stems = new Group();
  stems.name = 'wall-stems';
  group.add(stems);
  let key = '';
  let shown: OverlayUpdate['floor'] | null = null;
  return {
    update: (view, current): boolean => {
      if (current === null) return false;
      const { floor } = current;
      const items = wallMountItems(floor);
      const cut = wallCutOf(floor.walls, view);
      const nextKey = JSON.stringify([wallMountKey(items, cut), current.theme]);
      if (key === nextKey && shown === floor) return false;
      key = nextKey;
      shown = floor;
      release(stems);
      const built = buildWallStems({
        walls: floor.walls,
        items,
        cut,
        y: floor.elevation,
        look: OVERLAY_LOOKS[current.theme],
      });
      if (built.length > 0) stems.add(...built);
      return true;
    },
    clear: (): void => {
      release(stems);
    },
  };
}

const isMesh = (object: Object3D): object is Mesh => object instanceof Mesh;

function wornBy(mesh: Mesh): readonly Material[] {
  const worn: Material | readonly Material[] = mesh.material;
  return [worn].flat();
}

interface AlertPulses {
  readonly materials: Map<Material, number>;
  readonly shown: (seen: Seen) => boolean;
  readonly wave: (nowMs: number) => void;
  readonly rest: () => boolean;
}

function alertPulses(alerts: Group | undefined): AlertPulses {
  const materials = new Map<Material, number>();
  const pulsing = (object: Object3D): boolean =>
    isMesh(object) && wornBy(object).some((material) => materials.has(material));
  return {
    materials,
    shown: (seen): boolean => {
      let found = false;
      alerts?.traverse((object) => {
        found ||= pulsing(object) && seen(object);
      });
      return found;
    },
    wave: (nowMs): void => {
      for (const [material, base] of materials) material.opacity = base * pulseWave(nowMs);
    },
    rest: (): boolean => {
      for (const [material, base] of materials) material.opacity = base;
      return materials.size > 0;
    },
  };
}

export function createOverlayLayer(createDecals: GlowDecals): OverlayLayer {
  const group = new Group();
  group.name = 'overlays';
  const pools = poolsOf(createDecals);
  const slots = OVERLAY_PARTS.map(holderOf);
  group.add(pools.layer.group, ...slots.map((slot) => slot.group));
  const pulses = alertPulses(slots.find((slot) => slot.part.name === 'alerts')?.group);
  const rebuild = slotRebuilder(pulses.materials);
  const openings = openingsSlot(group);
  const mounts = mountsSlot(group);
  let latest: OverlayUpdate | null = null;
  let view: WallView | null = null;
  let moving = false;
  return {
    group,
    update: (next): boolean => {
      latest = next;
      const changed = slots.map((slot) => rebuild(slot, next));
      const stems = view === null ? false : mounts.update(view, next);
      return [pools.update(next), openings.update(next), stems, ...changed].includes(true);
    },
    motion: (allowed): boolean => {
      moving = allowed;
      const cleared = openings.motion(allowed);
      return (!allowed && pulses.rest()) || cleared;
    },
    walls: (next): boolean => {
      view = next;
      return mounts.update(next, latest);
    },
    animating: (seen): boolean => moving && (openings.running() || pulses.shown(seen)),
    tick: (nowMs, seen): boolean => {
      if (!moving) return false;
      const shown = pulses.shown(seen);
      if (shown) pulses.wave(nowMs);
      return openings.tick(nowMs) || shown;
    },
    dispose: (): void => {
      for (const slot of slots) release(slot.group);
      openings.clear();
      mounts.clear();
      pulses.materials.clear();
      pools.layer.dispose();
      group.removeFromParent();
    },
  };
}
