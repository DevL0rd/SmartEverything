import {
  zoneOf,
  type InclineScale,
  type TreadmillLiveFrame,
  type TreadmillStateView,
} from '@smarteverything/domain';
import type { TreadmillFacts, VisualState } from '../../../features/device-visuals/types';
import { gaitWord, heartZoneOf } from '../../../features/device-visuals/visuals/treadmill/geometry';

type Belt = TreadmillLiveFrame['belt'];

export function inclineLabelOf(percent: number | null, scale: InclineScale): string | null {
  if (percent === null) {
    return null;
  }
  return scale === 'percent' ? `${String(percent)}%` : String(percent);
}

export function inclineMovingOf(belt: Belt): TreadmillFacts['inclineMoving'] {
  const { inclinePercent, inclineTarget } = belt;
  if (inclinePercent === null || inclineTarget === null || inclineTarget === inclinePercent) {
    return null;
  }
  return inclineTarget > inclinePercent ? 'up' : 'down';
}

export function treadmillFactsOf(
  frame: TreadmillLiveFrame,
  fault: TreadmillStateView['fault'],
  maxBpm: number | null,
): TreadmillFacts {
  const { belt } = frame;
  return {
    belt: belt.state,
    link: belt.link,
    speedKmh: belt.speedKmh,
    zone: zoneOf(belt.speedKmh),
    timeS: belt.timeS,
    distanceM: belt.distanceM,
    fault: fault?.code ?? null,
    childLock: belt.childLock === true,
    cadence: belt.cadence,
    inclineGrade: belt.inclineGrade ?? 0,
    inclineLabel: inclineLabelOf(belt.inclinePercent, belt.inclineScale),
    inclineMoving: inclineMovingOf(belt),
    heartZone: maxBpm === null ? null : heartZoneOf(frame.body?.heartRate ?? null, maxBpm),
  };
}

export function treadmillVisualState(base: VisualState, facts: TreadmillFacts): VisualState {
  const moving = facts.belt === 'running' || facts.belt === 'countdown' || facts.belt === 'paused';
  return {
    ...base,
    power: moving || facts.inclineMoving !== null ? 'on' : 'off',
    treadmill: facts,
  };
}

export function treadmillLabel(facts: TreadmillFacts): string {
  const state = facts.belt.replace('_', ' ');
  const incline = facts.inclineLabel === null ? '' : `, incline ${facts.inclineLabel}`;
  if (facts.belt !== 'running') {
    return `Treadmill ${state}${incline}`;
  }
  return `Treadmill running, ${facts.speedKmh.toFixed(1)} kilometres per hour${incline}, walker ${gaitWord(facts.speedKmh)}`;
}
