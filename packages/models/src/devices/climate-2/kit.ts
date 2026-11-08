import type { ModelSpecChannel, ModelSpecCondition } from '@smarteverything/domain';
import { emitterChannels } from '@smarteverything/domain';
import { FAULT, leaf, look, whenAll } from '../energy/kit';

export const RUNNING: ModelSpecCondition = whenAll(
  leaf('power', 'eq', true),
  leaf('speed', 'gt', 0),
);

export const SLEEP_DIM = 0.15;

export function sleepDim(target: string): ModelSpecChannel {
  return look(`${target}Sleep`, [target, 'emissive'], ['mode', { sleep: SLEEP_DIM }], 450);
}

export function lit(
  target: string,
  [show, emissive]: readonly [number, number],
  dims: readonly ModelSpecChannel[] = [],
): ModelSpecChannel[] {
  return [
    look(`${target}Show`, [target, 'opacity'], ['power', { true: show, false: 0 }]),
    look(`${target}Glow`, [target, 'emissive'], ['power', { true: emissive }]),
    look(`${target}Fault`, [target, 'colour'], ['fault', { true: FAULT }], 250),
    look(`${target}Hide`, [target, 'opacity'], ['online', { false: 0 }], 450),
    ...dims,
    ...emitterChannels(target),
  ];
}
