import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { BakeLayer, BakeView, LayersResult } from '../bake/bake-protocol';
import {
  DEFAULT_CHANNEL_AXIS,
  activeShot,
  evaluateChannel,
  isMoving,
  type ChannelAxis,
  type ChannelOutput,
  type ChannelSignals,
} from '../../../components/models/channels';
import type { ImpostorCamera } from '../model/impostor-plan';

export type MotionProperty = 'rotate' | 'translateX' | 'translateY' | 'scale' | 'opacity' | 'glow';

export interface LayerMotion {
  readonly property: MotionProperty;
  readonly output: ChannelOutput;
  readonly sign: number;
  readonly base: number;
}

export interface LayerPose {
  readonly rotate: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly opacity: number;
}

export interface LayerFrame {
  readonly width: number;
  readonly height: number;
}

export interface LayerSignals {
  readonly live: ChannelSignals;
  readonly baked: ChannelSignals;
}

const TURN_DEGREES = 360;

const DEG = Math.PI / 180;

const ROLE_ORDER: Readonly<Record<BakeLayer['role'], number>> = {
  shadow: 0,
  body: 1,
  part: 2,
  emissive: 3,
};

function triangle(limits: readonly [number, number], travelled: number): number {
  'worklet';
  const low = Math.min(limits[0], limits[1]);
  const span = Math.abs(limits[1] - limits[0]);
  if (span === 0) return low;
  const phase = travelled % (2 * span);
  return low + (phase <= span ? phase : 2 * span - phase);
}

function numeric(value: number | string | boolean | undefined): number {
  'worklet';
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number.NaN;
}

export function sampleMotion(motion: LayerMotion, timeS: number): number {
  'worklet';
  const { output } = motion;
  switch (output.kind) {
    case 'value':
      return numeric(output.value);
    case 'spin':
      return output.perSecond * timeS * (motion.property === 'rotate' ? TURN_DEGREES : 1);
    case 'pulse':
      return output.base + output.amplitude * Math.sin((2 * Math.PI * timeS) / output.periodS);
    case 'oscillate':
      return triangle(output.limits, output.speed * timeS);
    case 'step': {
      const index = Math.floor((timeS * 1000) / output.intervalMs) % output.keyframes.length;
      return numeric(output.keyframes[index]);
    }
  }
}

function settle(value: number, fallback: number): number {
  'worklet';
  return Number.isFinite(value) ? value : fallback;
}

export function layerPose(motions: readonly LayerMotion[], timeS: number): LayerPose {
  'worklet';
  let rotate = 0;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let opacity = 1;
  for (const motion of motions) {
    const value = sampleMotion(motion, timeS);
    const moved = settle((value - motion.base) * motion.sign, 0);
    if (motion.property === 'rotate') rotate += moved;
    if (motion.property === 'translateX') translateX += moved;
    if (motion.property === 'translateY') translateY += moved;
    if (motion.property === 'scale' && motion.base !== 0) scale *= settle(value / motion.base, 1);
    if (motion.property === 'opacity') {
      opacity *= motion.base === 0 ? settle(value, 1) : settle(value / motion.base, 1);
    }
    if (motion.property === 'glow') opacity *= Math.min(1, Math.max(0, settle(value, 1)));
  }
  return { rotate, translateX, translateY, scale, opacity: Math.min(1, Math.max(0, opacity)) };
}

type Vector = readonly [number, number, number];

const AXES: Readonly<Record<ChannelAxis, Vector>> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cameraBasis(camera: ImpostorCamera): readonly [Vector, Vector, Vector] {
  const yaw = camera.yaw * DEG;
  const pitch = camera.pitch * DEG;
  const back: Vector = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const right: Vector = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vector = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  return [right, up, back];
}

