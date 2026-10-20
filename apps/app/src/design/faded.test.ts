import { describe, expect, it, vi } from 'vitest';
import { UnreadableColourError, faded } from './faded';
import { isNative } from './platform';

vi.mock('./platform', () => ({ isNative: vi.fn(() => true) }));

describe('faded', () => {
  it('keeps the colour channels and scales the alpha', () => {
    expect(faded('#336699', 0.5)).toBe('rgba(51, 102, 153, 0.5)');
  });

  it('multiplies an alpha already in the colour', () => {
    expect(faded('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25098039215686274)');
  });

  it('throws naming the colour when it is not one React Native can read', () => {
    expect(() => faded('var(--x)', 0.5)).toThrow(UnreadableColourError);
  });

  it('mixes the colour with transparent on the web, where the colour may be a variable', () => {
    vi.mocked(isNative).mockReturnValueOnce(false);
    expect(faded('var(--x)', 0.35)).toBe('color-mix(in srgb, var(--x) 35%, transparent)');
  });
});
