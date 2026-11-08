import type { ModelSpecChannel, ModelSpecCondition, ModelSpecPart } from '@smarteverything/domain';
import { part, type Place } from '../../helpers/geometry';

export const OK = '#5ED3CF';
export const WARM = '#F2B45E';
export const FAULT = '#F2564E';

const POSE = { type: 'pose', easeMs: 250 } as const;

type Table = Readonly<Record<string, number | string | boolean>>;

export function look(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Table],
  motion: ModelSpecChannel['motion'] = POSE,
): ModelSpecChannel {
  return { id, target, property, source, map: { type: 'enum', table }, motion, reduced: 'hold' };
}

export function pulse(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Table],
  [periodS, amplitude]: readonly [number, number],
): ModelSpecChannel {
  return look(id, [target, property], [source, table], { type: 'pulse', periodS, amplitude });
}

export function pivot(id: string, { at, ...options }: Place): ModelSpecPart {
  return part(id, { type: 'sphere', radius: 0.0005, segments: 6 }, 'accent', {
    ...options,
    transform: { position: [at[0], at[1], at[2]], ...options.transform },
  });
}

export function slide(
  id: string,
  target: string,
  [axis, out]: readonly ['x' | 'y' | 'z', [number, number]],
  easeMs = 1200,
): ModelSpecChannel {
  return {
    id,
    target,
    property: 'translate',
    axis,
    source: 'position',
    map: { type: 'linear', in: [0, 1], out, clamp: true },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

export const MOVING_WHEN: ModelSpecCondition = {
  anyOf: [
    { allOf: [{ signal: 'position', op: 'gt', value: 0 }] },
    { allOf: [{ signal: 'phase', op: 'ne', value: 'idle' }] },
  ],
};