export function pixelsPerMetre(spec: ModelSpec, view: BakeView, frame: LayerFrame): number {
  const framing = spec.framing[view];
  const [right, up, back] = cameraBasis(framing);
  const fill = 1 - Math.min(framing.padding, 0.95);
  const tanV = Math.tan((framing.fov * DEG) / 2);
  const tanH = tanV * fill * (frame.width / frame.height);
  const { width, depth, height } = spec.footprint;
  let distance = 0;
  for (const x of [-width / 2, width / 2]) {
    for (const y of [-height / 2, height / 2]) {
      for (const z of [-depth / 2, depth / 2]) {
        const corner: Vector = [x, y, z];
        const near = dot(corner, back);
        distance = Math.max(
          distance,
          near + Math.abs(dot(corner, right)) / tanH,
          near + Math.abs(dot(corner, up)) / (tanV * fill),
        );
      }
    }
  }
  return distance === 0 ? 0 : frame.height / 2 / (distance * tanV);
}

export function screenShift(
  spec: ModelSpec,
  view: BakeView,
  frame: LayerFrame,
  axis: ChannelAxis,
): readonly [number, number] {
  const [right, up] = cameraBasis(spec.framing[view]);
  const scale = pixelsPerMetre(spec, view, frame);
  return [dot(AXES[axis], right) * scale, -dot(AXES[axis], up) * scale];
}

function viewAxis(camera: ImpostorCamera, axis: ChannelAxis): number {
  const yaw = camera.yaw * DEG;
  const pitch = camera.pitch * DEG;
  if (axis === 'x') return Math.sin(yaw) * Math.cos(pitch);
  if (axis === 'y') return Math.sin(pitch);
  return Math.cos(yaw) * Math.cos(pitch);
}

export function screenTurn(camera: ImpostorCamera, axis: ChannelAxis): number {
  return viewAxis(camera, axis) >= 0 ? -1 : 1;
}

function motionProperties(
  channel: ModelSpecChannel,
  role: BakeLayer['role'],
): readonly MotionProperty[] {
  if (role === 'emissive') return channel.property === 'emissive' ? ['glow'] : [];
  if (channel.property === 'visible' || channel.property === 'opacity') return ['opacity'];
  if (channel.property === 'translate') return ['translateX', 'translateY'];
  if (channel.property === 'rotate' || channel.property === 'scale') return [channel.property];
  return [];
}

function emissiveChannels(spec: ModelSpec): readonly string[] {
  return (spec.channels ?? []).filter((c) => c.property === 'emissive').map((c) => c.id);
}

export interface LayerView {
  readonly view: BakeView;
  readonly frame: LayerFrame;
}

export function layerMotions(
  spec: ModelSpec,
  at: LayerView,
  layer: BakeLayer,
  signals: LayerSignals,
): LayerMotion[] {
  const heldS = activeShot(spec.shots, signals.baked)?.stillAt ?? 0;
  const ids = layer.role === 'emissive' ? emissiveChannels(spec) : layer.channels;
  const motions: LayerMotion[] = [];
  for (const id of ids) {
    const channel = spec.channels?.find((each) => each.id === id);
    if (channel !== undefined) {
      motions.push(...channelMotions(channel, layer.role, { spec, at, heldS, signals }));
    }
  }
  return motions;
}

interface MotionContext {
  readonly spec: ModelSpec;
  readonly at: LayerView;
  readonly heldS: number;
  readonly signals: LayerSignals;
}

function motionSign(
  property: MotionProperty,
  channel: ModelSpecChannel,
  context: MotionContext,
): number {
  const axis = channel.axis ?? DEFAULT_CHANNEL_AXIS;
  const { spec, at } = context;
  if (property === 'translateX') return screenShift(spec, at.view, at.frame, axis)[0];
  if (property === 'translateY') return screenShift(spec, at.view, at.frame, axis)[1];
  return screenTurn(spec.framing[at.view], axis);
}

const MOVED_FROM_ZERO: ReadonlySet<MotionProperty> = new Set([
  'rotate',
  'translateX',
  'translateY',
]);

function channelMotions(
  channel: ModelSpecChannel,
  role: BakeLayer['role'],
  context: MotionContext,
): LayerMotion[] {
  const properties = motionProperties(channel, role);
  const output = properties.length === 0 ? null : evaluateChannel(channel, context.signals.live);
  if (output === null) return [];
  const baked = evaluateChannel(channel, context.signals.baked);
  return properties.map((property) => {
    const draft: LayerMotion = {
      property,
      output,
      sign: motionSign(property, channel, context),
      base: 0,
    };
    const base =
      baked === null ? Number.NaN : sampleMotion({ ...draft, output: baked }, context.heldS);
    return { ...draft, base: settle(base, MOVED_FROM_ZERO.has(property) ? 0 : 1) };
  });
}

