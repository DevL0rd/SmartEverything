import type { ModelSpecChannel, ModelSpecCondition, ModelSpecPart } from '@smarteverything/domain';
import { enumChannel, emitterChannels } from '@smarteverything/domain';
import { part, placed, type Place } from '../../helpers/geometry';

export const OK = '#5ED3CF';
export const LOW = '#F2B45E';
export const FAULT = '#F2564E';
export const SIGNAL = '#6FB7FF';

const TINT = { type: 'pose', easeMs: 250 } as const;
const RAMP = { type: 'pose', easeMs: 300 } as const;

export function lampChannels(target: string, glow: readonly [number, number]): ModelSpecChannel[] {
  return [
    {
      id: `${target}Warmth`,
      target,
      property: 'colour',
      source: 'colourTemperature',
      map: { type: 'colour', from: 'temperature', kelvin: [2200, 6500] },
      motion: TINT,
      reduced: 'hold',
    },
    {
      id: `${target}Tint`,
      target,
      property: 'colour',
      source: 'colour',
      map: { type: 'colour', from: 'signal' },
      motion: TINT,
      reduced: 'hold',
    },
    {
      id: `${target}Level`,
      target,
      property: 'emissive',
      source: 'brightness',
      map: { type: 'linear', in: [0, 1], out: [glow[0], glow[1]], clamp: true },
      motion: RAMP,
      reduced: 'hold',
    },
    ...emitterChannels(target),
  ];
}

export function powerLed(led: string, lit = 1.1): ModelSpecChannel[] {
  return [
    enumChannel(`${led}Show`, [led, 'opacity'], ['power', { true: 1, false: 0 }]),
    enumChannel(`${led}Hide`, [led, 'opacity'], ['online', { false: 0 }]),
    ...emitterChannels(led, ['power', { true: lit }]),
  ];
}

export function hinge(id: string, place: Place): ModelSpecPart {
  return part(id, { type: 'sphere', radius: 0.0004, segments: 6 }, 'accent', placed(place));
}

export function whenPhase(...phases: readonly string[]): ModelSpecCondition {
  return {
    anyOf: phases.map((value) => ({ allOf: [{ signal: 'phase', op: 'eq' as const, value }] })),
  };
}
