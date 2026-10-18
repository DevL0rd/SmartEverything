import { describe, expect, it } from 'vitest';
import { mutedByDefault } from './sound-wish';

describe('camera sound by default', () => {
  it('keeps every preview silent even when the sound preference is on', () => {
    expect(mutedByDefault({ viewer: false, mutedPreference: false })).toBe(true);
    expect(mutedByDefault({ viewer: false, mutedPreference: true })).toBe(true);
  });

  it('lets the opened viewer follow the sound preference', () => {
    expect(mutedByDefault({ viewer: true, mutedPreference: false })).toBe(false);
    expect(mutedByDefault({ viewer: true, mutedPreference: true })).toBe(true);
  });
});
