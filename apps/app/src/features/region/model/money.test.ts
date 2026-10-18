import type { ExchangeRatesRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  formatDollars,
  formatMicros,
  moneyFormatOf,
  moneyNoteOf,
  moneyOf,
  rateLine,
  type MoneyInput,
} from './money';

const ROW: ExchangeRatesRow = {
  id: 'usd',
  rates: { USD: 1, JPY: 158.25, EUR: 0.89238, GBP: 0.75641 },
  rate_date: '2026-10-09',
  fetched_at: '2026-10-10T17:30:00.000Z',
  next_fetch_at: null,
  error: null,
  failed_at: null,
  updated_at: '2026-10-10T17:30:00.000Z',
};

const NOW = new Date('2026-10-11T08:00:00.000Z');

function input(overrides: Partial<MoneyInput>): MoneyInput {
  return {
    pref: { region: 'auto' },
    device: { locale: 'en-US', timeZone: 'America/New_York' },
    rates: ROW,
    now: NOW,
    ...overrides,
  };
}

describe('moneyFormatOf', () => {
  it('shows US dollars without converting for a US device', () => {
    expect(moneyFormatOf(input({}))).toStrictEqual({
      currency: 'USD',
      locale: 'en-US',
      rate: 1,
      rateDate: null,
      notice: null,
    });
  });

  it('converts to the chosen region’s currency using the stored rate and its date', () => {
    expect(moneyFormatOf(input({ pref: { region: 'JP' } }))).toStrictEqual({
      currency: 'JPY',
      locale: 'ja-JP',
      rate: 158.25,
      rateDate: '2026-10-09',
      notice: null,
    });
  });

  it('follows the device when the region is automatic', () => {
    const format = moneyFormatOf(input({ device: { locale: 'de-DE', timeZone: 'Europe/Berlin' } }));
    expect(format).toMatchObject({ currency: 'EUR', rate: 0.89238 });
  });

  it('shows US dollars with a notice, not a guessed rate, when no rates have arrived', () => {
    const format = moneyFormatOf(input({ pref: { region: 'JP' }, rates: null }));
    expect(format).toMatchObject({
      currency: 'USD',
      rate: 1,
      rateDate: null,
      notice: 'rates_missing',
    });
    expect(moneyNoteOf(format)).toContain('Exchange rates aren’t available yet');
  });

  it('shows US dollars with a notice when the rates lack the region’s currency', () => {
    const format = moneyFormatOf(input({ pref: { region: 'SE' } }));
    expect(format).toMatchObject({ currency: 'USD', rate: 1, notice: 'rates_missing' });
  });

  it('keeps converting with the last rates when they are stale', () => {
    const format = moneyFormatOf(
      input({ pref: { region: 'JP' }, now: new Date('2026-10-30T00:00:00.000Z') }),
    );
    expect(format).toMatchObject({ currency: 'JPY', rate: 158.25, notice: null });
  });

  it('shows US dollars with a notice when automatic detection finds no supported region', () => {
    const format = moneyFormatOf(input({ device: { locale: 'en-AE', timeZone: 'Asia/Dubai' } }));
    expect(format).toMatchObject({ currency: 'USD', notice: 'region_unknown' });
  });
});

describe('formatting', () => {
  const usd = moneyOf(moneyFormatOf(input({})));
  const jpy = moneyOf(moneyFormatOf(input({ pref: { region: 'JP' } })));
  const eur = moneyOf(moneyFormatOf(input({ pref: { region: 'DE' } })));

  it('keeps the US dollar rules: cents, a third decimal below a cent, and a floor', () => {
    expect(usd.cost(0)).toBe('$0.00');
    expect(usd.cost(120_000)).toBe('$0.12');
    expect(usd.cost(4_000)).toBe('$0.004');
    expect(usd.cost(300)).toBe('<$0.001');
    expect(usd.cost(1_234_560_000)).toBe('$1,234.56');
  });

  it('converts and rounds to the currency’s own precision', () => {
    expect(eur.cost(1_000_000)).toBe('0,89\u00a0€');
    expect(eur.cost(10_000_000)).toBe('8,92\u00a0€');
  });

  it('shows whole yen with no decimals and one decimal for amounts under a yen', () => {
    expect(jpy.cost(1_000_000)).toBe('￥158');
    expect(jpy.cost(12_345_678)).toBe('￥1,954');
    expect(jpy.cost(2_000)).toBe('￥0.3');
    expect(jpy.cost(0)).toBe('￥0');
  });

  it('shows a floor instead of zero for amounts below a tenth of a yen', () => {
    expect(jpy.cost(100)).toBe('<￥0.1');
  });

  it('formats dollar amounts the same way as micros', () => {
    expect(formatDollars(jpy.format, 2)).toBe(formatMicros(jpy.format, 2_000_000));
  });

  it('writes the rate and its date for the details view', () => {
    expect(rateLine(jpy.format)).toBe('1 USD = 158.25 JPY · rates of 2026-10-09');
    expect(rateLine(usd.format)).toBeNull();
  });

  it('converts a local amount to USD rounded to micros and back for display', () => {
    expect(jpy.toUsd(1_000)).toBe(6.319115);
    expect(jpy.toLocal(6.319115)).toBe(1_000);
    expect(usd.toUsd(5)).toBe(5);
    expect(usd.toLocal(5.004)).toBe(5);
  });

  it('keeps the local bounds inside the allowed USD range', () => {
    const { min, max } = jpy.bounds(0.01, 100_000);
    expect(min).toBe(2);
    expect(jpy.toUsd(min)).toBeGreaterThanOrEqual(0.01);
    expect(jpy.toUsd(max)).toBeLessThanOrEqual(100_000);
    expect(usd.bounds(0.01, 100_000)).toStrictEqual({ min: 0.01, max: 100_000 });
  });
});
