import type { ModelSpec } from '@smarteverything/domain';
import { fabric, furniture, type FurnitureInput } from '../../living/fc06/kit';

export {
  block,
  by,
  corners,
  fabric,
  legs,
  piece,
  rod,
  type Len,
  type Place,
  type Vec,
} from '../../living/fc06/kit';

type Override = NonNullable<ModelSpec['finishes']>[string][string];

type Finishes = NonNullable<ModelSpec['finishes']>;

export const OUTDOOR_FINISH_NAMES = ['teak', 'white', 'anthracite', 'sand'] as const;

export type OutdoorFinish = (typeof OUTDOOR_FINISH_NAMES)[number];

const FRAME_LOOKS: Readonly<Record<OutdoorFinish, Override>> = {
  teak: { finish: 'oak' },
  white: { finish: 'matte-white' },
  anthracite: { finish: 'graphite' },
  sand: { color: '#CDBFA6', roughness: 0.8 },
};

export const CUSHION_COLOURS: Readonly<Record<OutdoorFinish, string>> = {
  teak: '#CBBDA5',
  white: '#ECE8DF',
  anthracite: '#6A717B',
  sand: '#DCCFB6',
};

export const CANOPY_COLOURS: Readonly<Record<OutdoorFinish, string>> = {
  teak: '#B8643F',
  white: '#ECE8DF',
  anthracite: '#3D4147',
  sand: '#CDBFA6',
};

export interface OutdoorSlots {
  readonly frame: readonly string[];
  readonly cloth?: readonly string[];
  readonly palette?: Readonly<Record<OutdoorFinish, string>>;
}

export const OUTDOOR_FRAME = { finish: 'oak' } as const;

export const OUTDOOR_METAL = { finish: 'brushed-aluminium' } as const;

export function outdoorFinishes(slots: OutdoorSlots): Finishes {
  const palette = slots.palette ?? CUSHION_COLOURS;
  return Object.fromEntries(
    OUTDOOR_FINISH_NAMES.map((name) => [
      name,
      Object.fromEntries([
        ...slots.frame.map((slot): [string, Override] => [slot, FRAME_LOOKS[name]]),
        ...(slots.cloth ?? []).map((slot): [string, Override] => [slot, fabric(palette[name])]),
      ]),
    ]),
  );
}

export function outdoorSpec(input: FurnitureInput): ModelSpec {
  return { ...furniture(input), category: 'outdoor', states: { rest: {} } };
}

export type OutdoorInput = Omit<FurnitureInput, 'finishes' | 'defaultFinish'> & {
  readonly slots: OutdoorSlots;
};

export function outdoorItem(input: OutdoorInput): ModelSpec {
  const { slots, ...rest } = input;
  return outdoorSpec({ ...rest, finishes: outdoorFinishes(slots), defaultFinish: 'teak' });
}
