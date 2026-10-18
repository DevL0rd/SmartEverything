import { describe, expect, it } from 'vitest';
import {
  formatByteRate,
  formatBytes,
  formatCount,
  formatMegabits,
  formatValue,
  presentCapability,
  presentValue,
  type DeviceCapability,
} from '../src';
import { formatNumber } from '../src/value-format';

const EN = 'en-US';
const DE = 'de-DE';

describe('formatBytes', () => {
  it('writes whole bytes under a thousand', () => {
    expect(formatBytes(0, EN)).toBe('0 B');
    expect(formatBytes(5, EN)).toBe('5 B');
    expect(formatBytes(999, EN)).toBe('999 B');
  });

  it('moves up a unit at one thousand with one decimal under ten', () => {
    expect(formatBytes(1000, EN)).toBe('1.0 kB');
    expect(formatBytes(12_000, EN)).toBe('12 kB');
    expect(formatBytes(1_800_000_000, EN)).toBe('1.8 GB');
    expect(formatBytes(191_000_000, EN)).toBe('191 MB');
  });

  it('never shows ten with a decimal or a thousand of a unit', () => {
    expect(formatBytes(9.99e6, EN)).toBe('10 MB');
    expect(formatBytes(9.94e6, EN)).toBe('9.9 MB');
    expect(formatBytes(999_499, EN)).toBe('999 kB');
    expect(formatBytes(999_500, EN)).toBe('1.0 MB');
    expect(formatBytes(999.6, EN)).toBe('1.0 kB');
  });

  it('reaches terabytes and stays there', () => {
    expect(formatBytes(2.5e12, EN)).toBe('2.5 TB');
    expect(formatBytes(5e15, EN)).toBe('5000 TB');
  });
});

describe('formatByteRate', () => {
  it('is the byte format per second', () => {
    expect(formatByteRate(0, EN)).toBe('0 B/s');
    expect(formatByteRate(999, EN)).toBe('999 B/s');
    expect(formatByteRate(1000, EN)).toBe('1.0 kB/s');
    expect(formatByteRate(9.99e6, EN)).toBe('10 MB/s');
    expect(formatByteRate(22_750_000, EN)).toBe('23 MB/s');
  });
});

describe('formatMegabits', () => {
  it('keeps one decimal under ten and whole numbers up to a thousand', () => {
    expect(formatMegabits(0, EN)).toBe('0.0 Mb/s');
    expect(formatMegabits(8.4, EN)).toBe('8.4 Mb/s');
    expect(formatMegabits(9.94, EN)).toBe('9.9 Mb/s');
    expect(formatMegabits(9.95, EN)).toBe('10 Mb/s');
    expect(formatMegabits(182.4, EN)).toBe('182 Mb/s');
    expect(formatMegabits(999.4, EN)).toBe('999 Mb/s');
  });

  it('moves to gigabits at a thousand', () => {
    expect(formatMegabits(999.5, EN)).toBe('1.0 Gb/s');
    expect(formatMegabits(1000, EN)).toBe('1.0 Gb/s');
    expect(formatMegabits(1234, EN)).toBe('1.2 Gb/s');
    expect(formatMegabits(25_000, EN)).toBe('25 Gb/s');
  });
});

describe('formatCount', () => {
  it('groups digits with the locale and rounds to whole numbers', () => {
    expect(formatCount(0, { locale: 'en-US' })).toBe('0');
    expect(formatCount(999, { locale: 'en-US' })).toBe('999');
    expect(formatCount(30_604.4, { locale: 'en-US' })).toBe('30,604');
    expect(formatCount(1_234_567, { locale: 'de-DE' })).toBe('1.234.567');
  });

  it('uses the runtime locale without one', () => {
    expect(formatCount(1234)).toBe(new Intl.NumberFormat().format(1234));
  });

  it('writes thousands for compact counts from one hundred thousand', () => {
    expect(formatCount(99_999, { compact: true, locale: 'en-US' })).toBe('99,999');
    expect(formatCount(100_000, { compact: true, locale: 'en-US' })).toBe('100k');
    expect(formatCount(251_300, { compact: true, locale: 'en-US' })).toBe('251k');
    expect(formatCount(251_300, { compact: false, locale: 'en-US' })).toBe('251,300');
    expect(formatCount(251_300, { locale: 'en-US' })).toBe('251,300');
  });
});

const TEST_DEVICE = { kind: 'router', model: 'Test router' } as const;

function present(
  unit: string | undefined,
  step: number,
): ReturnType<typeof presentCapability> & {
  readonly capability: DeviceCapability;
} {
  const capability: DeviceCapability = {
    key: 'sync_remaining',
    label: 'Reading',
    access: 'read',
    value: { kind: 'number', min: 0, max: 1e15, step, ...(unit === undefined ? {} : { unit }) },
  };
  return { ...presentCapability(TEST_DEVICE, capability), capability };
}

describe('presentValue by unit', () => {
  it('formats byte rates, bytes and megabit rates', () => {
    expect(presentValue(present('B/s', 1), 182_000)).toBe('182 kB/s');
    expect(presentValue(present('B', 1), 1_800_000_000)).toBe('1.8 GB');
    expect(presentValue(present('Mb/s', 0.1), 1500)).toBe('1.5 Gb/s');
  });

  it('keeps the step decimals and unit spacing for other units', () => {
    expect(presentValue(present('ms', 0.1), 12)).toBe('12.0 ms');
    expect(presentValue(present('%', 0.1), 46)).toBe('46.0%');
    expect(presentValue(present(undefined, 1), 34)).toBe('34');
  });

  it('formats search values the same way', () => {
    const descriptor = { kind: 'number', min: 0, max: 1e15, step: 1, unit: 'B' } as const;
    expect(formatValue('sync_remaining', descriptor, 191_000_000, EN)).toBe('191 MB');
    expect(formatNumber(8.4, 'Mb/s', 0.1, EN)).toBe('8.4 Mb/s');
  });
});

describe('decimals follow the locale', () => {
  it('writes byte rates with the language decimal separator and no grouping', () => {
    expect(formatByteRate(1500, EN)).toBe('1.5 kB/s');
    expect(formatByteRate(1500, DE)).toBe('1,5 kB/s');
    expect(formatBytes(5e15, DE)).toBe('5000 TB');
  });

  it('writes megabit rates and step decimals the same way', () => {
    expect(formatMegabits(8.4, DE)).toBe('8,4 Mb/s');
    expect(formatMegabits(1234, DE)).toBe('1,2 Gb/s');
    expect(formatNumber(22, '°C', 0.5, DE)).toBe('22,0°C');
    expect(formatNumber(1234.5, 'W', 0.1, DE)).toBe('1234,5 W');
    expect(formatNumber(22, '°C', 0.5, EN)).toBe('22.0°C');
  });

  it('formats a search value in the requested locale', () => {
    const descriptor = { kind: 'number', min: 0, max: 40, step: 0.5, unit: '°C' } as const;
    expect(formatValue('target_temperature', descriptor, 21.5, DE)).toBe('21,5°C');
  });
});
