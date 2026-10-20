import { ORALB_SETTINGS, type OralbProbe, type OralbSettings } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  HEAD_DUE_RANGE,
  LIVE_CHOICES,
  QUARTER_RANGE,
  anyWritePassed,
  canTest,
  daysBarOf,
  gateOf,
  passedCount,
  probeStatus,
  quarterTarget,
  ringSwatches,
} from './settings-model';

const NOW = '2026-10-18T07:00:00.000Z';

function settings(
  probes: Partial<Record<OralbProbe, { passedAt: string; firmware: number }>> = {},
): OralbSettings {
  return ORALB_SETTINGS.parse({ probes });
}

describe('handle test status', () => {
  it('is passed only for the firmware it ran on', () => {
    const value = settings({ pacer_write: { passedAt: NOW, firmware: 82 } });
    expect(probeStatus(value, 'pacer_write', 82)).toBe('passed');
    expect(probeStatus(value, 'pacer_write', 83)).toBe('stale');
    expect(probeStatus(value, 'ring_write', 82)).toBe('none');
  });

  it('keeps a failed test failed', () => {
    const value = ORALB_SETTINGS.parse({
      probes: { ring_write: { failedAt: NOW, firmware: 82, reason: 'refused' } },
    });
    expect(probeStatus(value, 'ring_write', 82)).toBe('failed');
  });

  it('counts passes', () => {
    const value = settings({
      pacer_write: { passedAt: NOW, firmware: 82 },
      advert_log: { passedAt: NOW, firmware: 82 },
      clock_write: { passedAt: NOW, firmware: 70 },
    });
    expect(passedCount(value, 82)).toBe(2);
    expect(anyWritePassed(value, 82)).toBe(true);
    expect(anyWritePassed(settings({ advert_log: { passedAt: NOW, firmware: 82 } }), 82)).toBe(
      false,
    );
  });
});

describe('what stays locked', () => {
  it('locks every handle control until its own test passed', () => {
    const value = settings({ pacer_write: { passedAt: NOW, firmware: 82 } });
    expect(gateOf(value, 'pacer', 82, true).open).toBe(true);
    expect(gateOf(value, 'quarter', 82, true).open).toBe(true);
    expect(gateOf(value, 'ring', 82, true)).toEqual({
      open: false,
      reason: 'its handle test has not passed',
    });
    expect(gateOf(value, 'head', 82, true).open).toBe(false);
  });

  it('also needs consent', () => {
    const value = settings({ ring_write: { passedAt: NOW, firmware: 82 } });
    expect(gateOf(value, 'ring', 82, false)).toEqual({
      open: false,
      reason: 'changing the brush is not allowed yet',
    });
    expect(gateOf(value, 'ring', 82, true).open).toBe(true);
  });
});

describe('running a handle test', () => {
  const idle = { link: { phase: 'linked' }, frame: { activity: 'standby' } } as const;

  it('runs only linked and idle, except the broadcast check', () => {
    expect(canTest('pacer_write', idle).allowed).toBe(true);
    expect(canTest('pacer_write', { ...idle, frame: { activity: 'brushing' } }).allowed).toBe(
      false,
    );
    expect(canTest('ring_write', { ...idle, link: { phase: 'asleep' } }).reason).toContain('links');
    expect(canTest('advert_log', { ...idle, link: { phase: 'asleep' } }).allowed).toBe(true);
  });
});

describe('the controls', () => {
  it('writes the target from the quarter seconds', () => {
    expect(quarterTarget(30, 4)).toBe('30 s per quarter, 2:00 target');
    expect(quarterTarget(45, 4)).toBe('45 s per quarter, 3:00 target');
    expect(QUARTER_RANGE).toEqual({ min: 15, max: 60, step: 5 });
  });

  it('offers broadcast and connected with a cost for each', () => {
    expect(LIVE_CHOICES.map((choice) => choice.value)).toEqual(['broadcast', 'connected']);
    const [broadcast, connected] = LIVE_CHOICES;
    expect(connected?.cost.battery).toBeGreaterThan(broadcast?.cost.battery ?? 9);
    expect(HEAD_DUE_RANGE.min).toBe(0);
  });

  it('places the head alert markers on the days bar', () => {
    expect(daysBarOf(14, 0, 90)).toEqual({ due: 0, warn: 14 / 90 });
    expect(daysBarOf(3, 10, 90).warn).toBeCloseTo(10 / 90);
    expect(daysBarOf(500, 0, 90).warn).toBe(1);
  });

  it('draws six lit ring swatches', () => {
    const swatches = ringSwatches();
    expect(swatches.map((swatch) => swatch.name)).toEqual([
      'white',
      'yellow',
      'orange',
      'blue',
      'turquoise',
      'pink',
    ]);
    expect(new Set(swatches.map((swatch) => swatch.hex)).size).toBe(6);
    expect(swatches[0]?.hex).toBe('#ffffff');
  });
});
