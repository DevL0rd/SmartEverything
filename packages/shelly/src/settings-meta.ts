import { z } from 'zod';
import { SHELLY_AREA, SHELLY_RGB, SHELLY_TIME_WINDOW } from './primitives';
import type { ShellyPage } from './pages';

export type ShellySettingKind =
  | 'boolean'
  | 'number'
  | 'text'
  | 'enum'
  | 'strings'
  | 'string_map'
  | 'area'
  | 'rgb'
  | 'time_window'
  | 'stored_values';

export interface ShellySettingHints {
  readonly keywords?: readonly string[];
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly secret?: true;
  readonly nullable?: true;
  readonly options?: readonly string[];
  readonly labels?: Readonly<Record<string, string>>;
}
export interface ShellySettingMeta extends ShellySettingHints {
  readonly title: string;
  readonly page: ShellyPage;
  readonly group: string;
  readonly kind: ShellySettingKind;
}
export type Place = readonly [page: ShellyPage, group: string];
export type Leaf<T extends z.ZodType> = z.ZodOptional<z.ZodNullable<T>>;

function leaf<T extends z.ZodType>(schema: T, meta: ShellySettingMeta): Leaf<T> {
  return schema
    .nullable()
    .optional()
    .meta({ ...meta });
}
function describe(
  kind: ShellySettingKind,
  title: string,
  place: Place,
  hints: ShellySettingHints,
): ShellySettingMeta {
  return { title, page: place[0], group: place[1], kind, ...hints };
}

export function flag(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<z.ZodBoolean> {
  return leaf(z.boolean(), describe('boolean', title, place, hints));
}
export function num(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<z.ZodNumber> {
  return leaf(z.number(), describe('number', title, place, hints));
}
export function text(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<z.ZodString> {
  return leaf(z.string(), describe('text', title, place, hints));
}
export function choice(
  title: string,
  place: Place,
  options: readonly string[],
  hints: ShellySettingHints = {},
): Leaf<z.ZodString> {
  return leaf(z.string(), describe('enum', title, place, { ...hints, options }));
}
export function mixedChoice(
  title: string,
  place: Place,
  options: readonly string[],
  hints: ShellySettingHints = {},
): Leaf<z.ZodUnion<[z.ZodString, z.ZodNumber]>> {
  return leaf(
    z.union([z.string(), z.number()]),
    describe('enum', title, place, { ...hints, options }),
  );
}
export function strings(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<z.ZodArray<z.ZodString>> {
  return leaf(z.array(z.string()), describe('strings', title, place, hints));
}
export function stringMap(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<z.ZodRecord<z.ZodString, z.ZodString>> {
  return leaf(z.record(z.string(), z.string()), describe('string_map', title, place, hints));
}
export function colour(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<typeof SHELLY_RGB> {
  return leaf(SHELLY_RGB, describe('rgb', title, place, hints));
}
export function area(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<typeof SHELLY_AREA> {
  return leaf(SHELLY_AREA, describe('area', title, place, hints));
}
export function timeWindow(
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<typeof SHELLY_TIME_WINDOW> {
  return leaf(SHELLY_TIME_WINDOW, describe('time_window', title, place, hints));
}
export function stored<T extends z.ZodType>(
  schema: T,
  title: string,
  place: Place,
  hints: ShellySettingHints = {},
): Leaf<T> {
  return leaf(schema, describe('stored_values', title, place, hints));
}
