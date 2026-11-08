import type { ModelSpecChannel, ModelSpecCondition } from '@smarteverything/domain';
import { enumChannel } from '@smarteverything/domain';

const PLAYING = '#5ED3CF';
const IDLE = '#F4EBDD';
const STANDBY = '#E0533F';
const FAULT = '#F2564E';

export const PLAY_SHOT_WHEN: ModelSpecCondition = {
  anyOf: [
    {
      allOf: [
        { signal: 'power', op: 'eq', value: true },
        { signal: 'playing', op: 'eq', value: true },
      ],
    },
  ],
};

export function ledChannels(led: string): ModelSpecChannel[] {
  return [
    enumChannel(`${led}Show`, [led, 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel(`${led}Tint`, [led, 'colour'], ['power', { true: IDLE }]),
    enumChannel(`${led}Glow`, [led, 'emissive'], ['power', { true: 0.8 }]),
    enumChannel(`${led}Play`, [led, 'colour'], ['playing', { true: PLAYING }]),
    enumChannel(`${led}Beat`, [led, 'emissive'], ['playing', { true: 1.5 }], {
      type: 'pulse',
      periodS: 1,
      amplitude: 0.5,
    }),
    {
      id: `${led}Loud`,
      target: led,
      property: 'emissive',
      source: 'volume',
      map: { type: 'linear', in: [0, 0.05], out: [0.25, 1.5], clamp: true },
      motion: { type: 'pulse', periodS: 1, amplitude: 0.2 },
      reduced: 'hold',
    },
    enumChannel(`${led}Rest`, [led, 'emissive'], ['playing', { false: 0.8 }]),
    enumChannel(`${led}Sleep`, [led, 'colour'], ['power', { false: STANDBY }]),
    enumChannel(`${led}Standby`, [led, 'emissive'], ['power', { false: 0.35 }]),
    enumChannel(`${led}Fault`, [led, 'colour'], ['fault', { true: FAULT }]),
    enumChannel(`${led}Alarm`, [led, 'emissive'], ['fault', { true: 1.6 }], {
      type: 'pulse',
      periodS: 0.6,
      amplitude: 0.8,
    }),
    enumChannel(`${led}Offline`, [led, 'emissive'], ['online', { false: 0 }]),
  ];
}

export function driverChannels(driver: string, depth: number): ModelSpecChannel[] {
  return [
    {
      id: `${driver}Thump`,
      target: driver,
      property: 'scale',
      axis: 'z',
      source: 'playing',
      map: { type: 'enum', table: { true: 1 + depth } },
      motion: { type: 'pulse', periodS: 0.5, amplitude: depth },
      reduced: 'hold',
    },
  ];
}
