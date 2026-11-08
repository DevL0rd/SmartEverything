import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCENTS, type ThemeName } from './tokens';

const SURFACES = ['bg', 'surface-1', 'surface-2'] as const;

function blockOf(css: string, theme: ThemeName): string {
  const start = css.indexOf(`@variant ${theme} {`);
  const next = css.indexOf('@variant', start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

function tokenOf(theme: ThemeName, name: string): string {
  const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
  const match = new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i').exec(blockOf(css, theme));
  if (match?.[1] === undefined) throw new Error(`--color-${name} is not a hex colour in ${theme}`);
  return match[1];
}

function channel(hex: string, from: number): number {
  const value = parseInt(hex.slice(from, from + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

describe('accent text contrast', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`keeps every ${theme} accent at 4.5:1 or more on the page and the first two surfaces`, () => {
      const short = Object.entries(ACCENTS).flatMap(([name, inks]) =>
        SURFACES.flatMap((surface) => {
          const ratio = contrast(inks[theme].primary, tokenOf(theme, surface));
          return ratio < 4.5 ? [`${name} on ${surface}: ${ratio.toFixed(2)}`] : [];
        }),
      );
      expect(short).toEqual([]);
    });
  }

  it('starts the light page with the amber accent', () => {
    expect(tokenOf('light', 'primary').toLowerCase()).toBe(
      ACCENTS.amber.light.primary.toLowerCase(),
    );
  });
});
