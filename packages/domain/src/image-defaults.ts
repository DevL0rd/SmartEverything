import { z } from 'zod';
import type { ImageModelChoice } from './assistant';
import type { ImageEndpoint, ImageParameter } from './image-operations';

export const IMAGE_RESULTS_MAX = 4;

export const IMAGE_COUNT = z.int().min(1).max(IMAGE_RESULTS_MAX);

export const IMAGE_DEFAULT_OPTIONS = z.strictObject({
  aspect_ratio: z.string().max(40).optional(),
  resolution: z.string().max(40).optional(),
  quality: z.string().max(40).optional(),
  size: z.string().max(40).optional(),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  background: z.string().max(40).optional(),
  output_compression: z.int().min(0).max(100).optional(),
  seed: z.int().optional(),
  n: IMAGE_COUNT.optional(),
});
export type ImageDefaultOptions = z.infer<typeof IMAGE_DEFAULT_OPTIONS>;

export const IMAGE_DEFAULTS = z.record(z.string().max(400), IMAGE_DEFAULT_OPTIONS);
export type ImageDefaults = z.infer<typeof IMAGE_DEFAULTS>;

export function imageKey(choice: Pick<ImageModelChoice, 'model' | 'provider_tag'>): string {
  return `${choice.model}|${choice.provider_tag}`;
}

const STANDARD_TIER = 1000;

const QUALITY_RANK: Readonly<Record<string, number>> = {
  ultra: 5,
  hd: 4,
  high: 3,
  standard: 2,
  medium: 2,
  low: 1,
  auto: 0,
};

function enumValues(endpoint: ImageEndpoint, key: string): readonly (string | number)[] {
  const descriptor = endpoint.parameters[key];
  return descriptor?.type === 'enum' ? descriptor.values : [];
}

function best<T extends string | number>(
  values: readonly T[],
  rank: (value: T) => number | null,
): T | undefined {
  let chosen: T | undefined;
  let top = -Infinity;
  for (const value of values) {
    const score = rank(value);
    if (score !== null && score > top) {
      top = score;
      chosen = value;
    }
  }
  return chosen;
}

function tierRank(value: string | number): number | null {
  const match = /^(\d+(?:\.\d+)?)(k?)$/iu.exec(String(value).trim());
  if (match === null) return null;
  return Number(match[1]) * (match[2] === '' ? 1 : 1000);
}

function standardResolution(values: readonly (string | number)[]): string | number | undefined {
  const standard = best(values, (value) => {
    const rank = tierRank(value);
    return rank !== null && rank >= STANDARD_TIER ? -rank : null;
  });
  return standard ?? best(values, tierRank);
}

export function platformImageDefaults(endpoint: ImageEndpoint): ImageDefaultOptions {
  const quality = best(
    enumValues(endpoint, 'quality').map(String),
    (value) => QUALITY_RANK[value] ?? null,
  );
  const resolution = standardResolution(enumValues(endpoint, 'resolution'));
  return {
    ...(quality === undefined ? {} : { quality }),
    ...(resolution === undefined ? {} : { resolution: String(resolution) }),
  };
}

function admits(descriptor: ImageParameter | undefined, value: string | number | boolean): boolean {
  if (descriptor === undefined) return false;
  if (descriptor.type === 'boolean') return typeof value === 'boolean';
  if (descriptor.type === 'enum')
    return typeof value !== 'boolean' && descriptor.values.includes(value);
  return typeof value === 'number' && value >= descriptor.min && value <= descriptor.max;
}

function pruned(entry: ImageDefaultOptions, endpoint: ImageEndpoint): ImageDefaultOptions {
  const kept = Object.entries(entry).filter(
    ([key, value]) => value !== undefined && admits(endpoint.parameters[key], value),
  );
  return IMAGE_DEFAULT_OPTIONS.parse(Object.fromEntries(kept));
}

export function savedImageDefaults(
  defaults: ImageDefaults,
  endpoint: ImageEndpoint,
): ImageDefaultOptions {
  const entry = defaults[imageKey(endpoint)];
  return entry === undefined ? {} : pruned(entry, endpoint);
}

export function effectiveImageOptions(
  endpoint: ImageEndpoint,
  defaults: ImageDefaults,
  explicit: ImageDefaultOptions = {},
): ImageDefaultOptions {
  return {
    ...platformImageDefaults(endpoint),
    ...savedImageDefaults(defaults, endpoint),
    ...explicit,
  };
}
