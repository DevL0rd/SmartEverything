import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecTransform,
} from '@smarteverything/domain/model-spec';
import {
  Vector3,
  type Color,
  type Euler,
  type Group,
  type MeshPhysicalMaterial,
  type Object3D,
  type Texture,
} from 'three';
import {
  DEFAULT_CHANNEL_AXIS,
  blurAmount,
  evaluateChannel,
  evaluateChannels,
  isMoving,
  reducedChannelFrames,
  sampleOutput,
  type ChannelAxis,
  type ChannelScalar,
  type ChannelSignals,
} from '../channels';
import { resolveValue, type ModelParamValues } from './geometry';
import { setSeeThrough } from './materials';

export interface SceneSignalOptions {
  readonly capabilities?: ChannelSignals | undefined;
  readonly timeS?: number | undefined;
  readonly reduced?: boolean | undefined;
}

export interface SceneEmitter {
  readonly id: string;
  readonly node: Object3D;
  readonly cone: number | undefined;
  readonly radius: number;
  readonly color: string;
  readonly intensity: number;
  readonly on: boolean;
}

export type Emitter = { -readonly [K in keyof SceneEmitter]: SceneEmitter[K] } & {
  readonly baseColor: string;
  readonly baseIntensity: number;
};

export interface Look {
  readonly material: MeshPhysicalMaterial;
  readonly color: Color;
  readonly emissive: Color;
  readonly emissiveIntensity: number;
  readonly opacity: number;
  readonly transparent: boolean;
  readonly textures: readonly Texture[];
}

export interface Target {
  readonly node: Object3D;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: Vector3;
  readonly visible: boolean;
  readonly poses: Readonly<Record<string, ModelSpecTransform>>;
  readonly look: Look | null;
  readonly emitter: Emitter | null;
}

type Property = ModelSpecChannel['property'];

interface FrameLike {
  readonly property: Property;
  readonly axis: ChannelAxis | undefined;
}

export const DEGREE = Math.PI / 180;
const HEX = /^#[0-9a-fA-F]{6}$/;
const LOOK_PROPERTIES: ReadonlySet<Property> = new Set([
  'emissive',
  'colour',
  'opacity',
  'uvScroll',
]);

export interface ChannelParts {
  readonly targeted: ReadonlySet<string>;
  readonly looked: ReadonlySet<string>;
}

export function channelParts(spec: ModelSpec): ChannelParts {
  const channels = spec.channels ?? [];
  const blurred = channels.flatMap((c) => (c.blur === undefined ? [] : [c.target, c.blur.part]));
  const looks = channels.filter((c) => LOOK_PROPERTIES.has(c.property)).map((c) => c.target);
  return {
    targeted: new Set([...channels.map((c) => c.target), ...blurred]),
    looked: new Set([...looks, ...blurred]),
  };
}

function scalarNumber(value: ChannelScalar): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function lookOf(source: MeshPhysicalMaterial): Look {
  const material = source.clone();
  const textures: Texture[] = [];
  const own = (texture: Texture | null): Texture | null => {
    const copy = texture?.clone() ?? null;
    if (copy !== null) textures.push(copy);
    return copy;
  };
  Object.assign(material, {
    map: own(material.map),
    bumpMap: own(material.bumpMap),
    roughnessMap: own(material.roughnessMap),
  });
  return {
    material,
    color: material.color.clone(),
    emissive: material.emissive.clone(),
    emissiveIntensity: material.emissiveIntensity,
    opacity: material.opacity,
    transparent: material.transparent,
    textures,
  };
}

export function targetOf(node: Object3D, look: Look | null, emitter: Emitter | null): Target {
  const { position, rotation, scale, visible } = node;
  const base = { position: position.clone(), rotation: rotation.clone(), scale: scale.clone() };
  return { node, ...base, visible, poses: {}, look, emitter };
}

export function emitterOf(anchor: ModelSpecAnchor, node: Object3D): Emitter | null {
  if (anchor.kind !== 'emitter') return null;
  const { id, color, intensity, cone, radius } = anchor;
  const base = { baseColor: color, baseIntensity: intensity };
  return { id, node, cone, radius, color, intensity, on: intensity > 0, ...base };
}

function resetTarget(target: Target): void {
  const { node, look, emitter } = target;
  node.position.copy(target.position);
  node.rotation.copy(target.rotation);
  node.scale.copy(target.scale);
  node.visible = target.visible;
  if (look !== null) {
    const { material } = look;
    material.color.copy(look.color);
    material.emissive.copy(look.emissive);
    material.emissiveIntensity = look.emissiveIntensity;
    material.opacity = look.opacity;
    setSeeThrough(material, look.transparent);
    for (const texture of look.textures) texture.offset.set(0, 0);
  }
  if (emitter !== null) Object.assign(emitter, { color: emitter.baseColor });
  if (emitter !== null) Object.assign(emitter, { intensity: emitter.baseIntensity });
}

function applyEmitter(emitter: Emitter, property: Property, value: ChannelScalar): void {
  if (property === 'emissive') {
    Object.assign(emitter, { intensity: emitter.baseIntensity * scalarNumber(value) });
  }
  if (property === 'colour' && typeof value === 'string' && HEX.test(value)) {
    Object.assign(emitter, { color: value });
  }
}

function applyMaterial(look: Look, property: Property, value: ChannelScalar): void {
  const { material } = look;
  const amount = scalarNumber(value);
  if (property === 'colour' && typeof value === 'string' && HEX.test(value)) {
    material.color.set(value);
  }
  if (property === 'emissive') {
    material.emissive.copy(material.color);
    material.emissiveIntensity = amount;
  }
  if (property === 'opacity') {
    material.opacity = amount;
    setSeeThrough(material, look.transparent || amount < 1);
  }
  if (property === 'uvScroll') for (const texture of look.textures) texture.offset.set(0, amount);
}

