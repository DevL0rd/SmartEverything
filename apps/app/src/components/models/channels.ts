import type {
  ModelSignalValue,
  ModelSpecChannel,
  ModelSpecCondition,
  ModelSpecShot,
} from '@smarteverything/domain';

export type ChannelSignals = Readonly<Partial<Record<string, ModelSignalValue>>>;

export type ChannelScalar = number | string | boolean;

export type ChannelAxis = 'x' | 'y' | 'z';

export const DEFAULT_CHANNEL_AXIS: ChannelAxis = 'y';

export type ChannelOutput =
  | { readonly kind: 'value'; readonly value: ChannelScalar; readonly easeMs: number }
  | { readonly kind: 'spin'; readonly perSecond: number }
  | {
      readonly kind: 'pulse';
      readonly base: number;
      readonly periodS: number;
      readonly amplitude: number;
    }
  | {
      readonly kind: 'oscillate';
      readonly limits: readonly [number, number];
      readonly speed: number;
    }
  | {
      readonly kind: 'step';
      readonly keyframes: readonly ChannelScalar[];
      readonly intervalMs: number;
    };

export interface ChannelFrame {
  readonly channelId: string;
  readonly target: string;
  readonly property: ModelSpecChannel['property'];
  readonly axis: ChannelAxis | undefined;
  readonly output: ChannelOutput;
}

export interface ReducedChannelFrame {
  readonly channelId: string;
  readonly target: string;
  readonly property: ModelSpecChannel['property'];
  readonly axis: ChannelAxis | undefined;
  readonly hidden: boolean;
  readonly value: ChannelScalar | undefined;
}

export interface ChannelSubject {
  readonly channels?: readonly ModelSpecChannel[] | undefined;
  readonly shots?: readonly ModelSpecShot[] | undefined;
}

const TURN_DEGREES = 360;

const KELVIN_RANGE: readonly [number, number] = [1000, 40000];

function interpolate(
  value: number,
  from: readonly [number, number],
  to: readonly [number, number],
  clamp: boolean,
): number {
  const span = from[1] - from[0];
  const raw = span === 0 ? (value >= from[1] ? 1 : 0) : (value - from[0]) / span;
  const t = clamp ? Math.min(1, Math.max(0, raw)) : raw;
  return to[0] + (to[1] - to[0]) * t;
}

