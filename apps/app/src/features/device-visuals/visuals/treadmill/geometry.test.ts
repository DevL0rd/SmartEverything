import { describe, expect, it } from 'vitest';
import {
  TEXTURE_TRAVEL,
  UNITS_PER_METER,
  beltCycleMs,
  beltRate,
  cadenceOf,
  gaitOf,
  glowRole,
  heartZoneOf,
  rotateAbout,
  strideCycleMs,
  tiltDegrees,
} from './geometry';

describe('deck tilt', () => {
  it('is the arctangent of the grade', () => {
    expect(tiltDegrees(0)).toBe(0);
    expect(tiltDegrees(10)).toBeCloseTo(5.711, 3);
    expect(tiltDegrees(20)).toBeCloseTo(11.31, 2);
    expect(tiltDegrees(-3)).toBe(0);
  });

  it('lifts the front of the machine about the rear roller', () => {
    const front = rotateAbout({ x: 340, y: 356 }, tiltDegrees(20));
    expect(front.y).toBeLessThan(356);
    expect(Math.hypot(front.x - 40, front.y - 356)).toBeCloseTo(300, 6);
    expect(rotateAbout({ x: 340, y: 356 }, 0)).toEqual({ x: 340, y: 356 });
  });
});

describe('stride', () => {
  it('lasts 120 divided by the cadence', () => {
    expect(strideCycleMs(120)).toBe(1000);
    expect(strideCycleMs(100)).toBe(1200);
    expect(strideCycleMs(150)).toBe(800);
  });

  it('uses the belt cadence and estimates one only when the belt sends none', () => {
    expect(cadenceOf(110, 5)).toBe(110);
    expect(cadenceOf(null, 5)).toBe(88 + 5 * 6.5);
    expect(cadenceOf(0, 5)).toBe(88 + 5 * 6.5);
  });
});

describe('belt scroll', () => {
  it('moves the texture at the real belt speed at drawing scale', () => {
    expect(beltRate(3.6)).toBeCloseTo(UNITS_PER_METER, 9);
    expect(beltRate(7.2)).toBeCloseTo(2 * UNITS_PER_METER, 9);
    expect(beltRate(0)).toBe(0);
  });

  it('repeats the texture once per cycle and halves the cycle when the speed doubles', () => {
    const slow = beltCycleMs(5);
    const fast = beltCycleMs(10);
    expect(slow).not.toBeNull();
    expect(fast).not.toBeNull();
    expect((slow ?? 0) / 2).toBeCloseTo(fast ?? 0, 9);
    expect((beltRate(5) * (slow ?? 0)) / 1000).toBeCloseTo(TEXTURE_TRAVEL, 9);
    expect(beltCycleMs(0)).toBeNull();
  });
});

describe('gait', () => {
  it('blends walk, jog and run with speed and lifts both feet only above 8 km/h', () => {
    expect(gaitOf(2).amp).toBe(22);
    expect(gaitOf(8).amp).toBe(32);
    expect(gaitOf(12).amp).toBe(42);
    expect(gaitOf(6).amp).toBeCloseTo(27, 9);
    expect(gaitOf(8).hop).toBe(0);
    expect(gaitOf(10).hop).toBeCloseTo(2.75, 9);
    expect(gaitOf(15).hop).toBe(5.5);
  });
});

describe('zone glow', () => {
  it('uses the heart rate zone when one is known and the speed zone otherwise', () => {
    expect(heartZoneOf(null)).toBeNull();
    expect(heartZoneOf(80)).toBeNull();
    expect(heartZoneOf(100)).toBe(0);
    expect(heartZoneOf(160)).toBe(3);
    expect(heartZoneOf(180)).toBe(4);
    expect(glowRole('walk', null)).toBe('positive');
    expect(glowRole('walk', 4)).toBe('critical');
  });
});
