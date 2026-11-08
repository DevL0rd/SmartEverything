import type { ModelSpecChannel, ModelSpecCondition } from '@smarteverything/domain';
import { emitterChannels, enumChannel } from '@smarteverything/domain';

const ALARM = '#F2564E';

export const ALARM_SHOT_WHEN: ModelSpecCondition = {
  anyOf: [{ allOf: [{ signal: 'alarm', op: 'eq', value: true }] }],
};

export function alarmRing(ring: string): ModelSpecChannel[] {
  return [
    enumChannel(`${ring}Tint`, [ring, 'colour'], ['alarm', { true: ALARM }]),
    enumChannel(`${ring}Show`, [ring, 'opacity'], ['alarm', { true: 1, false: 0 }]),
    enumChannel(`${ring}Pulse`, [ring, 'emissive'], ['alarm', { true: 1.6 }], {
      type: 'pulse',
      periodS: 0.8,
      amplitude: 0.8,
    }),
    enumChannel(`${ring}Gone`, [ring, 'opacity'], ['online', { false: 0 }]),
    ...emitterChannels(ring),
  ];
}
