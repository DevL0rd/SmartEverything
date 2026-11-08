import type { ModelSpec, ModelSpecShot } from '@smarteverything/domain';
import type { Box3 } from 'three';
import { activeShot, type ChannelSignals } from '../../../components/models/channels';
import type { BuiltModel } from '../../../components/models/three/build-model';
import {
  blendPose,
  containPose,
  focusPoint,
  frameView,
  keptBox,
  shotPose,
  shotProgress,
  type CameraPose,
  type ModelView,
  type Point3,
} from '../../../components/models/three/framing';

export interface ShotAim {
  readonly shot: ModelSpecShot;
  readonly focus: Point3;
  readonly kept: Box3 | undefined;
}

export interface ShotRig {
  readonly framed: CameraPose;
  readonly aspect: number;
  readonly aims: ReadonlyMap<string, ShotAim>;
}

export function shotRig(
  model: BuiltModel,
  spec: ModelSpec,
  view: ModelView,
  aspect: number,
): ShotRig {
  const aims = new Map<string, ShotAim>();
  for (const shot of spec.shots ?? []) {
    const focus = focusPoint(model, spec, shot.focus);
    aims.set(shot.id, { shot, focus, kept: keptBox(model, spec, view, shot.focus) });
  }
  return { framed: frameView(model, spec, view, aspect), aspect, aims };
}

export interface ShotFrame {
  readonly pose: CameraPose;
  readonly shotId: string | null;
  readonly timeS: number;
  readonly moving: boolean;
}

export interface ShotInput {
  readonly rig: ShotRig;
  readonly spec: ModelSpec;
  readonly signals: ChannelSignals;
  readonly reduced: boolean;
  readonly nowMs: number;
}

export interface ShotTracker {
  readonly frame: (input: ShotInput) => ShotFrame;
}

function aimedPose(rig: ShotRig, aim: ShotAim, elapsedS: number): CameraPose {
  return shotPose(rig.framed, aim.shot, aim.focus, elapsedS);
}

function heldFrame(rig: ShotRig, aim: ShotAim | undefined): ShotFrame {
  if (aim === undefined) return { pose: rig.framed, shotId: null, timeS: 0, moving: false };
  const { shot } = aim;
  const pose = containPose(aimedPose(rig, aim, shot.stillAt), aim.kept, rig.aspect);
  return { pose, shotId: shot.id, timeS: shot.stillAt, moving: false };
}

interface Transition {
  readonly shotId: string | null;
  readonly changedAt: number;
  readonly from: CameraPose | null;
  readonly easeMs: number;
  readonly kept: Box3 | undefined;
}

function rawTarget(rig: ShotRig, aim: ShotAim | undefined, elapsedS: number): CameraPose {
  return aim === undefined ? rig.framed : aimedPose(rig, aim, elapsedS);
}

interface Aimed {
  readonly aim: ShotAim | undefined;
  readonly shotId: string | null;
}

function aimOf(rig: ShotRig, spec: ModelSpec, signals: ChannelSignals): Aimed {
  const shot = activeShot(spec.shots, signals);
  const aim = shot === undefined ? undefined : rig.aims.get(shot.id);
  return { aim, shotId: aim?.shot.id ?? null };
}

function leavingAim(rig: ShotRig, state: Transition): ShotAim | undefined {
  return state.shotId === null ? undefined : rig.aims.get(state.shotId);
}

function nextTransition(
  rig: ShotRig,
  state: Transition,
  aimed: Aimed,
  at: { readonly nowMs: number; readonly shown: CameraPose | null },
): Transition {
  if (aimed.shotId === state.shotId) return state;
  const moved = aimed.aim ?? leavingAim(rig, state);
  const from = at.shown ?? rig.framed;
  const easeMs = moved?.shot.easeMs ?? 0;
  return { shotId: aimed.shotId, changedAt: at.nowMs, from, easeMs, kept: moved?.kept };
}

interface Eased {
  readonly frame: ShotFrame;
  readonly shown: CameraPose;
}

function easedFrame(
  rig: ShotRig,
  state: Transition,
  aim: ShotAim | undefined,
  nowMs: number,
): Eased {
  const sinceMs = nowMs - state.changedAt;
  const progress = state.from === null ? 1 : shotProgress(sinceMs, state.easeMs);
  const target = rawTarget(rig, aim, sinceMs / 1000);
  const blended = blendPose(state.from ?? target, target, progress);
  const pose = containPose(blended, state.kept, rig.aspect);
  const orbiting = (aim?.shot.orbit ?? 0) !== 0;
  const frame: ShotFrame = {
    pose,
    shotId: state.shotId,
    timeS: sinceMs / 1000,
    moving: progress < 1 || orbiting,
  };
  return { frame, shown: blended };
}

export function createShotTracker(startMs: number): ShotTracker {
  let state: Transition = {
    shotId: null,
    changedAt: startMs,
    from: null,
    easeMs: 0,
    kept: undefined,
  };
  let shown: CameraPose | null = null;
  return {
    frame: ({ rig, spec, signals, reduced, nowMs }): ShotFrame => {
      const aimed = aimOf(rig, spec, signals);
      state = nextTransition(rig, state, aimed, { nowMs, shown });
      if (reduced) {
        const held = heldFrame(rig, aimed.aim);
        shown = held.pose;
        return held;
      }
      const eased = easedFrame(rig, state, aimed.aim, nowMs);
      shown = eased.shown;
      return eased.frame;
    },
  };
}
