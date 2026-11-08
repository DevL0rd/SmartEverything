import type { ModelSpecChannel } from './spec';

const POSE = { type: 'pose', easeMs: 250 } as const;
const DECAY = { type: 'pose', easeMs: 450 } as const;
const OK = '#5ED3CF';
const LOW = '#F2B45E';
const ALARM = '#F2564E';

type Table = Readonly<Record<string, number | string | boolean>>;

export function enumChannel(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Table],
  motion: ModelSpecChannel['motion'] = POSE,
): ModelSpecChannel {
  return { id, target, property, source, map: { type: 'enum', table }, motion, reduced: 'hold' };
}

export function statusLedChannels(led: string): ModelSpecChannel[] {
  return [
    enumChannel(`${led}Ok`, [led, 'colour'], ['online', { true: OK }]),
    enumChannel(`${led}Low`, [led, 'colour'], ['batteryLow', { true: LOW }]),
    enumChannel(`${led}Alarm`, [led, 'colour'], ['alarm', { true: ALARM }]),
    enumChannel(`${led}Show`, [led, 'opacity'], ['online', { true: 1, false: 0 }]),
    enumChannel(`${led}Steady`, [led, 'emissive'], ['online', { true: 0.9, false: 0 }]),
    enumChannel(`${led}Warn`, [led, 'emissive'], ['batteryLow', { true: 1.2 }], {
      type: 'pulse',
      periodS: 2,
      amplitude: 0.5,
    }),
    enumChannel(`${led}Alert`, [led, 'emissive'], ['alarm', { true: 1.6 }], {
      type: 'pulse',
      periodS: 0.8,
      amplitude: 0.8,
    }),
  ];
}

export function emitterChannels(
  emitter: string,
  lit?: readonly [string, Table],
): ModelSpecChannel[] {
  return [
    ...(lit === undefined ? [] : [enumChannel(`${emitter}Lit`, [emitter, 'emissive'], lit)]),
    enumChannel(`${emitter}Off`, [emitter, 'emissive'], ['power', { false: 0 }], DECAY),
    enumChannel(`${emitter}Offline`, [emitter, 'emissive'], ['online', { false: 0 }], DECAY),
  ];
}
