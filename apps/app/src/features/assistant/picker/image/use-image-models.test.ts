import { IMAGE_ENDPOINT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { favouriteKey, matchesQuery, sameChoice, takesReferences } from './use-image-models';

const FLUX = IMAGE_ENDPOINT.parse({
  model: 'black-forest-labs/flux-3-image',
  name: 'FLUX.3',
  provider_tag: 'black-forest-labs',
  parameters: { input_references: { type: 'range', min: 0, max: 8 } },
  supports_streaming: false,
  pricing: [
    { billable: 'output_image', unit: 'image', cost_usd: 0.04, variant: '1k' },
    { billable: 'output_image', unit: 'image', cost_usd: 0.08, variant: '2k' },
  ],
});

const RECRAFT = IMAGE_ENDPOINT.parse({
  model: 'recraft/recraft-v4.1-flash',
  name: 'Recraft V4.1 Flash',
  provider_tag: 'recraft',
  parameters: {},
  supports_streaming: false,
  pricing: [{ billable: 'output_image', unit: 'image', cost_usd: 0.1 }],
});

describe('image model helpers', () => {
  it('finds a model by any word of its name, id or provider', () => {
    expect(matchesQuery(FLUX, 'flux')).toBe(true);
    expect(matchesQuery(FLUX, 'forest black')).toBe(true);
    expect(matchesQuery(FLUX, 'recraft')).toBe(false);
    expect(matchesQuery(FLUX, '')).toBe(true);
  });

  it('knows which endpoints take reference images', () => {
    expect(takesReferences(FLUX)).toBe(true);
    expect(takesReferences(RECRAFT)).toBe(false);
  });

  it('matches a saved choice by model and provider together', () => {
    expect(sameChoice(FLUX, { model: FLUX.model, provider_tag: 'black-forest-labs' })).toBe(true);
    expect(sameChoice(FLUX, { model: FLUX.model, provider_tag: 'other' })).toBe(false);
    expect(sameChoice(FLUX, null)).toBe(false);
    expect(favouriteKey(FLUX)).toBe('black-forest-labs/flux-3-image|black-forest-labs');
  });
});
