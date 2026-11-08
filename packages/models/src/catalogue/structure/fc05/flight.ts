import type { ModelSpec, ModelSpecPart } from '@smarteverything/domain';
import { finishSet, tokenMaterial, type FinishSet } from '../../../helpers/finishes';
import { pathBuilder, type PathCommand } from '../../../helpers/path';
import { by, type Len, type Vec } from '../fc01/look';

export const RUN = 0.26;
export const RISE = 0.2;
export const NOSING = 0.03;
export const TREAD_THICKNESS = 0.04;
export const RISERS = 14;
export const NOMINAL_HEIGHT = RISERS * RISE;
export const WAIST = 0.22;
export const SIDE_BEVEL = 0.006;

export const STAIR_MATERIALS: ModelSpec['materials'] = {
  stair: tokenMaterial('matte-white', { roughness: 0.7 }),
  tread: tokenMaterial('oak'),
};

export const STAIR_FINISHES: FinishSet = finishSet(
  {
    plasterWhite: {},
    warmWhite: { stair: { finish: 'warm-white', roughness: 0.66 } },
    concrete: {
      stair: { color: '#A6A49F', roughness: 0.9 },
      tread: { color: '#8C8A85', roughness: 0.86 },
    },
    brick: {
      stair: { color: '#9A5540', roughness: 0.92 },
      tread: { finish: 'walnut' },
    },
    timber: { stair: { finish: 'oak' }, tread: { finish: 'walnut' } },
  },
  'plasterWhite',
);

export function flightPath(steps: number, hanging: boolean): PathCommand[] {
  const floorStart = (WAIST * RUN) / RISE;
  const start = hanging ? -WAIST : 0;
  let path = pathBuilder(0, start).line(0, RISE).line(RUN, RISE);
  for (let step = 1; step < steps; step += 1) {
    path = path.line(step * RUN, (step + 1) * RISE).line((step + 1) * RUN, (step + 1) * RISE);
  }
  path = path.line(steps * RUN, steps * RISE - WAIST);
  path = hanging ? path.line(0, -WAIST) : path.line(floorStart, 0).line(0, 0);
  return [...path.build()];
}

export interface FlightPlacement {
  readonly id: string;
  readonly steps: number;
  readonly hanging: boolean;
  readonly at: Vec;
  readonly turn: number;
}

export function flightBody(place: FlightPlacement): ModelSpecPart {
  return {
    id: place.id,
    geometry: {
      type: 'extrude',
      path: flightPath(place.steps, place.hanging),
      depth: by('width', 1, -2 * SIDE_BEVEL),
      bevel: SIDE_BEVEL,
    },
    material: 'stair',
    transform: {
      position: [place.at[0], place.at[1], place.at[2]],
      rotation: [0, place.turn, 0],
      scale: [1, by('height', 1 / NOMINAL_HEIGHT), 1],
    },
    contact: true,
  };
}

export interface TreadPlacement {
  readonly id: string;
  readonly at: Vec;
  readonly turned: boolean;
}

export function tread(place: TreadPlacement): ModelSpecPart {
  const run = RUN + NOSING;
  const across = by('width');
  return {
    id: place.id,
    geometry: {
      type: 'roundedBox',
      width: place.turned ? run : across,
      height: TREAD_THICKNESS,
      depth: place.turned ? across : run,
      radius: 0.006,
      segments: 3,
    },
    material: 'tread',
    transform: { position: [place.at[0], place.at[1], place.at[2]] },
    minLod: 1,
  };
}

export function levelY(level: number): Len {
  return by('height', level / RISERS, -0.01);
}
