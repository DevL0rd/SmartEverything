import { describe, expect, it } from 'vitest';
import { IMAGE_ENDPOINT, type ImageEndpoint } from '../src/image-operations';
import {
  effectiveImageOptions,
  IMAGE_DEFAULT_OPTIONS,
  IMAGE_DEFAULTS,
  imageKey,
  type ImageDefaults,
  platformImageDefaults,
  savedImageDefaults,
} from '../src/image-defaults';

function endpoint(parameters: Readonly<Record<string, unknown>>): ImageEndpoint {
  return IMAGE_ENDPOINT.parse({
    model: 'vendor/model',
    name: 'Model',
    provider_tag: 'vendor',
    parameters,
    supports_streaming: false,
    pricing: [],
  });
}

const KEY = imageKey({ model: 'vendor/model', provider_tag: 'vendor' });

const QUALITY_AND_RESOLUTION = endpoint({
  quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
  resolution: { type: 'enum', values: ['512', '1K', '1.5K', '4K', '2K'] },
});

describe('the platform defaults of an image endpoint', () => {
  it('picks the highest ranked quality and the standard resolution', () => {
    expect(platformImageDefaults(QUALITY_AND_RESOLUTION)).toStrictEqual({
      quality: 'high',
      resolution: '1K',
    });
  });

  it('takes the smallest resolution of 1K or more, or the largest below it when there is none', () => {
    const large = endpoint({ resolution: { type: 'enum', values: ['4K', '2K'] } });
    expect(platformImageDefaults(large)).toStrictEqual({ resolution: '2K' });
    const small = endpoint({ resolution: { type: 'enum', values: ['256', '512'] } });
    expect(platformImageDefaults(small)).toStrictEqual({ resolution: '512' });
  });

  it('offers nothing for tiers and words it cannot rank', () => {
    const unranked = endpoint({
      quality: { type: 'enum', values: ['fancy', 'plain'] },
      resolution: { type: 'enum', values: ['wide', 'tall'] },
    });
    expect(platformImageDefaults(unranked)).toStrictEqual({});
  });
});

describe('the effective options of an image endpoint', () => {
  it('returns the platform values when nothing is saved', () => {
    expect(effectiveImageOptions(QUALITY_AND_RESOLUTION, {})).toStrictEqual({
      quality: 'high',
      resolution: '1K',
    });
  });

  it('uses a saved value in place of the platform one and keeps the rest', () => {
    const found = endpoint({
      quality: { type: 'enum', values: ['low', 'high'] },
      resolution: { type: 'enum', values: ['1K', '2K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
    });
    const defaults = { [KEY]: { quality: 'low', aspect_ratio: '16:9' } };
    expect(effectiveImageOptions(found, defaults)).toStrictEqual({
      quality: 'low',
      resolution: '1K',
      aspect_ratio: '16:9',
    });
  });

  it('lets an explicitly sent option win over the saved default', () => {
    const found = endpoint({
      quality: { type: 'enum', values: ['low', 'hd'] },
      seed: { type: 'range', min: 0, max: 10 },
    });
    const defaults = { [KEY]: { quality: 'low', seed: 3 } };
    expect(effectiveImageOptions(found, defaults, { quality: 'hd', seed: 7 })).toStrictEqual({
      quality: 'hd',
      seed: 7,
    });
  });

  it('drops saved keys and values the endpoint does not offer', () => {
    const found = endpoint({
      quality: { type: 'enum', values: ['low', 'high'] },
      n: { type: 'range', min: 1, max: 4 },
    });
    const defaults: ImageDefaults = {
      [KEY]: {
        quality: 'ultra',
        n: 9,
        output_format: 'png',
        background: 'transparent',
        seed: 5,
      },
    };
    expect(savedImageDefaults(defaults, found)).toStrictEqual({});
    expect(effectiveImageOptions(found, defaults)).toStrictEqual({ quality: 'high' });
  });

  it('reads only the entry of the endpoint that asks', () => {
    const found = endpoint({ quality: { type: 'enum', values: ['low', 'high'] } });
    const other = { 'other/model|other': { quality: 'low' } };
    expect(effectiveImageOptions(found, other)).toStrictEqual({ quality: 'high' });
  });
});

describe('the saved image defaults', () => {
  it('keys each choice by its model and provider', () => {
    expect(KEY).toBe('vendor/model|vendor');
    expect(imageKey({ model: 'vendor/other', provider_tag: 'vendor' })).not.toBe(KEY);
  });

  it('keeps every option optional and refuses one the AI never saves', () => {
    expect(IMAGE_DEFAULT_OPTIONS.parse({})).toStrictEqual({});
    expect(IMAGE_DEFAULT_OPTIONS.safeParse({ stream: true }).success).toBe(false);
    expect(IMAGE_DEFAULT_OPTIONS.safeParse({ aspect_ratio: '16:9', n: 2 }).success).toBe(true);
    expect(IMAGE_DEFAULTS.parse({ [KEY]: { quality: 'high' } })).toStrictEqual({
      [KEY]: { quality: 'high' },
    });
  });
});
