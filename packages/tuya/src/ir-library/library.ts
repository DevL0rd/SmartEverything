import { IR_LIBRARY_KINDS, IR_LIBRARY_SOURCES } from '@smarteverything/domain';
import { z } from 'zod';

const CODE = z.string().min(1);

const TEMPERATURE_COMMANDS = z.record(z.string().min(1), CODE);

export const LIBRARY_CLIMATE = z.strictObject({
  kind: z.literal('climate'),
  minTemperature: z.number(),
  maxTemperature: z.number(),
  precision: z.number().positive(),
  off: CODE,
  commands: z.record(
    z.string().min(1),
    z.record(z.string().min(1), z.union([CODE, TEMPERATURE_COMMANDS])),
  ),
});

export const LIBRARY_KEYS = z.strictObject({
  kind: z.literal('keys'),
  keys: z.record(z.string().min(1), CODE),
});

export const LIBRARY_MODEL = z.discriminatedUnion('kind', [LIBRARY_CLIMATE, LIBRARY_KEYS]);

export type LibraryClimate = z.output<typeof LIBRARY_CLIMATE>;

export type LibraryKeys = z.output<typeof LIBRARY_KEYS>;

export type LibraryModel = z.output<typeof LIBRARY_MODEL>;

export const LIBRARY_ENTRY = z.strictObject({
  id: z.string().min(1),
  source: z.enum(IR_LIBRARY_SOURCES),
  kind: z.enum(IR_LIBRARY_KINDS),
  category: z.string().min(1),
  brand: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
  offset: z.int().min(0),
  length: z.int().positive(),
});

export type LibraryEntry = z.output<typeof LIBRARY_ENTRY>;

export const LIBRARY_INDEX = z.strictObject({
  sources: z.array(
    z.strictObject({
      source: z.enum(IR_LIBRARY_SOURCES),
      licence: z.string().min(1),
      commit: z.string().min(1),
    }),
  ),
  entries: z.array(LIBRARY_ENTRY),
});

export type LibraryIndex = z.output<typeof LIBRARY_INDEX>;
