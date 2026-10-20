import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ColourRole } from '../../../design/tokens';
import {
  BATTERY_COLOUR,
  FILL_COLOUR,
  GOAL_COLOUR,
  PACE_COLOUR,
  SOURCE_COLOUR,
  UV_COLOUR,
  WATER_COLOUR,
} from './bottle-colours';

type Theme = 'dark' | 'light';

const THEMES: readonly Theme[] = ['dark', 'light'];

const css = readFileSync(new URL('../../../../global.css', import.meta.url), 'utf8');

function blockOf(theme: Theme): string {
  const start = css.indexOf(`@variant ${theme} {`);
  const next = css.indexOf('@variant', start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

function tokenOf(theme: Theme, role: string): string {
  const match = new RegExp(`--color-${role}: (#[0-9a-f]{6});`, 'i').exec(blockOf(theme));
  if (match?.[1] === undefined) {
    throw new Error(`--color-${role} is not a hex colour in the ${theme} theme`);
  }
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
  const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function hueOf(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(
    (from) => parseInt(hex.slice(from, from + 2), 16) / 255,
  );
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  if (high === low) {
    return 0;
  }
  const spread = high - low;
  const sector =
    high === r ? ((g - b) / spread) % 6 : high === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return (sector * 60 + 360) % 360;
}

function hueGap(a: string, b: string): number {
  const gap = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(gap, 360 - gap);
}

const SURFACES = ['surface-1', 'surface-2'] as const;

const SERIES: readonly (readonly [string, ColourRole])[] = [
  ['bottle source', SOURCE_COLOUR.bottle],
  ['logged source', SOURCE_COLOUR.logged],
  ['other source', SOURCE_COLOUR.other],
  ['normal clean', UV_COLOUR.normal],
  ['adventure clean', UV_COLOUR.adventure],
  ['self clean', UV_COLOUR.maintenance],
  ['water', WATER_COLOUR],
  ['fill', FILL_COLOUR],
  ['pace', PACE_COLOUR],
  ['goal', GOAL_COLOUR],
  ['battery', BATTERY_COLOUR],
];

describe('bottle chart colours', () => {
  it.each(THEMES)('keep every series at 3:1 on the card and page surfaces in %s', (theme) => {
    for (const [, role] of SERIES) {
      for (const surface of SURFACES) {
        expect(contrast(tokenOf(theme, role), tokenOf(theme, surface))).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(THEMES)('give the bottle and logged sources different hues in %s', (theme) => {
    const bottle = tokenOf(theme, SOURCE_COLOUR.bottle);
    const logged = tokenOf(theme, SOURCE_COLOUR.logged);
    expect(hueGap(bottle, logged)).toBeGreaterThan(60);
  });

  it.each(THEMES)('give normal and adventure cleans different hues in %s', (theme) => {
    const normal = tokenOf(theme, UV_COLOUR.normal);
    const adventure = tokenOf(theme, UV_COLOUR.adventure);
    expect(hueGap(normal, adventure)).toBeGreaterThan(60);
  });

  it.each(THEMES)('keep the other source apart from the bottle and logged ones in %s', (theme) => {
    const other = tokenOf(theme, SOURCE_COLOUR.other);
    for (const colour of [SOURCE_COLOUR.bottle, SOURCE_COLOUR.logged]) {
      expect(Math.abs(luminance(other) - luminance(tokenOf(theme, colour)))).toBeGreaterThan(0.02);
    }
  });
});
