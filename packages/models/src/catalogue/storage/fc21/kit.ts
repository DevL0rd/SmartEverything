import type { ModelSpec } from '@smarteverything/domain';
import { furniture, woodFinishes, type FurnitureInput } from '../../living/fc06/kit';

export {
  block,
  by,
  corners,
  fabric,
  ferrules,
  legs,
  piece,
  rod,
  woodOf,
  type Len,
  type Place,
  type Vec,
} from '../../living/fc06/kit';

type Override = NonNullable<ModelSpec['finishes']>[string][string];

export const STORAGE_FINISH_NAMES = ['oak', 'walnut', 'white-lacquer', 'graphite'] as const;

export const STORAGE_METAL = { finish: 'graphite' } as const;

export const STORAGE_ACCENT = { finish: 'brushed-aluminium' } as const;

export function storageFinishes(slots: readonly string[]): NonNullable<ModelSpec['finishes']> {
  return {
    ...woodFinishes(slots),
    graphite: Object.fromEntries(
      slots.map((slot): [string, Override] => [slot, { finish: 'graphite' }]),
    ),
  };
}

export type StorageInput = Omit<FurnitureInput, 'finishes' | 'defaultFinish'> & {
  readonly slots: readonly string[];
};

export function storageItem(input: StorageInput): ModelSpec {
  const { slots, ...rest } = input;
  return {
    ...furniture({ ...rest, finishes: storageFinishes(slots), defaultFinish: 'oak' }),
    category: 'storage',
    states: { rest: {} },
  };
}
