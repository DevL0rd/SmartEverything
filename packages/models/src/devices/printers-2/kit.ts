import type { ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
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

export function disc(
  id: string,
  [radius, height, bevel]: readonly [number, number, number],
  material: string,
  { at, ...options }: Place,
): ModelSpecPart {
  return part(
    id,
    {
      type: 'cylinder',
      height,
      topRadius: radius,
      bottomRadius: radius * 1.02,
      bevel,
      segments: 48,
    },
    material,
    {
      ...options,
      transform: { position: [at[0], at[1], at[2]], rotation: [90, 0, 0], ...options.transform },
    },
  );
}

export const HEAT = '#F29A4E';
export const READOUT = '#5FA8C8';

export function pivot(id: string, { at, ...options }: Place): ModelSpecPart {
  return part(id, { type: 'sphere', radius: 0.0005, segments: 6 }, 'accent', {
    ...options,
    transform: { position: [at[0], at[1], at[2]], ...options.transform },
  });
}
