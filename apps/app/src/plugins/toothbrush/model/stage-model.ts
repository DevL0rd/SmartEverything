import {
  stepsOf,
  zoneNamesOf,
  zonesMissed,
  zonesReached,
  type BrushProfile,
  type BrushLiveFrame,
  type BrushingSession,
  type ZoneCount,
} from '@smarteverything/domain';
import type { ZoneState } from '../charts/mouth-map';
import { clockText, stepBar, type Step } from './brush-model';
import { pacedZones, zoneSourceOf } from './session-model';

export function zoneStates(steps: readonly Step[]): ReadonlyMap<number, ZoneState> {
  const states = new Map<number, ZoneState>();
  for (const step of steps) {
    if (step.zone === null) {
      continue;
    }
    const known = states.get(step.zone);
    if (known === 'current' || step.state === 'todo') {
      states.set(step.zone, known ?? 'todo');
    } else {
      states.set(step.zone, step.state);
    }
  }
  return states;
}

export function stepCaption(profile: BrushProfile, steps: readonly Step[]): string {
  const names = zoneNamesOf(profile.zones);
  const index = steps.findIndex((step) => step.state === 'current');
  const step = steps[index];
  if (step === undefined) {
    return 'Routine finished';
  }
  const zone = step.zone === null ? 'Whole mouth' : (names[step.zone - 1] ?? 'Whole mouth');
  return `Step ${String(index + 1)} of ${String(steps.length)}: ${zone}`;
}

export function timerLabel(elapsedS: number, routineS: number): string {
  return `${clockText(elapsedS)} of ${clockText(routineS)}`;
}

export function timerProgress(elapsedS: number, routineS: number): number {
  return routineS <= 0 ? 0 : Math.min(1, elapsedS / routineS);
}

function pacerSteps(frame: BrushLiveFrame, zones: ZoneCount, routineS: number): readonly Step[] {
  const order = stepsOf(frame.mode ?? 'clean', zones);
  if (order.length === 0) {
    return [{ zone: null, state: frame.elapsedS >= routineS ? 'done' : 'current' }];
  }
  const found = frame.zone === null ? -1 : order.indexOf(frame.zone);
  const current = Math.max(0, found);
  return order.map((zone, index): Step => ({
    zone,
    state:
      frame.elapsedS >= routineS || index < current
        ? 'done'
        : index === current
          ? 'current'
          : 'todo',
  }));
}

export function liveSteps(
  frame: BrushLiveFrame,
  zones: ZoneCount,
  routineS: number,
): readonly Step[] {
  return frame.zoneSource === 'pacer'
    ? pacerSteps(frame, zones, routineS)
    : stepBar(frame.mode ?? 'clean', zones, routineS, frame.elapsedS);
}

export function sessionZoneStates(
  session: BrushingSession,
  profile: BrushProfile,
): ReadonlyMap<number, ZoneState> {
  const { mode } = session;
  const states = new Map<number, ZoneState>();
  if (zoneSourceOf(session) === 'pacer') {
    const paced = pacedZones(session, profile);
    for (const zone of paced.reached) {
      states.set(zone, 'done');
    }
    for (const zone of paced.missed) {
      states.set(zone, 'missed');
    }
    return states;
  }
  if (mode === null || stepsOf(mode, profile.zones).length === 0) {
    return states;
  }
  for (const zone of zonesReached(mode, profile.zones, session.durationS, session.routineS)) {
    states.set(zone, 'done');
  }
  for (const zone of zonesMissed(mode, profile.zones, session.durationS, session.routineS)) {
    states.set(zone, 'missed');
  }
  return states;
}
