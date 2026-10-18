import type { BandMetric, BodyComposition } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import { decimal } from '../../../format/number';

export type RingKey = 'fat' | 'muscle' | 'water' | 'bone';

interface RingSpec {
  readonly key: RingKey;
  readonly label: string;
  readonly colour: ColourRole;
  readonly band: BandMetric;
  readonly share: (composition: BodyComposition) => number;
  readonly full: number;
  readonly text: (composition: BodyComposition) => string;
}

const SPECS: readonly RingSpec[] = [
  {
    key: 'fat',
    label: 'Body fat',
    colour: 'viz-3',
    band: 'body_fat_percent',
    share: (c) => c.body_fat_percent,
    full: 50,
    text: (c) => `${decimal(c.body_fat_percent, 0)} %`,
  },
  {
    key: 'muscle',
    label: 'Muscle',
    colour: 'viz-1',
    band: 'muscle_mass_kg',
    share: (c) => c.muscle_percent,
    full: 80,
    text: (c) => `${decimal(c.muscle_mass_kg, 0)} kg`,
  },
  {
    key: 'water',
    label: 'Water',
    colour: 'viz-2',
    band: 'water_percent',
    share: (c) => c.water_percent,
    full: 80,
    text: (c) => `${decimal(c.water_percent, 0)} %`,
  },
  {
    key: 'bone',
    label: 'Bone',
    colour: 'viz-1',
    band: 'bone_mass_kg',
    share: (c) => c.bone_percent,
    full: 8,
    text: (c) => `${decimal(c.bone_mass_kg, 1)} kg`,
  },
];

export interface RingFact {
  readonly key: RingKey;
  readonly label: string;
  readonly colour: ColourRole;
  readonly band: BandMetric;
  readonly fill: number;
  readonly text: string;
  readonly spoken: string;
}

export const CARD_RING_KEYS: readonly RingKey[] = ['fat', 'muscle', 'water'];

export function ringsOf(
  composition: BodyComposition,
  keys: readonly RingKey[] = SPECS.map((spec) => spec.key),
): readonly RingFact[] {
  return SPECS.filter((spec) => keys.includes(spec.key)).map((spec) => {
    const text = spec.text(composition);
    return {
      key: spec.key,
      label: spec.label,
      colour: spec.colour,
      band: spec.band,
      fill: Math.min(1, Math.max(0, spec.share(composition) / spec.full)),
      text,
      spoken: `${spec.label} ${text}`,
    };
  });
}
