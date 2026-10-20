import { ORALB_MODES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CYCLE_PX,
  ENVELOPE,
  MAX_ANGLE,
  amplitudeShare,
  angleOf,
  angleTag,
  angleText,
  drawnWidth,
  modeBlurb,
  oralbModeOf,
  restLine,
  scrollPx,
  waveLabel,
  wavePath,
} from './wave-model';

describe('the drive angle', () => {
  it('uses the live angle only while connected', () => {
    const frame = { angleDeg: 27.6, liveSource: 'link', mode: 'daily_clean' } as const;
    expect(angleOf(frame, true)).toEqual({ degrees: 27.6, source: 'live' });
    expect(angleOf(frame, false)).toEqual({ degrees: 28, source: 'nominal' });
  });

  it('knows the published nominal angle for three modes only', () => {
    const nominal = (mode: (typeof ORALB_MODES)[number]): number | null =>
      angleOf({ angleDeg: null, liveSource: 'advert', mode }, false).degrees;
    expect(nominal('daily_clean')).toBe(28);
    expect(nominal('sensitive')).toBe(20);
    expect(nominal('intense')).toBe(33);
    expect(nominal('whiten')).toBeNull();
    expect(angleOf({ angleDeg: null, liveSource: null, mode: null }, false).source).toBe('none');
  });

  it('reads the angle with its source tag and no number for the rest', () => {
    expect(angleText({ degrees: 28, source: 'nominal' })).toBe('28°');
    expect(angleTag({ degrees: 28, source: 'live' })).toBe('live');
    expect(angleTag({ degrees: 28, source: 'nominal' })).toBe('nominal');
    expect(angleText({ degrees: null, source: 'none' })).toBeNull();
    expect(angleTag({ degrees: null, source: 'none' })).toBeNull();
  });
});

describe('the amplitude', () => {
  it('is the angle over thirty five degrees', () => {
    expect(amplitudeShare({ degrees: MAX_ANGLE / 2, source: 'live' }, false)).toBeCloseTo(0.5);
    expect(amplitudeShare({ degrees: 80, source: 'live' }, false)).toBe(1);
  });

  it('drops when a connected handle eases off, and only then', () => {
    const live = amplitudeShare({ degrees: 28, source: 'live' }, false);
    expect(amplitudeShare({ degrees: 28, source: 'live' }, true)).toBeLessThan(live);
    expect(amplitudeShare({ degrees: 28, source: 'nominal' }, true)).toBe(
      amplitudeShare({ degrees: 28, source: 'nominal' }, false),
    );
  });

  it('draws a default wave when no angle is published', () => {
    expect(amplitudeShare({ degrees: null, source: 'none' }, false)).toBeGreaterThan(0);
  });
});

describe('the mode envelopes', () => {
  function heights(mode: (typeof ORALB_MODES)[number], cycles: number): number[] {
    const ys = wavePath(cycles * CYCLE_PX, 40, 1, mode)
      .split(' L')
      .map((part) => Number(part.replace('M', '').split(' ').at(-1)));
    return Array.from(
      { length: cycles },
      (_, cycle) =>
        Math.round(
          Math.max(...ys.slice(cycle * 12, cycle * 12 + 12).map((y) => Math.abs(y - 20))) * 10,
        ) / 10,
    );
  }

  it('has a mode for every envelope', () => {
    expect(new Set(Object.keys(ENVELOPE))).toEqual(new Set(ORALB_MODES));
    expect(new Set(Object.values(ENVELOPE))).toEqual(new Set(['steady', 'pulsed', 'alternating']));
  });

  it('keeps a steady mode at one height', () => {
    expect(new Set(heights('daily_clean', 4)).size).toBe(1);
  });

  it('rests every fourth cycle for gum care', () => {
    const [first, second, third, fourth] = heights('gum_care', 4);
    expect(fourth).toBeLessThan((first ?? 0) / 3);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('alternates high and low for whiten', () => {
    const [high, low, again] = heights('whiten', 3);
    expect(low).toBeLessThan(high ?? 0);
    expect(again).toBe(high);
  });

  it('scrolls by a whole envelope group so the loop is seamless', () => {
    expect(scrollPx('daily_clean')).toBe(CYCLE_PX);
    expect(scrollPx('gum_care')).toBe(4 * CYCLE_PX);
    expect(scrollPx('whiten')).toBe(2 * CYCLE_PX);
    expect(scrollPx(null)).toBe(CYCLE_PX);
    expect(drawnWidth(300, 'gum_care')).toBe(300 + 4 * CYCLE_PX);
  });
});

describe('the wave text', () => {
  it('writes one line at rest with the nominal angle', () => {
    expect(restLine('daily_clean', { degrees: 28, source: 'nominal' })).toBe(
      'Daily Clean · steady, 28° nominal',
    );
    expect(restLine('whiten', { degrees: null, source: 'none' })).toBe(
      'Whiten · alternating high and low',
    );
    expect(restLine(null, { degrees: null, source: 'none' })).toBe('Pick a mode on the handle');
    expect(modeBlurb('clean', { degrees: null, source: 'none' })).toBeNull();
    expect(oralbModeOf('clean')).toBeNull();
  });

  it('labels the live wave and says when the brush eases off', () => {
    const label = waveLabel('gum_care', { degrees: 22, source: 'live' }, true);
    expect(label).toContain('Gum Care drive, pulsed in groups of three, 22° live');
    expect(label).toContain('easing off');
  });
});
