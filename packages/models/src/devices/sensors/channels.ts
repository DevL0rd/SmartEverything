import type { ModelSpecChannel, ModelSpecCondition } from '@smarteverything/domain';
import { enumChannel } from '@smarteverything/domain';

const PRESENT = '#5ED3CF';
const MOVING = '#8EF0D6';
const ALARM = '#F2564E';
const LOW = '#F2B45E';

export function ledChannels(led: string): ModelSpecChannel[] {
  return [
    enumChannel(`${led}Presence`, [led, 'colour'], ['presence', { true: PRESENT }]),
    enumChannel(`${led}Motion`, [led, 'colour'], ['motion', { true: MOVING }]),
    enumChannel(`${led}Low`, [led, 'colour'], ['batteryLow', { true: LOW }]),
    enumChannel(`${led}Alarm`, [led, 'colour'], ['alarm', { true: ALARM }]),
    enumChannel(`${led}Show`, [led, 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel(`${led}Flash`, [led, 'emissive'], ['motion', { true: 1.4 }], {
      type: 'pulse',
      periodS: 1,
      amplitude: 0.6,
    }),
    enumChannel(`${led}Steady`, [led, 'emissive'], ['presence', { true: 1 }]),
    enumChannel(`${led}Warn`, [led, 'emissive'], ['batteryLow', { true: 1.2 }], {
      type: 'pulse',
      periodS: 2,
      amplitude: 0.5,
    }),
    enumChannel(`${led}Alert`, [led, 'emissive'], ['alarm', { true: 1.6 }], {
      type: 'pulse',
      periodS: 1,
      amplitude: 0.7,
    }),
  ];
}

export function lensChannels(lens: string): ModelSpecChannel[] {
  return [
    enumChannel(`${lens}Presence`, [lens, 'colour'], ['presence', { true: PRESENT }]),
    enumChannel(`${lens}Motion`, [lens, 'colour'], ['motion', { true: MOVING }]),
    enumChannel(`${lens}Clear`, [lens, 'emissive'], ['presence', { false: 0.1, true: 0.6 }]),
    enumChannel(`${lens}Glow`, [lens, 'emissive'], ['motion', { true: 1.4 }], {
      type: 'pulse',
      periodS: 1,
      amplitude: 0.5,
    }),
    enumChannel(`${lens}Offline`, [lens, 'emissive'], ['online', { false: 0 }], {
      type: 'pose',
      easeMs: 450,
    }),
  ];
}

export const SENSE_SHOT_WHEN: ModelSpecCondition = {
  anyOf: [
    { allOf: [{ signal: 'presence', op: 'eq', value: true }] },
    { allOf: [{ signal: 'motion', op: 'eq', value: true }] },
  ],
};
