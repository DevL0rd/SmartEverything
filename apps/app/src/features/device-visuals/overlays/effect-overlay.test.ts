import { describe, expect, it } from 'vitest';
import { sample } from '../model/signals-of-fixtures';
import { effectProps, effectShows } from './effect-overlay';
import { EFFECT_LOOKS, type EffectPlan } from './registry';
import { viewBoxOf } from './screen-overlay';

const RECT = { x: 24, y: 0, width: 48, height: 24 };

function plan(effect: EffectPlan['effect']): EffectPlan {
  return { kind: 'effect', id: effect, effect, look: EFFECT_LOOKS[effect], rect: RECT };
}

const MOVING = { size: 'card', tone: 'active', moving: true, reduced: false } as const;

describe('effect overlay', () => {
  it('centres the emitter and the haze blob on the anchor', () => {
    const props = effectProps(plan('mist'), 96, '#88ccff', { ...MOVING, state: sample({}) });
    expect(props.box).toEqual({ x: 25, y: 0, w: 50, h: 25 });
    expect(props.emitter).toMatchObject({ x: 50, y: 12.5, spread: 25, size: 50 });
    expect(props.blob).toEqual({ cx: 50, cy: 12.5, rx: 25, ry: 12.5 });
    expect(props.running).toBe(true);
  });

  it('fills water to the water level and shows it while idle', () => {
    const idle = { ...MOVING, moving: false, state: sample({ waterLevel: 0.4 }) };
    const props = effectProps(plan('water'), 96, '#88ccff', idle);
    expect(props.level).toBeCloseTo(0.4);
    expect(effectShows(plan('water'), props)).toBe(true);
  });

  it('stops a looping effect when the device is idle or motion is reduced', () => {
    const idle = { ...MOVING, moving: false, state: sample({}) };
    expect(effectShows(plan('steam'), effectProps(plan('steam'), 96, '#fff', idle))).toBe(false);
  });

  it('frames a screen part by its own drawing region', () => {
    expect(viewBoxOf({ x: 13, y: 88, w: 14, h: 33 })).toBe('13 88 14 33');
  });
});
