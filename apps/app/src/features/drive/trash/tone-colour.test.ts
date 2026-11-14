import { describe, expect, it, vi } from 'vitest';
import { isNative } from '../../../design/platform';
import { mixColours } from './tone-colour';

vi.mock('../../../design/platform', () => ({ isNative: vi.fn(() => true) }));

const WEB_COLOUR = /^var\(/;

describe('mixColours', () => {
  it('mixes the channels on native', () => {
    expect(mixColours('#ff0000', '#0000ff', 0.25)).toBe('rgb(64, 0, 191)');
  });

  it('gives the web a colour React Native Web keeps as a style value', () => {
    vi.mocked(isNative).mockReturnValueOnce(false);
    const mixed = mixColours('var(--a)', 'var(--b)', 0.55);
    expect(mixed).toMatch(WEB_COLOUR);
    expect(mixed).toContain('color-mix(in srgb, var(--a) 55%, var(--b))');
  });
});
