import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ORALB_MODE_COLOUR } from '../plugins/toothbrush/model/oralb-mode-colour';
import { NODE_CATEGORY_COLOUR, TYPE_COLOUR } from './node-colours';

type Theme = 'dark' | 'light';

function blockOf(css: string, theme: Theme): string {
  const start = css.indexOf(`@variant ${theme} {`);
  const next = css.indexOf('@variant', start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

function tokenOf(theme: Theme, name: string): string {
  const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
  const match = new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i').exec(blockOf(css, theme));
  if (match?.[1] === undefined) {
    throw new Error(`--color-${name} is not a hex colour in the ${theme} theme`);
  }
  return match[1];
}

function strokeOf(theme: Theme, name: string): string {
  const css = readFileSync(new URL('../../global.css', import.meta.url), 'utf8');
  const pattern = new RegExp(`--color-${name}: (#[0-9a-f]{6});`, 'i');
  const match = pattern.exec(blockOf(css, theme)) ?? pattern.exec(css);
  if (match?.[1] === undefined) {
    throw new Error(`--color-${name} is not a hex colour for the ${theme} theme`);
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
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const SURFACES = ['surface-1', 'surface-2', 'surface-3'] as const;
const TEXT_SURFACES = ['surface-1', 'surface-2'] as const;
const THEMES: readonly Theme[] = ['dark', 'light'];

describe('chart colours', () => {
  it.each(THEMES)('keep the blue and the violet line at 3:1 on every %s surface', (theme) => {
    for (const surface of SURFACES) {
      for (const line of ['viz-blue', 'viz-violet']) {
        expect(contrast(tokenOf(theme, line), tokenOf(theme, surface))).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps the dark magenta line at 3:1 on every dark surface', () => {
    for (const surface of SURFACES) {
      expect(
        contrast(tokenOf('dark', 'viz-magenta'), tokenOf('dark', surface)),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the light magenta line above 2.6:1 on the card surface, where end labels carry the series', () => {
    expect(
      contrast(tokenOf('light', 'viz-magenta'), tokenOf('light', 'surface-1')),
    ).toBeGreaterThan(2.6);
  });
});

describe('Oral-B mode colours', () => {
  const ROLES = Object.values(ORALB_MODE_COLOUR);

  it('gives the nine modes nine different colours', () => {
    expect(new Set(ROLES).size).toBe(9);
  });

  it.each(THEMES)('keep every mode colour at 3:1 on every %s surface', (theme) => {
    for (const surface of SURFACES) {
      for (const role of ROLES) {
        expect(
          contrast(tokenOf(theme, role), tokenOf(theme, surface)),
          `${role} on ${surface} in ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(THEMES)(
    'keep the pressure colours of the Oral-B ring at 3:1 on every %s surface',
    (theme) => {
      for (const surface of SURFACES) {
        for (const role of ['critical', 'positive', 'on-surface-variant']) {
          expect(
            contrast(tokenOf(theme, role), tokenOf(theme, surface)),
            `${role} on ${surface} in ${theme}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    },
  );
});

describe('tone text', () => {
  it.each(THEMES)('keeps positive and warning words at 4.5:1 on %s cards and pages', (theme) => {
    for (const surface of TEXT_SURFACES) {
      for (const tone of ['positive', 'warning']) {
        expect(contrast(tokenOf(theme, tone), tokenOf(theme, surface))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('control track', () => {
  it.each(THEMES)(
    'keeps the unfilled track and control edge at 3:1 on every %s surface',
    (theme) => {
      for (const surface of SURFACES) {
        expect(contrast(tokenOf(theme, 'track'), tokenOf(theme, surface))).toBeGreaterThanOrEqual(
          3,
        );
      }
    },
  );
});

describe('white temperature track', () => {
  it('keeps the neutral middle of the track at 3:1 against the thumb edge in dark and the thumb in light', () => {
    expect(
      contrast(tokenOf('dark', 'temp-neutral'), tokenOf('dark', 'surface-1')),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrast(tokenOf('light', 'temp-neutral'), tokenOf('light', 'on-surface')),
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)('has a neutral middle that is light in %s, never the card surface', (theme) => {
    expect(luminance(tokenOf(theme, 'temp-neutral'))).toBeGreaterThan(0.8);
  });
});

describe('air band and humidity strokes', () => {
  const STROKES = [
    'air-good',
    'air-fair',
    'air-moderate',
    'air-poor',
    'air-bad',
    'air-severe',
    'humidity',
    'temp-warm',
  ];

  it.each(THEMES)(
    'keep every air band, humidity and warm line at 3:1 on every %s surface',
    (theme) => {
      for (const surface of SURFACES) {
        for (const stroke of STROKES) {
          expect(
            contrast(strokeOf(theme, stroke), tokenOf(theme, surface)),
            `${stroke} on ${surface} in ${theme}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    },
  );
});

describe('canvas category bars and type dots', () => {
  const CARD_SURFACES = ['surface-1', 'surface-2'] as const;
  const CATEGORY_ROLES = [...new Set(Object.values(NODE_CATEGORY_COLOUR))];
  const TYPE_ROLES = [...new Set(Object.values(TYPE_COLOUR))].filter((role) => role !== 'outline');

  it.each(THEMES)('keeps every category bar colour at 3:1 on %s cards and frames', (theme) => {
    for (const surface of CARD_SURFACES) {
      for (const role of CATEGORY_ROLES) {
        expect(
          contrast(tokenOf(theme, role), tokenOf(theme, surface)),
          `${role} on ${surface} in ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each(THEMES)('keeps every port dot and value wire colour at 3:1 on %s cards', (theme) => {
    for (const surface of CARD_SURFACES) {
      for (const role of TYPE_ROLES) {
        expect(
          contrast(tokenOf(theme, role), tokenOf(theme, surface)),
          `${role} on ${surface} in ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