function channelByte(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

function hexByte(value: number): string {
  return channelByte(value).toString(16).padStart(2, '0');
}

export function kelvinToHex(kelvin: number): string {
  const scaled = kelvin / 100;
  const red = scaled <= 66 ? 255 : 329.698727446 * (scaled - 60) ** -0.1332047592;
  const green =
    scaled <= 66
      ? 99.4708025861 * Math.log(scaled) - 161.1195681661
      : 288.1221695283 * (scaled - 60) ** -0.0755148492;
  const blue =
    scaled >= 66 ? 255 : scaled <= 19 ? 0 : 138.5177312231 * Math.log(scaled - 10) - 305.0447927307;
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}

function enumKey(value: ModelSignalValue): string {
  return String(value);
}

type ChannelMap = ModelSpecChannel['map'];

function mapNumber(map: ChannelMap, value: number): ChannelScalar | undefined {
  switch (map.type) {
    case 'linear':
      return interpolate(value, map.in, map.out, map.clamp === true);
    case 'speed':
      return interpolate(value, map.in, map.perSecond, true);
    case 'colour': {
      if (map.from !== 'temperature') return undefined;
      const range = map.kelvin ?? KELVIN_RANGE;
      return kelvinToHex(Math.min(range[1], Math.max(range[0], value)));
    }
    case 'enum':
      return Object.hasOwn(map.table, enumKey(value)) ? map.table[enumKey(value)] : undefined;
  }
}

function mapValue(map: ChannelMap, value: ModelSignalValue): ChannelScalar | undefined {
  if (value === null) return undefined;
  if (typeof value === 'number') return mapNumber(map, value);
  if (map.type === 'enum') {
    return Object.hasOwn(map.table, enumKey(value)) ? map.table[enumKey(value)] : undefined;
  }
  if (map.type === 'colour' && map.from === 'signal' && typeof value === 'string') return value;
  return undefined;
}

function readSource(
  source: ModelSpecChannel['source'],
  signals: ChannelSignals,
  capabilities: ChannelSignals | undefined,
): ModelSignalValue | undefined {
  return typeof source === 'string' ? signals[source] : capabilities?.[source.capability];
}

function isActive(mapped: ChannelScalar): boolean {
  return typeof mapped === 'number' ? mapped !== 0 : mapped !== false && mapped !== '';
}

function numericOutput(motion: ModelSpecChannel['motion'], mapped: number): ChannelOutput | null {
  if (motion.type === 'spin') return { kind: 'spin', perSecond: mapped };
  if (motion.type === 'pulse') {
    return { kind: 'pulse', base: mapped, periodS: motion.periodS, amplitude: motion.amplitude };
  }
  return null;
}

function switchedOutput(motion: ModelSpecChannel['motion']): ChannelOutput | null {
  if (motion.type === 'oscillate') {
    return { kind: 'oscillate', limits: motion.limits, speed: motion.speed };
  }
  if (motion.type === 'step') {
    return { kind: 'step', keyframes: motion.keyframes, intervalMs: motion.intervalMs };
  }
  return null;
}

function outputOf(motion: ModelSpecChannel['motion'], mapped: ChannelScalar): ChannelOutput | null {
  if (motion.type === 'pose') return { kind: 'value', value: mapped, easeMs: motion.easeMs ?? 0 };
  if (typeof mapped === 'number' && (motion.type === 'spin' || motion.type === 'pulse')) {
    return numericOutput(motion, mapped);
  }
  return isActive(mapped) ? switchedOutput(motion) : null;
}

export function evaluateChannel(
  channel: ModelSpecChannel,
  signals: ChannelSignals,
  capabilities?: ChannelSignals,
): ChannelOutput | null {
  const raw = readSource(channel.source, signals, capabilities);
  if (raw === undefined) return null;
  const mapped = mapValue(channel.map, raw);
  return mapped === undefined ? null : outputOf(channel.motion, mapped);
}

export function evaluateChannels(
  channels: readonly ModelSpecChannel[],
  signals: ChannelSignals,
  capabilities?: ChannelSignals,
): ChannelFrame[] {
  const frames: ChannelFrame[] = [];
  for (const channel of channels) {
    const output = evaluateChannel(channel, signals, capabilities);
    if (output === null) continue;
    frames.push({
      channelId: channel.id,
      target: channel.target,
      property: channel.property,
      axis: channel.axis,
      output,
    });
  }
  return frames;
}

export function blurAmount(blur: ModelSpecChannel['blur'], output: ChannelOutput | null): number {
  if (blur === undefined || output === null) return 0;
  if (output.kind !== 'spin' && output.kind !== 'oscillate') return 0;
  const speed = Math.abs(output.kind === 'spin' ? output.perSecond : output.speed);
  return Math.min(1, Math.max(0, (speed - blur.from) / (blur.to - blur.from)));
}

function triangle(limits: readonly [number, number], travelled: number): number {
  const low = Math.min(limits[0], limits[1]);
  const span = Math.abs(limits[1] - limits[0]);
  if (span === 0) return low;
  const phase = travelled % (2 * span);
  return low + (phase <= span ? phase : 2 * span - phase);
}

export function sampleOutput(
  property: ModelSpecChannel['property'],
  output: ChannelOutput,
  timeS: number,
): ChannelScalar {
  switch (output.kind) {
    case 'value':
      return output.value;
    case 'spin':
      return output.perSecond * timeS * (property === 'rotate' ? TURN_DEGREES : 1);
    case 'pulse':
      return output.base + output.amplitude * Math.sin((2 * Math.PI * timeS) / output.periodS);
    case 'oscillate':
      return triangle(output.limits, output.speed * timeS);
    case 'step': {
      const index = Math.floor((timeS * 1000) / output.intervalMs) % output.keyframes.length;
      return output.keyframes[index] ?? output.keyframes[0] ?? 0;
    }
  }
}

export function isMoving(output: ChannelOutput): boolean {
  switch (output.kind) {
    case 'value':
      return false;
    case 'spin':
      return output.perSecond !== 0;
    case 'pulse':
      return output.amplitude !== 0;
    case 'oscillate':
      return output.limits[0] !== output.limits[1];
    case 'step':
      return output.keyframes.length > 1;
  }
}

type Leaf = ModelSpecCondition['anyOf'][number]['allOf'][number];

const ORDERED: Readonly<
  Record<Exclude<Leaf['op'], 'eq' | 'ne'>, (actual: number, expected: number) => boolean>
> = {
  gt: (actual, expected) => actual > expected,
  gte: (actual, expected) => actual >= expected,
  lt: (actual, expected) => actual < expected,
  lte: (actual, expected) => actual <= expected,
};

function leafHolds(
  leaf: Leaf,
  signals: ChannelSignals,
  capabilities: ChannelSignals | undefined,
): boolean {
  const actual = readSource(leaf.signal, signals, capabilities);
  if (actual === undefined || actual === null) return false;
  if (leaf.op === 'eq') return actual === leaf.value;
  if (leaf.op === 'ne') return actual !== leaf.value;
  if (typeof actual !== 'number' || typeof leaf.value !== 'number') return false;
  return ORDERED[leaf.op](actual, leaf.value);
}

export function conditionHolds(
  condition: ModelSpecCondition,
  signals: ChannelSignals,
  capabilities?: ChannelSignals,
): boolean {
  return condition.anyOf.some((group) =>
    group.allOf.every((leaf) => leafHolds(leaf, signals, capabilities)),
  );
}

export function activeShot(
  shots: readonly ModelSpecShot[] | undefined,
  signals: ChannelSignals,
  capabilities?: ChannelSignals,
): ModelSpecShot | undefined {
  return shots?.find((shot) => conditionHolds(shot.when, signals, capabilities));
}

export function reducedChannelFrames(
  subject: ChannelSubject,
  signals: ChannelSignals,
  capabilities?: ChannelSignals,
): ReducedChannelFrame[] {
  const stillAtS = activeShot(subject.shots, signals, capabilities)?.stillAt ?? 0;
  const frames: ReducedChannelFrame[] = [];
  for (const channel of subject.channels ?? []) {
    const base = {
      channelId: channel.id,
      target: channel.target,
      property: channel.property,
      axis: channel.axis,
    };
    if (channel.reduced === 'hide') {
      frames.push({ ...base, hidden: true, value: undefined });
      continue;
    }
    const output = evaluateChannel(channel, signals, capabilities);
    if (output === null) continue;
    frames.push({
      ...base,
      hidden: false,
      value: sampleOutput(channel.property, output, stillAtS),
    });
  }
  return frames;
}
