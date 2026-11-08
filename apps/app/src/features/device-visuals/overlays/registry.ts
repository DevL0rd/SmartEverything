import type { ModelSpec } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { ColourRole } from '../../../design/tokens';
import type { Box } from '../parts/frame';
import type { VisualSize, VisualState } from '../types';
import { Haze } from '../parts/haze';
import { Dots, Puffs } from '../parts/particles';
import { Water } from '../parts/water';
import type { BakeAnchor, BakeRect } from '../../models';

export const SCREEN_PART_NAMES = [
  'phone',
  'printer',
  'io',
  'microwave',
  'treadmill',
  'laundry',
  'readout',
] as const;

export type ScreenPart = (typeof SCREEN_PART_NAMES)[number];

export const EFFECT_PART_NAMES = ['puffs', 'dots', 'haze', 'water'] as const;

export type EffectPart = (typeof EFFECT_PART_NAMES)[number];

export type EffectName = Extract<
  NonNullable<ModelSpec['anchors']>[number],
  { kind: 'effect' }
>['effect'];

export type OverlayTone = 'active' | 'idle' | 'offline';

export interface OverlayContext {
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly tone: OverlayTone;
  readonly moving: boolean;
  readonly reduced: boolean;
}

export interface ScreenFaceProps extends OverlayContext {
  readonly box: Box;
  readonly px: number;
}

export interface ScreenRenderer {
  readonly region: (state: VisualState) => Box | null;
  readonly Face: (props: ScreenFaceProps) => ReactNode;
}

export interface EffectEmitter {
  readonly x: number;
  readonly y: number;
  readonly spread: number;
  readonly travel: number;
  readonly size: number;
  readonly count: number;
  readonly ms: number;
}

export interface EffectBlob {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

export interface EffectPartProps {
  readonly box: Box;
  readonly px: number;
  readonly colour: string;
  readonly running: boolean;
  readonly level: number;
  readonly radius: number;
  readonly emitter: EffectEmitter;
  readonly blob: EffectBlob;
}

export type EffectRenderer = (props: EffectPartProps) => ReactNode;

export const EFFECT_PARTS: Readonly<Record<EffectPart, EffectRenderer>> = {
  puffs: Puffs,
  dots: Dots,
  haze: Haze,
  water: Water,
};

export interface EffectLook {
  readonly part: EffectPart;
  readonly colour: ColourRole;
}

export interface ScreenPlan {
  readonly kind: 'screen';
  readonly id: string;
  readonly part: ScreenPart;
  readonly rect: BakeRect;
}

export interface EffectPlan {
  readonly kind: 'effect';
  readonly id: string;
  readonly effect: EffectName;
  readonly look: EffectLook;
  readonly rect: BakeRect;
}

export type OverlayPlan = ScreenPlan | EffectPlan;

export const EFFECT_LOOKS: Readonly<Record<EffectName, EffectLook>> = {
  mist: { part: 'puffs', colour: 'humidity' },
  steam: { part: 'puffs', colour: 'humidity' },
  spray: { part: 'puffs', colour: 'humidity' },
  airflow: { part: 'haze', colour: 'humidity' },
  ripple: { part: 'haze', colour: 'humidity' },
  water: { part: 'water', colour: 'humidity' },
  sparkle: { part: 'dots', colour: 'viz-violet' },
  scan: { part: 'dots', colour: 'viz-2' },
};

export function screenPartOf(state: VisualState): ScreenPart | null {
  if (state.phone !== undefined) return 'phone';
  if (state.printer !== undefined) return 'printer';
  if (state.microwave !== undefined) return 'microwave';
  if (state.treadmill !== undefined) return 'treadmill';
  if (state.laundry !== undefined) return 'laundry';
  const brush = state.toothbrush;
  if (brush !== undefined) return brush.brand === 'oralb' && brush.display ? 'io' : null;
  return state.reading === null ? null : 'readout';
}

function effectOf(spec: ModelSpec, id: string): EffectName | null {
  for (const anchor of spec.anchors ?? []) {
    if (anchor.kind === 'effect' && anchor.id === id) return anchor.effect;
  }
  return null;
}

function planOf(spec: ModelSpec, anchor: BakeAnchor, state: VisualState): OverlayPlan | null {
  if (anchor.kind === 'screen') {
    const part = screenPartOf(state);
    return part === null ? null : { kind: 'screen', id: anchor.id, part, rect: anchor.rect };
  }
  if (anchor.kind !== 'effect') return null;
  const effect = effectOf(spec, anchor.id);
  if (effect === null) return null;
  return { kind: 'effect', id: anchor.id, effect, look: EFFECT_LOOKS[effect], rect: anchor.rect };
}

export function overlayPlans(
  spec: ModelSpec,
  anchors: readonly BakeAnchor[],
  state: VisualState,
): OverlayPlan[] {
  const plans: OverlayPlan[] = [];
  for (const anchor of anchors) {
    const plan = planOf(spec, anchor, state);
    if (plan !== null) plans.push(plan);
  }
  return plans;
}

export function unitBox(rect: BakeRect, px: number): Box {
  const unit = (value: number): number => (value / px) * 100;
  return { x: unit(rect.x), y: unit(rect.y), w: unit(rect.width), h: unit(rect.height) };
}

export function effectRuns(context: OverlayContext): boolean {
  return context.moving && context.state.online && context.state.power !== 'off';
}
