import { z } from 'zod';

export const UNKNOWN = 'unknown';

export function knownOrUnknown<const V extends readonly string[]>(
  known: V,
): z.ZodPipe<z.ZodString, z.ZodTransform<V[number] | typeof UNKNOWN, string>> {
  return z.string().transform((value) => known.find((candidate) => candidate === value) ?? UNKNOWN);
}

export const EPOCH_MS = z.number().min(0).max(4e15);

export function isoOf(epochMs: number | undefined): string | null {
  return epochMs === undefined ? null : new Date(epochMs).toISOString();
}
