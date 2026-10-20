import {
  BELT_LINK_PHASES,
  BELT_STATES,
  zoneOf,
  type BeltLinkPhase,
  type BeltState,
} from '@smarteverything/domain';
import type { TreadmillFacts } from '../../types';
import { flagOf, numberOf, textOf, type Lookup } from '../lookup';
import type { Decorate } from './decorate';

const MOVING: ReadonlySet<BeltState> = new Set(['running', 'countdown', 'paused']);

function stateOf(text: string | null): BeltState {
  return BELT_STATES.find((state) => state === text) ?? 'idle';
}

function linkOf(text: string | null): BeltLinkPhase {
  return BELT_LINK_PHASES.find((phase) => phase === text) ?? 'not_linked';
}

function treadmillFacts(lookup: Lookup): TreadmillFacts {
  const speed = numberOf(lookup, 'belt_speed') ?? 0;
  return {
    belt: stateOf(textOf(lookup, 'belt_state')),
    link: linkOf(textOf(lookup, 'belt_link')),
    speedKmh: speed,
    zone: zoneOf(speed),
    timeS: numberOf(lookup, 'session_time') ?? 0,
    distanceM: numberOf(lookup, 'session_distance') ?? 0,
    fault: null,
    childLock: flagOf(lookup, 'child_lock') === true,
    cadence: null,
    inclineGrade: 0,
    inclineLabel: null,
    inclineMoving: null,
    heartZone: null,
  };
}

export const treadmillState: Decorate = (base, lookup) => {
  const facts = treadmillFacts(lookup);
  return { ...base, power: MOVING.has(facts.belt) ? 'on' : 'off', treadmill: facts };
};
