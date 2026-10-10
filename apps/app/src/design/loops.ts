import {
  css,
  type CSSAnimationTimingFunction,
  type CSSKeyframesRule,
} from 'react-native-reanimated';

export const SPIN = css.keyframes({
  from: { transform: [{ rotate: '0deg' }] },
  to: { transform: [{ rotate: '360deg' }] },
});

export const BREATHE = css.keyframes({
  from: { opacity: 0.45 },
  to: { opacity: 0.95 },
});

export const GLOW = css.keyframes({
  from: { opacity: 0.55, transform: [{ scale: 0.94 }] },
  to: { opacity: 1, transform: [{ scale: 1.04 }] },
});

export const BLINK = css.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.15 },
  '100%': { opacity: 1 },
});

export const RING = css.keyframes({
  from: { opacity: 0.8, transform: [{ scale: 0.82 }] },
  to: { opacity: 0, transform: [{ scale: 1.32 }] },
});

const rises = new Map<number, CSSKeyframesRule>();
const drifts = new Map<number, CSSKeyframesRule>();
const sweeps = new Map<number, CSSKeyframesRule>();
const sways = new Map<number, CSSKeyframesRule>();

function cached(
  store: Map<number, CSSKeyframesRule>,
  key: number,
  make: () => CSSKeyframesRule,
): CSSKeyframesRule {
  const known = store.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = make();
  store.set(key, made);
  return made;
}

export function rise(distance: number): CSSKeyframesRule {
  const travel = Math.round(distance);
  return cached(rises, travel, () =>
    css.keyframes({
      '0%': { opacity: 0, transform: [{ translateY: 0 }, { scale: 0.55 }] },
      '25%': { opacity: 0.9, transform: [{ translateY: -travel * 0.25 }, { scale: 0.8 }] },
      '100%': { opacity: 0, transform: [{ translateY: -travel }, { scale: 1.3 }] },
    }),
  );
}

export function drift(distance: number): CSSKeyframesRule {
  const travel = Math.round(distance);
  return cached(drifts, travel, () =>
    css.keyframes({
      from: { transform: [{ translateY: 0 }] },
      to: { transform: [{ translateY: -travel }] },
    }),
  );
}

export function sweep(degrees: number): CSSKeyframesRule {
  const half = Math.round(degrees / 2);
  return cached(sweeps, half, () =>
    css.keyframes({
      from: { transform: [{ rotate: `${String(-half)}deg` }] },
      to: { transform: [{ rotate: `${String(half)}deg` }] },
    }),
  );
}

export function sway(distance: number): CSSKeyframesRule {
  const travel = Math.round(distance);
  return cached(sways, travel, () =>
    css.keyframes({
      from: { transform: [{ translateX: 0 }] },
      to: { transform: [{ translateX: -travel }] },
    }),
  );
}

export interface Loop {
  readonly name: CSSKeyframesRule;
  readonly ms: number;
  readonly easing?: CSSAnimationTimingFunction;
  readonly delay?: number;
  readonly alternate?: boolean;
  readonly times?: number;
}

export interface LoopStyle {
  readonly animationName: CSSKeyframesRule;
  readonly animationDuration: number;
  readonly animationTimingFunction: CSSAnimationTimingFunction;
  readonly animationDelay: number;
  readonly animationIterationCount: number | 'infinite';
  readonly animationDirection: 'alternate' | 'normal';
  readonly animationFillMode: 'none' | 'both';
}

export function loopStyle(loop: Loop, running: boolean): LoopStyle | null {
  if (!running) {
    return null;
  }
  return {
    animationName: loop.name,
    animationDuration: loop.ms,
    animationTimingFunction: loop.easing ?? 'linear',
    animationDelay: loop.delay ?? 0,
    animationIterationCount: loop.times ?? 'infinite',
    animationDirection: loop.alternate === true ? 'alternate' : 'normal',
    animationFillMode: loop.times === undefined ? 'none' : 'both',
  };
}

export const EASE_IN_OUT: CSSAnimationTimingFunction = 'ease-in-out';

export interface TransitionStyle {
  readonly transitionProperty: 'opacity' | 'transform' | 'height';
  readonly transitionDuration: number;
  readonly transitionTimingFunction: CSSAnimationTimingFunction;
}

function transitionOf(property: TransitionStyle['transitionProperty']): TransitionStyle {
  return {
    transitionProperty: property,
    transitionDuration: 250,
    transitionTimingFunction: 'ease-out',
  };
}

const TRANSITIONS: Readonly<Record<TransitionStyle['transitionProperty'], TransitionStyle>> = {
  opacity: transitionOf('opacity'),
  transform: transitionOf('transform'),
  height: transitionOf('height'),
};

export function eased(
  property: TransitionStyle['transitionProperty'],
  reduced: boolean,
): TransitionStyle | null {
  return reduced ? null : TRANSITIONS[property];
}
