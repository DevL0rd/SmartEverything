import type { ModelSpec } from '@smarteverything/domain';
import type { Texture } from 'three';
import type { ChannelSignals } from '../../../components/models/channels';
import {
  createContactShadow,
  type ContactShadow,
} from '../../../components/models/three/contact-shadow';
import {
  createEmitterHalos,
  type EmitterHalos,
} from '../../../components/models/three/emitter-halo';
import {
  createEmitterRig,
  emitterSurfaces,
  syncEmitterRigs,
  type PlacedRig,
} from '../../../components/models/three/emitters';
import { createGlowDecalFactory } from '../../../components/models/three/glow-decal';
import type { SceneModel } from '../../../components/models/three/scene-model';
import { createSilhouette, type Silhouette } from '../../../components/models/three/silhouette';
import {
  createStageScene,
  type StageScene,
  type StageTheme,
} from '../../../components/models/three/stage';
import { liveModelHash, type LiveModelKey, type ModelCache, type ModelHold } from './model-cache';

export interface DrawInput {
  readonly spec: ModelSpec;
  readonly model: LiveModelKey;
  readonly theme: StageTheme;
  readonly signals: ChannelSignals;
  readonly reduced: boolean;
  readonly lit: boolean;
}

export interface InstanceGroup {
  readonly key: string;
  readonly hold: ModelHold;
  readonly stage: StageScene;
  readonly model: SceneModel;
  readonly signals: ChannelSignals;
  readonly reduced: boolean;
  readonly views: ReadonlySet<string>;
  readonly prepare: (frame: GroupFrame) => boolean;
  readonly dressFor: (effects: boolean) => void;
}

export interface GroupFrame {
  readonly serial: number;
  readonly timeS: number;
  readonly decalShare: number;
}

export interface InstanceGroups {
  readonly join: (viewId: string, input: DrawInput) => InstanceGroup;
  readonly leave: (viewId: string) => void;
  readonly groupOf: (viewId: string) => InstanceGroup | undefined;
  readonly groups: () => readonly InstanceGroup[];
  readonly dispose: () => void;
}

function signalsText(signals: ChannelSignals): string {
  const entries = Object.entries(signals).filter(([, value]) => value !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

export function drawKey(input: DrawInput, hash: string): string {
  return JSON.stringify([hash, input.theme, input.reduced, input.lit, signalsText(input.signals)]);
}

interface Group extends InstanceGroup {
  readonly views: Set<string>;
  readonly dispose: () => void;
}

interface Dressing {
  readonly halos: EmitterHalos;
  readonly edge: Silhouette;
  readonly shadow: ContactShadow | null;
  readonly lights: RealLights | null;
}

interface RealLights {
  readonly placed: PlacedRig;
  readonly dispose: () => void;
}

function realLights(model: SceneModel, input: DrawInput): RealLights | null {
  if (!input.lit || model.emitters.length === 0) return null;
  const decals = createGlowDecalFactory();
  const surfaces = emitterSurfaces(input.spec);
  const rig = createEmitterRig({ model, surfaces, decals });
  return {
    placed: { rig, surfaces },
    dispose: (): void => {
      rig.dispose();
      decals.dispose();
    },
  };
}

function dress(stage: StageScene, hold: ModelHold, model: SceneModel, input: DrawInput): Dressing {
  const halos = createEmitterHalos(model, input.theme);
  const edge = createSilhouette(model.object3d, input.theme);
  const shadow = createContactShadow(hold.built, input.theme);
  stage.scene.add(model.object3d);
  if (shadow !== null) stage.scene.add(shadow.mesh);
  return { halos, edge, shadow, lights: realLights(model, input) };
}

function showEffects(dressing: Dressing, effects: boolean): void {
  const { halos, shadow } = dressing;
  for (const sprite of halos.sprites) sprite.visible = effects;
  if (shadow !== null) shadow.mesh.visible = effects;
}

function createGroup(key: string, hold: ModelHold, input: DrawInput, environment: Texture): Group {
  const stage = createStageScene(input.theme, environment);
  const model = hold.createItem();
  const dressing = dress(stage, hold, model, input);
  const { halos, edge, shadow, lights } = dressing;
  let preparedSerial = -1;
  let moving = false;
  const options = { reduced: input.reduced };
  return {
    key,
    hold,
    stage,
    model,
    signals: input.signals,
    reduced: input.reduced,
    views: new Set(),
    prepare: ({ serial, timeS, decalShare }): boolean => {
      if (serial === preparedSerial) return moving;
      preparedSerial = serial;
      moving = model.setSignals(input.signals, { ...options, timeS });
      halos.sync();
      if (lights !== null) syncEmitterRigs([lights.placed], decalShare);
      return moving;
    },
    dressFor: (effects): void => {
      showEffects(dressing, effects);
    },
    dispose: (): void => {
      lights?.dispose();
      shadow?.dispose();
      edge.dispose();
      halos.dispose();
      model.dispose();
      stage.dispose();
      hold.release();
    },
  };
}

export function createInstanceGroups(cache: ModelCache, environment: Texture): InstanceGroups {
  const groups = new Map<string, Group>();
  const membership = new Map<string, Group>();
  const leave = (viewId: string): void => {
    const group = membership.get(viewId);
    if (group === undefined) return;
    membership.delete(viewId);
    group.views.delete(viewId);
    if (group.views.size > 0) return;
    groups.delete(group.key);
    group.dispose();
  };
  const open = (key: string, input: DrawInput): Group => {
    const hold = cache.acquire(input.model, input.spec);
    const group = createGroup(key, hold, input, environment);
    groups.set(key, group);
    return group;
  };
  return {
    join: (viewId, input): InstanceGroup => {
      const key = drawKey(input, liveModelHash(input.model));
      const current = membership.get(viewId);
      const group = current?.key === key ? current : (groups.get(key) ?? open(key, input));
      if (group !== current) leave(viewId);
      group.views.add(viewId);
      membership.set(viewId, group);
      return group;
    },
    leave,
    groupOf: (viewId): InstanceGroup | undefined => membership.get(viewId),
    groups: (): readonly InstanceGroup[] => [...groups.values()],
    dispose: (): void => {
      for (const viewId of [...membership.keys()]) leave(viewId);
    },
  };
}
