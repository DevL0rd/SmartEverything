import { css, type CSSKeyframesRule } from 'react-native-reanimated';
import { SPIN, loopStyle, sweep, type Loop } from '../../../design/loops';
import type { LaundryMotion } from '../types';
import { spinPeriod } from './shapes';

interface Step {
  readonly turn: number;
  readonly drop: number;
  readonly width: number;
  readonly height: number;
}

function step(frame: Step, unit: number): { transform: object[] } {
  return {
    transform: [
      { rotate: `${String(frame.turn)}deg` },
      { translateY: frame.drop * unit },
      { scaleX: frame.width },
      { scaleY: frame.height },
    ],
  };
}

const lifts = new Map<number, CSSKeyframesRule>();
const quickLifts = new Map<number, CSSKeyframesRule>();

function lift(px: number): CSSKeyframesRule {
  const known = lifts.get(px);
  if (known !== undefined) {
    return known;
  }
  const unit = px / 100;
  const made = css.keyframes({
    '0%': step({ turn: 0, drop: 0, width: 1, height: 1 }, unit),
    '36%': step({ turn: 68, drop: 0, width: 1, height: 1 }, unit),
    '58%': step({ turn: 6, drop: 1.5, width: 1.06, height: 0.9 }, unit),
    '68%': step({ turn: 0, drop: 0, width: 1, height: 1 }, unit),
    '100%': step({ turn: 0, drop: 0, width: 1, height: 1 }, unit),
  });
  lifts.set(px, made);
  return made;
}

function quickLift(px: number): CSSKeyframesRule {
  const known = quickLifts.get(px);
  if (known !== undefined) {
    return known;
  }
  const unit = px / 100;
  const made = css.keyframes({
    '0%': step({ turn: 0, drop: 0, width: 1, height: 1 }, unit),
    '6%': step({ turn: 60, drop: 0, width: 1, height: 1 }, unit),
    '11%': step({ turn: 4, drop: 1.5, width: 1.06, height: 0.9 }, unit),
    '14%': step({ turn: 0, drop: 0, width: 1, height: 1 }, unit),
    '100%': step({ turn: 0, drop: 0, width: 1, height: 1 }, unit),
  });
  quickLifts.set(px, made);
  return made;
}

const ANTI = css.keyframes({
  '0%': { transform: [{ rotate: '0deg' }] },
  '10%': { transform: [{ rotate: '90deg' }] },
  '20%': { transform: [{ rotate: '0deg' }] },
  '100%': { transform: [{ rotate: '0deg' }] },
});

const SETTLE = css.keyframes({
  from: { transform: [{ rotate: '-9deg' }] },
  to: { transform: [{ rotate: '9deg' }] },
});

export const SPARK = css.keyframes({
  '0%': { opacity: 0, transform: [{ scale: 0 }, { rotate: '0deg' }] },
  '50%': { opacity: 1, transform: [{ scale: 1.3 }, { rotate: '45deg' }] },
  '100%': { opacity: 0, transform: [{ scale: 0 }, { rotate: '90deg' }] },
});

const FLASH = css.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.3 },
  '100%': { opacity: 1 },
});

export function turnPeriod(rpm: number | null): number {
  return spinPeriod((rpm ?? 700) / 1400, 700, 260);
}

export function drumLoop(motion: LaundryMotion, rpm: number | null): Loop | null {
  switch (motion) {
    case 'tumble':
      return { name: SPIN, ms: 6000 };
    case 'slow':
      return { name: SPIN, ms: 5200 };
    case 'steam':
      return { name: SPIN, ms: 7200 };
    case 'spin':
      return { name: SPIN, ms: turnPeriod(rpm) };
    case 'weigh':
      return { name: sweep(50), ms: 2200, easing: 'ease-in-out', alternate: true };
    case 'anti':
      return { name: ANTI, ms: 6000, easing: 'ease-in-out' };
    case 'none':
      return null;
  }
}

export function clothLoop(motion: LaundryMotion, px: number, index: number): Loop | null {
  const delay = index * 1100;
  switch (motion) {
    case 'tumble':
      return { name: lift(px), ms: 2600, easing: 'ease-in-out', delay };
    case 'slow':
      return { name: lift(px), ms: 3800, easing: 'ease-in-out', delay };
    case 'steam':
      return { name: lift(px), ms: 4600, easing: 'ease-in-out', delay };
    case 'anti':
      return { name: quickLift(px), ms: 6000, easing: 'ease-in-out' };
    case 'weigh':
      return { name: SETTLE, ms: 1100, easing: 'ease-in-out', alternate: true, delay };
    case 'spin':
    case 'none':
      return null;
  }
}

export function pulseOf(on: boolean): ReturnType<typeof loopStyle> {
  return loopStyle({ name: FLASH, ms: 1200, easing: 'ease-in-out', times: 2 }, on);
}
