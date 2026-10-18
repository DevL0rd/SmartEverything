import { describe, expect, it } from 'vitest';
import { FAMILY_PRIMARY_CARDS } from '../detail/primary-card-families';
import { FAMILY_TILE_PARTS } from '../tile/family-tile-parts';
import { FAMILY_FACES } from './family-faces';

describe('family registries for the light faces', () => {
  it('registers the light faces, tile parts and detail controls', () => {
    expect(FAMILY_FACES.light).toBeDefined();
    expect(FAMILY_TILE_PARTS.light?.bar).toBeDefined();
    expect(FAMILY_TILE_PARTS.light?.corner).toBeDefined();
    expect(FAMILY_PRIMARY_CARDS.light?.controls).toBeDefined();
  });

  it('registers the laundry progress bar as a tile part', () => {
    expect(FAMILY_TILE_PARTS.laundry?.bar).toBeDefined();
    expect(FAMILY_TILE_PARTS.laundry?.corner).toBeUndefined();
  });

  it('leaves other families to the generic faces', () => {
    expect(FAMILY_FACES.fan).toBeUndefined();
    expect(FAMILY_PRIMARY_CARDS.fan).toBeUndefined();
  });
});
