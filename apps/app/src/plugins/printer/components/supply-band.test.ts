import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TANK_BODY, tankEdge, contrastBetween } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { liveOf } from '../model/fixtures';

const theme = vi.hoisted(() => ({ value: 'dark' }));

vi.mock('uniwind', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUniwind: (): { theme: string } => ({ theme: theme.value }),
}));

const { SupplyBars, tanksFit } = await import('./supply-band');

function barsMarkup(name: 'dark' | 'light'): string {
  theme.value = name;
  return renderToStaticMarkup(createElement(SupplyBars, { live: liveOf() }));
}

describe('the supply bars on the printer card', () => {
  it('draws every bar on the tank body so its edge stands out from the track', () => {
    for (const name of ['dark', 'light'] as const) {
      const markup = barsMarkup(name).toLowerCase();
      expect(markup).toContain(TANK_BODY[name]);
      for (const supply of liveOf().supplies) {
        const edge = tankEdge(supply.detail.consumed ? supply.detail.colour : '#7a7468', name);
        expect(contrastBetween(edge, TANK_BODY[name])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps black ink visible against the dark track', () => {
    expect(contrastBetween(tankEdge('#000000', 'dark'), TANK_BODY.dark)).toBeGreaterThanOrEqual(3);
  });
});

describe('whether the tanks fit in one row', () => {
  it('fits four tanks exactly in their width and gaps', () => {
    expect(tanksFit(4 * 80 + 3 * 8, 4)).toBe(true);
    expect(tanksFit(4 * 80 + 3 * 8 - 1, 4)).toBe(false);
  });

  it('needs room for all eight tanks before showing them', () => {
    expect(tanksFit(600, 8)).toBe(false);
    expect(tanksFit(8 * 80 + 7 * 8, 8)).toBe(true);
  });
});
