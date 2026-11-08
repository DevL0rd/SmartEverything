import { describe, expect, it } from 'vitest';
import { MapScreen, PlaceScreen } from './index';
import { placeIdOf } from './place-screen';

describe('places screens', () => {
  it('load as components', () => {
    expect(typeof MapScreen).toBe('function');
    expect(typeof PlaceScreen).toBe('function');
  });

  it('read only a positive whole place id from the route', () => {
    expect(placeIdOf('7')).toBe(7);
    expect(placeIdOf('0')).toBeNull();
    expect(placeIdOf('lisbon')).toBeNull();
    expect(placeIdOf(undefined)).toBeNull();
  });
});
