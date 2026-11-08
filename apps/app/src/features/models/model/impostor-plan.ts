import type { ModelSpecChannel, ModelSpecFraming, ModelSpecShot } from '@smarteverything/domain';
import { DEFAULT_CHANNEL_AXIS, type ChannelAxis } from '../../../components/models/channels';

export type ImpostorView = 'tile' | 'card' | 'hero';

export type ChannelMode = 'affine' | 'atlas';

export interface ImpostorCamera {
  readonly yaw: number;
  readonly pitch: number;
}

export interface ImpostorChannel {
  readonly id: string;
  readonly mode: ChannelMode;
}

export interface ImpostorClip {
  readonly shotId: string;
  readonly frames: number;
  readonly loopS: number;
  readonly periodS: number;
  readonly stillAt: number;
  readonly stillFrame: number;
}

export interface ImpostorPlan {
  readonly view: ImpostorView;
  readonly channels: readonly ImpostorChannel[];
  readonly clips: readonly ImpostorClip[];
  readonly atlasWithoutShot: readonly string[];
}

export interface ImpostorSubject {
  readonly framing: ModelSpecFraming;
  readonly channels?: readonly ModelSpecChannel[] | undefined;
  readonly shots?: readonly ModelSpecShot[] | undefined;
}

export const CLIP_FRAMES: Readonly<Record<ImpostorView, number>> = {
  tile: 24,
  card: 36,
  hero: 48,
};

export const AFFINE_MAX_DISTORTION = 0.01;

export const AFFINE_TOLERANCE_RAD = Math.acos(1 - AFFINE_MAX_DISTORTION);

const FULL_TURN_DEGREES = 360;

const DEG = Math.PI / 180;

const TINT_PROPERTIES: ReadonlySet<ModelSpecChannel['property']> = new Set([
  'opacity',
  'visible',
  'emissive',
  'colour',
]);

function viewAxisComponent(camera: ImpostorCamera, axis: ChannelAxis): number {
  const yaw = camera.yaw * DEG;
  const pitch = camera.pitch * DEG;
  switch (axis) {
    case 'x':
      return Math.sin(yaw) * Math.cos(pitch);
    case 'y':
      return Math.sin(pitch);
    case 'z':
      return Math.cos(yaw) * Math.cos(pitch);
  }
}

function alignedWithView(camera: ImpostorCamera, axis: ChannelAxis): boolean {
  return Math.abs(viewAxisComponent(camera, axis)) >= Math.cos(AFFINE_TOLERANCE_RAD);
}

function lyingInScreen(camera: ImpostorCamera, axis: ChannelAxis): boolean {
  return Math.abs(viewAxisComponent(camera, axis)) <= Math.sin(AFFINE_TOLERANCE_RAD);
}

export function classifyChannel(
  channel: Pick<ModelSpecChannel, 'property' | 'axis'>,
  camera: ImpostorCamera,
): ChannelMode {
  if (TINT_PROPERTIES.has(channel.property)) return 'affine';
  const axis = channel.axis ?? DEFAULT_CHANNEL_AXIS;
  if (channel.property === 'rotate') return alignedWithView(camera, axis) ? 'affine' : 'atlas';
  if (channel.property === 'translate') return alignedWithView(camera, axis) ? 'atlas' : 'affine';
  if (channel.property === 'scale') {
    return channel.axis === undefined || lyingInScreen(camera, axis) ? 'affine' : 'atlas';
  }
  return 'atlas';
}

export function clipFrameCount(view: ImpostorView, symmetry: number): number {
  const share = Math.min(symmetry, FULL_TURN_DEGREES) / FULL_TURN_DEGREES;
  return Math.max(1, Math.ceil(CLIP_FRAMES[view] * share));
}

export function planClip(view: ImpostorView, shot: ModelSpecShot): ImpostorClip {
  const frames = clipFrameCount(view, shot.symmetry);
  const periodS = (shot.loopS * Math.min(shot.symmetry, FULL_TURN_DEGREES)) / FULL_TURN_DEGREES;
  const phase = (shot.stillAt % periodS) / periodS;
  return {
    shotId: shot.id,
    frames,
    loopS: shot.loopS,
    periodS,
    stillAt: shot.stillAt,
    stillFrame: Math.round(phase * frames) % frames,
  };
}

export function planImpostor(subject: ImpostorSubject, view: ImpostorView): ImpostorPlan {
  const camera = subject.framing[view];
  const channels = (subject.channels ?? []).map((channel) => ({
    id: channel.id,
    mode: classifyChannel(channel, camera),
  }));
  const clips = (subject.shots ?? []).map((shot) => planClip(view, shot));
  const atlasWithoutShot =
    clips.length === 0 ? channels.filter((c) => c.mode === 'atlas').map((c) => c.id) : [];
  return { view, channels, clips, atlasWithoutShot };
}
