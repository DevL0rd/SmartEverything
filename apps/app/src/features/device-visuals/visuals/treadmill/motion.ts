import { useEffect } from 'react';
import {
  css,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type CSSKeyframesRule,
  type SharedValue,
} from 'react-native-reanimated';
import { BREATHE, GLOW, loopStyle, sweep, type LoopStyle } from '../../../../design/loops';
import type { TreadmillFacts } from '../../types';
import {
  beltCycleMs,
  cadenceOf,
  gaitOf,
  strideCycleMs,
  TEXTURE_TRAVEL,
  type Gait,
} from './geometry';

const SPRING = { damping: 11, stiffness: 70, mass: 1 } as const;
const GLOW_MS = 1600;
const ARROW_MS = 800;

const flexes = new Map<number, CSSKeyframesRule>();
const lifts = new Map<number, CSSKeyframesRule>();
const slides = new Map<number, CSSKeyframesRule>();

export function slide(distance: number): CSSKeyframesRule {
  const key = Math.round(distance * 100);
  const known = slides.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = css.keyframes({
    from: { transform: [{ translateX: 0 }] },
    to: { transform: [{ translateX: -key / 100 }] },
  });
  slides.set(key, made);
  return made;
}

export function kneeFlex(bend: number): CSSKeyframesRule {
  const key = Math.round(bend);
  const known = flexes.get(key);
  if (known !== undefined) {
    return known;
  }
  const rotate = (share: number): { transform: [{ rotate: string }] } => ({
    transform: [{ rotate: `${String(Math.round(key * share))}deg` }],
  });
  const made = css.keyframes({
    '0%': rotate(0.1),
    '25%': rotate(0.1),
    '50%': rotate(0.7),
    '75%': rotate(1),
    '100%': rotate(0.1),
  });
  flexes.set(key, made);
  return made;
}

export function lift(distance: number): CSSKeyframesRule {
  const key = Math.round(distance * 10);
  const known = lifts.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = css.keyframes({
    from: { transform: [{ translateY: 0 }] },
    to: { transform: [{ translateY: -key / 10 }] },
  });
  lifts.set(key, made);
  return made;
}

export interface Gate {
  readonly moving: boolean;
  readonly reduced: boolean;
  readonly px: number;
}

export interface TreadmillMotion {
  readonly gait: Gait;
  readonly belt: LoopStyle | null;
  readonly thighFront: LoopStyle | null;
  readonly thighBack: LoopStyle | null;
  readonly shinFront: LoopStyle | null;
  readonly shinBack: LoopStyle | null;
  readonly armFront: LoopStyle | null;
  readonly armBack: LoopStyle | null;
  readonly bob: LoopStyle | null;
  readonly glow: LoopStyle | null;
  readonly pulse: LoopStyle | null;
}

function runsOf(facts: TreadmillFacts, gate: Gate): { going: boolean; frozen: boolean } {
  const live = gate.moving && !gate.reduced;
  const stepping = facts.belt === 'running' || facts.belt === 'paused';
  return { going: live && stepping, frozen: facts.belt === 'paused' };
}

export function motionOf(facts: TreadmillFacts, gate: Gate): TreadmillMotion {
  const gait = gaitOf(facts.speedKmh);
  const { going, frozen } = runsOf(facts, gate);
  const live = gate.moving && !gate.reduced;
  const cycle = strideCycleMs(cadenceOf(facts.cadence, facts.speedKmh));
  const half = cycle / 2;
  const beltMs = beltCycleMs(facts.speedKmh);
  const swing = { ms: half, alternate: true, easing: 'ease-in-out' } as const;
  const thigh = { ...swing, name: sweep(gait.amp) };
  const arm = { ...swing, name: sweep(gait.arm) };
  const shin = { name: kneeFlex(gait.bend), ms: cycle };
  return {
    gait,
    belt:
      beltMs === null
        ? null
        : loopStyle(
            { name: slide((TEXTURE_TRAVEL * gate.px) / 400), ms: beltMs },
            live && facts.belt === 'running',
          ),
    thighFront: loopStyle(thigh, going, frozen),
    thighBack: loopStyle({ ...thigh, delay: -half }, going, frozen),
    shinFront: loopStyle(shin, going, frozen),
    shinBack: loopStyle({ ...shin, delay: -half }, going, frozen),
    armFront: loopStyle({ ...arm, delay: -half }, going, frozen),
    armBack: loopStyle(arm, going, frozen),
    bob:
      gait.hop > 0
        ? loopStyle(
            { name: lift(gait.hop), ms: half, alternate: true, easing: 'ease-in-out' },
            going,
            frozen,
          )
        : null,
    glow: loopStyle({ name: GLOW, ms: GLOW_MS, alternate: true }, going && !frozen),
    pulse: loopStyle({ name: BREATHE, ms: ARROW_MS, alternate: true }, live),
  };
}

export function useDeckTilt(degrees: number, animate: boolean): SharedValue<number> {
  const tilt = useSharedValue(degrees);
  useEffect(() => {
    tilt.value = animate ? withSpring(degrees, SPRING) : degrees;
  }, [degrees, animate, tilt]);
  return tilt;
}

export type TiltStyle = ReturnType<typeof useAnimatedStyle>;

export function useMachineStyle(tilt: SharedValue<number>): TiltStyle {
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${String(-tilt.value)}deg` }] }));
}

export function useWalkerStyle(tilt: SharedValue<number>, lean: number): TiltStyle {
  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${String(tilt.value * 1.5 + lean)}deg` }],
  }));
}
