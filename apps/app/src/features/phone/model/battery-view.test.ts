import { describe, expect, it } from 'vitest';
import { chargerText, healthText, memoryOf, rateText, temperatureWord } from './battery-view';

type Power = Parameters<typeof memoryOf>[0];

const POWER: Power = {
  level: 62,
  voltageMv: 4000,
  currentMa: 4500,
  temperatureC: 31,
  health: 'good',
  cycles: 120,
  charger: 'ac',
  fullAt: null,
  memory: { totalBytes: 12 * 1024 ** 3, availableBytes: 4 * 1024 ** 3 },
  at: '2026-10-18T13:00:00.000Z',
};

describe('battery view', () => {
  it('turns current and voltage into watts for the direction of charge', () => {
    expect(rateText(POWER, true)).toBe('Charging at 18.0 W');
    expect(rateText({ ...POWER, currentMa: -1200 }, false)).toBe('Using 4.8 W');
  });

  it('says nothing when the phone does not report current', () => {
    expect(rateText({ ...POWER, currentMa: null }, true)).toBeNull();
    expect(rateText(undefined, false)).toBeNull();
  });

  it('names the temperature in three steps', () => {
    expect(temperatureWord(30)).toBe('Cool');
    expect(temperatureWord(38)).toBe('Warm');
    expect(temperatureWord(45)).toBe('Hot');
  });

  it('words health and charger kinds', () => {
    expect(healthText('overheat')).toBe('Overheated');
    expect(chargerText('wireless')).toBe('Wireless charger');
    expect(chargerText('none')).toBe('On battery');
  });

  it('splits memory into used and total', () => {
    const memory = memoryOf(POWER);
    expect(memory.totalGb).toBe(12);
    expect(memory.usedGb).toBe(8);
  });
});
