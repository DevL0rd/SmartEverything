import type { ModelSpec } from '@smarteverything/domain';
import { furniture, type FurnitureInput } from '../../living/fc06/kit';

type Override = NonNullable<ModelSpec['finishes']>[string][string];

export const KITCHEN_FINISH_NAMES = [
  'matte-white',
  'sage',
  'navy',
  'oak',
  'quartz',
  'marble',
  'stainless',
] as const;

export type KitchenFinish = (typeof KITCHEN_FINISH_NAMES)[number];

export const KITCHEN_LOOKS: Readonly<Record<KitchenFinish, Override>> = {
  'matte-white': { finish: 'matte-white', roughness: 0.5 },
  sage: { color: '#9CAF98', roughness: 0.5, clearcoat: 0.15 },
  navy: { color: '#2F4163', roughness: 0.48, clearcoat: 0.15 },
  oak: { finish: 'oak' },
  quartz: { color: '#D8D5CF', roughness: 0.32, clearcoat: 0.3 },
  marble: { finish: 'marble' },
  stainless: { finish: 'brushed-aluminium' },
};

const COATED: readonly KitchenFinish[] = ['matte-white', 'sage', 'navy', 'stainless'];

export interface KitchenSlots {
  readonly body: readonly string[];
  readonly coated?: readonly string[];
}

export function kitchenFinishes(slots: KitchenSlots): NonNullable<ModelSpec['finishes']> {
  return Object.fromEntries(
    KITCHEN_FINISH_NAMES.map((name) => [
      name,
      Object.fromEntries([
        ...slots.body.map((slot): [string, Override] => [slot, KITCHEN_LOOKS[name]]),
        ...(COATED.includes(name) ? (slots.coated ?? []) : []).map((slot): [string, Override] => [
          slot,
          KITCHEN_LOOKS[name],
        ]),
      ]),
    ]),
  );
}

export function kitchenItem(
  input: Omit<FurnitureInput, 'finishes'> & {
    readonly slots: KitchenSlots;
  },
): ModelSpec {
  const { slots, ...rest } = input;
  return {
    ...furniture({ ...rest, finishes: kitchenFinishes(slots) }),
    category: 'kitchen',
    states: { rest: {} },
  };
}
