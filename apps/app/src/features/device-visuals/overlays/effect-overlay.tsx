import type { ReactNode } from 'react';
import { useColour } from '../../../design/colour';
import {
  effectRuns,
  unitBox,
  type EffectEmitter,
  type EffectPart,
  type EffectPartProps,
  type EffectPlan,
  type OverlayContext,
} from './registry';

const PUFF_TRAVEL = 1.4;

const DOT_SHARE = 0.2;

const SPRAY: Readonly<Record<EffectPart, { readonly count: number; readonly ms: number }>> = {
  puffs: { count: 3, ms: 3800 },
  dots: { count: 6, ms: 2800 },
  haze: { count: 1, ms: 3800 },
  water: { count: 1, ms: 4200 },
};

function levelOf(context: OverlayContext): number {
  const { state } = context;
  return Math.min(1, Math.max(0, state.waterLevel ?? state.level));
}

function emitterOf(part: EffectPart, box: EffectPartProps['box'], level: number): EffectEmitter {
  const span = Math.max(box.w, box.h);
  const spray = SPRAY[part];
  return {
    x: box.x + box.w / 2,
    y: box.y + box.h / 2,
    spread: box.w / 2,
    travel: span * PUFF_TRAVEL,
    size: part === 'dots' ? span * DOT_SHARE : span,
    count: spray.count,
    ms: spray.ms * (1 - level / 3),
  };
}

export function effectProps(
  plan: EffectPlan,
  px: number,
  colour: string,
  context: OverlayContext,
): EffectPartProps {
  const box = unitBox(plan.rect, px);
  const level = levelOf(context);
  return {
    box,
    px,
    colour,
    running: effectRuns(context),
    level,
    radius: Math.min(box.w, box.h) / 4,
    emitter: emitterOf(plan.look.part, box, level),
    blob: { cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 },
  };
}

export function effectShows(plan: EffectPlan, props: EffectPartProps): boolean {
  return plan.look.part === 'water' ? props.level > 0 : props.running;
}

export function EffectOverlay({
  plan,
  Part,
  context,
  px,
}: {
  readonly plan: EffectPlan;
  readonly Part: (props: EffectPartProps) => ReactNode;
  readonly context: OverlayContext;
  readonly px: number;
}): ReactNode {
  const colour = useColour(plan.look.colour);
  const props = effectProps(plan, px, colour, context);
  return effectShows(plan, props) ? <Part {...props} /> : null;
}