export function layerTint(spec: ModelSpec, signals: ChannelSignals): string | null {
  for (const channel of spec.channels ?? []) {
    if (channel.property !== 'colour') continue;
    const output = evaluateChannel(channel, signals);
    if (output?.kind === 'value' && typeof output.value === 'string') return output.value;
  }
  return null;
}

export function layerMoves(motions: readonly LayerMotion[]): boolean {
  return motions.some((motion) => isMoving(motion.output));
}

function layerView(view: BakeView, image: LayersResult): LayerView {
  return { view, frame: { width: image.width, height: image.height } };
}

export function stackMoves(
  spec: ModelSpec,
  view: BakeView,
  image: LayersResult,
  signals: LayerSignals,
): boolean {
  const at = layerView(view, image);
  return image.layers.some((layer) => layerMoves(layerMotions(spec, at, layer, signals)));
}

export function stackOrder(layers: readonly BakeLayer[]): BakeLayer[] {
  return [...layers].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

export interface ShownLayer {
  readonly layer: BakeLayer;
  readonly motions: readonly LayerMotion[];
  readonly tint: string | null;
}

export function stackPlan(
  spec: ModelSpec,
  view: BakeView,
  image: LayersResult,
  signals: LayerSignals,
): ShownLayer[] {
  const tint = layerTint(spec, signals.live);
  const at = layerView(view, image);
  const shown: ShownLayer[] = [];
  for (const layer of stackOrder(image.layers)) {
    const motions = layerMotions(spec, at, layer, signals);
    const glow = layer.role === 'emissive';
    if (glow && tint === null && motions.length === 0) continue;
    shown.push({ layer, motions, tint: glow ? tint : null });
  }
  return shown;
}

interface LayerBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly transformOrigin: [number, number, number];
}

export function layerBox(layer: BakeLayer): LayerBox {
  const { rect, pivot } = layer;
  const origin = pivot ?? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    transformOrigin: [origin.x - rect.x, origin.y - rect.y, 0],
  };
}

function imageSize(layer: BakeLayer): { readonly width: number; readonly height: number } {
  return { width: layer.rect.width, height: layer.rect.height };
}

export interface LayerClock {
  readonly clock: SharedValue<number>;
  readonly playing: boolean;
  readonly heldS: number;
}

export function Layer({
  layer,
  motions,
  tint,
  timing,
}: {
  readonly layer: BakeLayer;
  readonly motions: readonly LayerMotion[];
  readonly tint: string | null;
  readonly timing: LayerClock;
}): ReactNode {
  const { clock, playing, heldS } = timing;
  const pose = useAnimatedStyle(() => {
    const at = layerPose(motions, playing ? heldS + clock.get() : heldS);
    return {
      opacity: at.opacity,
      transform: [
        { translateX: at.translateX },
        { translateY: at.translateY },
        { rotate: `${String(at.rotate)}deg` },
        { scale: at.scale },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" className="absolute" style={[layerBox(layer), pose]}>
      <Image
        source={layer.uri}
        recyclingKey={layer.uri}
        cachePolicy="disk"
        contentFit="fill"
        transition={0}
        tintColor={tint}
        style={imageSize(layer)}
        accessible={false}
      />
    </Animated.View>
  );
}

export function LayerStack({
  spec,
  view,
  image,
  signals,
  timing,
}: {
  readonly spec: ModelSpec;
  readonly view: BakeView;
  readonly image: LayersResult;
  readonly signals: LayerSignals;
  readonly timing: LayerClock;
}): ReactNode {
  return stackPlan(spec, view, image, signals).map((shown) => (
    <Layer
      key={shown.layer.id}
      layer={shown.layer}
      motions={shown.motions}
      tint={shown.tint}
      timing={timing}
    />
  ));
}