function bound(values: ModelSpecTransform['position'], params: ModelParamValues): Vector3 | null {
  if (values === undefined) return null;
  const [x, y, z] = values;
  return new Vector3(resolveValue(x, params), resolveValue(y, params), resolveValue(z, params));
}

function applyPose(target: Target, name: string, params: ModelParamValues): void {
  const pose = target.poses[name];
  if (pose === undefined) return;
  const { node } = target;
  const position = bound(pose.position, params);
  const rotation = bound(pose.rotation, params);
  const scale = bound(pose.scale, params);
  if (position !== null) node.position.copy(position);
  if (rotation !== null) node.rotation.setFromVector3(rotation.multiplyScalar(DEGREE));
  if (scale !== null) node.scale.copy(scale);
}

const APPLY: Readonly<
  Record<
    Property,
    (target: Target, value: ChannelScalar, frame: FrameLike, params: ModelParamValues) => void
  >
> = {
  rotate: (target, value, frame) => {
    const axis = frame.axis ?? DEFAULT_CHANNEL_AXIS;
    const { rotation } = target.node;
    rotation[axis] = target.rotation[axis] + scalarNumber(value) * DEGREE;
  },
  translate: ({ node, position }, value, frame) => {
    const axis = frame.axis ?? DEFAULT_CHANNEL_AXIS;
    node.position.setComponent('xyz'.indexOf(axis), position[axis] + scalarNumber(value));
  },
  scale: ({ node, scale }, value, frame) => {
    const amount = scalarNumber(value);
    if (frame.axis === undefined) node.scale.copy(scale).multiplyScalar(amount);
    else node.scale.setComponent('xyz'.indexOf(frame.axis), scale[frame.axis] * amount);
  },
  visible: (target, value) => {
    const { node } = target;
    node.visible = typeof value === 'number' ? value !== 0 : value !== false && value !== '';
  },
  pose: (target, value, _frame, params) => {
    applyPose(target, String(value), params);
  },
  emissive: lookApplier('emissive'),
  colour: lookApplier('colour'),
  opacity: lookApplier('opacity'),
  uvScroll: lookApplier('uvScroll'),
};

function lookApplier(property: Property): (target: Target, value: ChannelScalar) => void {
  return ({ look, emitter }, value) => {
    if (emitter !== null) applyEmitter(emitter, property, value);
    if (look !== null) applyMaterial(look, property, value);
  };
}

function shownInChain(node: Object3D, root: Object3D): boolean {
  for (let at: Object3D | null = node; at !== null && at !== root; at = at.parent) {
    if (!at.visible) return false;
  }
  return root.visible;
}

export type SceneSignalSetter = (signals: ChannelSignals, options?: SceneSignalOptions) => boolean;

export interface SignalItem {
  readonly spec: ModelSpec;
  readonly params: ModelParamValues;
  readonly group: Group;
  readonly targets: ReadonlyMap<string, Target>;
  readonly emitters: readonly Emitter[];
}

function applyReduced(
  item: SignalItem,
  signals: ChannelSignals,
  options: SceneSignalOptions,
): void {
  const { spec, params } = item;
  for (const frame of reducedChannelFrames(spec, signals, options.capabilities)) {
    const target = item.targets.get(frame.target);
    if (target === undefined) continue;
    if (frame.hidden) APPLY.visible(target, false, frame, params);
    else if (frame.value !== undefined) APPLY[frame.property](target, frame.value, frame, params);
  }
}

function applyLive(
  item: SignalItem,
  signals: ChannelSignals,
  options: SceneSignalOptions,
): boolean {
  const { spec, params } = item;
  const frames = evaluateChannels(spec.channels ?? [], signals, options.capabilities);
  const order = (property: Property): number => (property === 'colour' ? 0 : 1);
  frames.sort((a, b) => order(a.property) - order(b.property));
  for (const frame of frames) {
    const target = item.targets.get(frame.target);
    const value = sampleOutput(frame.property, frame.output, options.timeS ?? 0);
    if (target !== undefined) APPLY[frame.property](target, value, frame, params);
  }
  return frames.some((frame) => isMoving(frame.output));
}

function fade(target: Target, share: number): void {
  const { look } = target;
  if (look === null) return;
  look.material.opacity = look.opacity * share;
  setSeeThrough(look.material, look.transparent || share < 1);
}

function applyBlur(item: SignalItem, signals: ChannelSignals, options: SceneSignalOptions): void {
  for (const channel of item.spec.channels ?? []) {
    const layer = channel.blur === undefined ? undefined : item.targets.get(channel.blur.part);
    if (layer === undefined) continue;
    const hidden = options.reduced === true && channel.reduced === 'hide';
    const output = hidden ? null : evaluateChannel(channel, signals, options.capabilities);
    const amount = blurAmount(channel.blur, output);
    layer.node.visible = amount > 0;
    fade(layer, amount);
    const target = item.targets.get(channel.target);
    if (target !== undefined && target !== layer) fade(target, 1 - amount);
  }
}

export function signalSetter(item: SignalItem): SceneSignalSetter {
  return (signals, options = {}) => {
    for (const target of item.targets.values()) resetTarget(target);
    const reduced = options.reduced === true;
    if (reduced) applyReduced(item, signals, options);
    const moving = !reduced && applyLive(item, signals, options);
    applyBlur(item, signals, options);
    for (const emitter of item.emitters) {
      emitter.on = emitter.intensity > 0 && shownInChain(emitter.node, item.group);
    }
    return moving;
  };
}
