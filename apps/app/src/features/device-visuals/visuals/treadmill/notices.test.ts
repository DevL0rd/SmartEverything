import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TreadmillFacts } from '../../types';

vi.mock('react-native-reanimated', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const View = (props: { children?: ReactNode }): ReactNode =>
    createElement('i', null, props.children);
  return { ...original, default: { View }, View };
});

const { PaletteContext, COLOUR_VARIABLE } = await import('../../../../design/colour-roles');
const { SILVER } = await import('./palette');
const { Notices } = await import('./notices');

const PALETTE = new Proxy(COLOUR_VARIABLE, { get: (): string => '#336699' });

function facts(link: TreadmillFacts['link']): TreadmillFacts {
  return {
    belt: 'idle',
    link,
    speedKmh: 0,
    zone: 'walk',
    timeS: 0,
    distanceM: 0,
    fault: null,
    childLock: false,
    cadence: null,
    inclineGrade: 0,
    inclineLabel: null,
    inclineMoving: null,
    heartZone: null,
  };
}

function notices(link: TreadmillFacts['link'], px: number): string {
  return renderToStaticMarkup(
    createElement(
      PaletteContext,
      { value: PALETTE },
      createElement(Notices, {
        px,
        facts: facts(link),
        silver: SILVER.dark,
        tilt: 0,
        live: false,
      }),
    ),
  );
}

describe('the lost link notice', () => {
  it('draws no dashed frame around the treadmill at any size', () => {
    for (const px of [48, 96, 220]) {
      for (const link of ['lost', 'not_linked'] as const) {
        const markup = notices(link, px);
        expect(markup).not.toContain('stroke-dasharray');
        expect(markup).toContain('r="6"');
      }
    }
  });

  it('shows the same small badge for a lost and a missing link and nothing when linked', () => {
    expect(notices('lost', 96)).toBe(notices('not_linked', 96));
    expect(notices('linked', 96)).toBe('');
  });
});
