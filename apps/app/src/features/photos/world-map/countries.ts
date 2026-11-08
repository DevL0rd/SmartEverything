import { z } from 'zod';
import outlines from '../../../../assets/maps/countries-110m.json';
import { boxMeets, type BoxEdges, type MapBox } from './projection';

export const NATURAL_EARTH_ATTRIBUTION = 'Map: Natural Earth, public domain.';

const GRID = z.number().int().min(0).max(3600);

const COUNTRY_SHAPES = z
  .array(
    z.strictObject({
      code: z.string().regex(/^[A-Z]{2,3}$/),
      d: z.string().regex(/^(M[0-9 -]+l[0-9 -]+z)+$/),
      box: z.tuple([GRID, GRID, GRID, GRID]).readonly(),
    }),
  )
  .readonly();

export interface CountryShape {
  readonly code: string;
  readonly d: string;
  readonly box: BoxEdges;
}

export interface CountryCount {
  readonly countryCode: string;
  readonly count: number;
}

let parsed: readonly CountryShape[] | null = null;

export function countryShapes(): readonly CountryShape[] {
  parsed ??= COUNTRY_SHAPES.parse(outlines);
  return parsed;
}

export function countriesIn(view: MapBox): readonly CountryShape[] {
  return countryShapes().filter((shape) => boxMeets(shape.box, view));
}

const SHADE_FLOOR = 0.2;
const SHADE_SPAN = 0.6;

export function countryShades(counts: readonly CountryCount[]): ReadonlyMap<string, number> {
  const most = counts.reduce((top, entry) => Math.max(top, entry.count), 0);
  const shades = new Map<string, number>();
  for (const entry of counts) {
    if (entry.count > 0) {
      shades.set(entry.countryCode, SHADE_FLOOR + (SHADE_SPAN * entry.count) / most);
    }
  }
  return shades;
}
