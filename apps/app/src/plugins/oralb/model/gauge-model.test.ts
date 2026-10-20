import { describe, expect, it } from 'vitest';
import {
  FORCE_MAX,
  bandAt,
  bandsOf,
  gaugeLabel,
  meterKindOf,
  meterLabel,
  pressureBandOf,
  shareOf,
} from './gauge-model';

describe('the force bands', () => {
  it('draws three learning thirds before bands are learned', () => {
    const layout = bandsOf(null);
    expect(layout.learned).toBe(false);
    expect(layout.spans.map((span) => span.band)).toEqual(['light', 'good', 'hard']);
    expect(layout.spans[1]?.from).toBeCloseTo(1 / 3);
  });

  it('maps learned bands onto the raw force range', () => {
    const layout = bandsOf({ lightBelow: 0.7, highAbove: 2.1, samples: 12 });
    expect(layout.learned).toBe(true);
    expect(layout.spans[0]?.to).toBeCloseTo(0.7 / FORCE_MAX);
    expect(layout.spans[2]?.from).toBeCloseTo(2.1 / FORCE_MAX);
    expect(bandAt(layout, 0.3)).toBe('light');
    expect(bandAt(layout, 1.2)).toBe('good');
    expect(bandAt(layout, 3)).toBe('hard');
  });

  it('treats crossed bands as not learned', () => {
    expect(bandsOf({ lightBelow: 2, highAbove: 1, samples: 3 }).learned).toBe(false);
  });

  it('clamps the needle to the range', () => {
    expect(shareOf(-1)).toBe(0);
    expect(shareOf(99)).toBe(1);
    expect(shareOf(FORCE_MAX / 2)).toBeCloseTo(0.5);
  });
});

describe('which meter is drawn', () => {
  const force = { pressure: 'force' } as const;
  const state = { pressure: 'state' } as const;

  it('draws the gauge for force on a connected protocol 8 handle', () => {
    expect(meterKindOf(force, { force: 1.2, liveSource: 'link' })).toBe('gauge');
  });

  it('draws the state meter for protocol 6 or a connection without force', () => {
    expect(meterKindOf(state, { force: null, liveSource: 'link' })).toBe('state');
    expect(meterKindOf(force, { force: null, liveSource: 'link' })).toBe('state');
  });

  it('draws the advert meter with light dimmed for broadcast only', () => {
    expect(meterKindOf(force, { force: null, liveSource: 'advert' })).toBe('advert');
    expect(meterLabel('advert', 'good')).toContain('Light pressure needs a connection');
  });
});

describe('the pressure word', () => {
  const learned = bandsOf({ lightBelow: 0.7, highAbove: 2.1, samples: 8 });

  it('follows the force when there is one, the state otherwise', () => {
    expect(pressureBandOf({ pressure: 'optimal', force: 2.8 }, learned)).toBe('hard');
    expect(pressureBandOf({ pressure: 'optimal', force: null }, learned)).toBe('good');
    expect(pressureBandOf({ pressure: 'no_contact', force: null }, learned)).toBe('light');
    expect(pressureBandOf({ pressure: null, force: null }, learned)).toBeNull();
  });

  it('names the band and the learning state without units', () => {
    expect(gaugeLabel('hard', true)).toBe('Pressure gauge: Too hard');
    expect(gaugeLabel('good', false)).toContain('still learning');
    expect(gaugeLabel('good', true)).not.toMatch(/newton|gram| N\b/i);
  });
});
