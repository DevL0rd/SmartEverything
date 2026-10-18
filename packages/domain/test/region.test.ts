import { describe, expect, it } from 'vitest';
import {
  CLIENT_PREFS,
  REGIONS,
  REGION_CODES,
  detectRegion,
  exchangeRatesStatusOf,
  localeRegionOf,
  regionOfTimeZone,
  resolveRegion,
  type ExchangeRatesRow,
} from '../src';

const ECB_CURRENCIES = [
  'AUD',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
];

describe('region to currency mapping', () => {
  it('maps every region to a currency the exchange rate source publishes', () => {
    const unsupported = REGION_CODES.filter(
      (code) => !ECB_CURRENCIES.includes(REGIONS[code].currency),
    );
    expect(unsupported).toStrictEqual([]);
  });

  it('maps the main regions to their currency and formatting locale', () => {
    expect(REGIONS.US).toMatchObject({ currency: 'USD', locale: 'en-US' });
    expect(REGIONS.JP).toMatchObject({ currency: 'JPY', locale: 'ja-JP' });
    expect(REGIONS.DE).toMatchObject({ currency: 'EUR', locale: 'de-DE' });
    expect(REGIONS.GB).toMatchObject({ currency: 'GBP', locale: 'en-GB' });
  });

  it('gives every region a locale whose region part is that region', () => {
    for (const code of REGION_CODES) {
      expect(localeRegionOf(REGIONS[code].locale)).toBe(code);
    }
  });
});

describe('region detection', () => {
  it('reads the region from the locale, in either separator style and case', () => {
    expect(localeRegionOf('en-GB')).toBe('GB');
    expect(localeRegionOf('pt_br')).toBe('BR');
    expect(localeRegionOf('zh-Hant-HK')).toBe('HK');
    expect(localeRegionOf('en')).toBeNull();
  });

  it('prefers the locale over the time zone', () => {
    expect(detectRegion({ locale: 'en-GB', timeZone: 'America/New_York' })).toStrictEqual({
      status: 'detected',
      region: 'GB',
      from: 'locale',
    });
  });

  it('falls back to the time zone when the locale has no region', () => {
    expect(detectRegion({ locale: 'en', timeZone: 'Asia/Tokyo' })).toStrictEqual({
      status: 'detected',
      region: 'JP',
      from: 'time_zone',
    });
  });

  it('says so when the locale names a region the app has no currency for', () => {
    expect(detectRegion({ locale: 'en-AE', timeZone: 'Asia/Dubai' })).toStrictEqual({
      status: 'unsupported',
      code: 'AE',
    });
  });

  it('says unknown when neither the locale nor the time zone identify a region', () => {
    expect(detectRegion({ locale: 'en', timeZone: 'Etc/UTC' })).toStrictEqual({
      status: 'unknown',
    });
    expect(regionOfTimeZone('Etc/UTC')).toBeNull();
  });

  it('uses the chosen region when one is set and detection when it is automatic', () => {
    const device = { locale: 'de-DE', timeZone: 'Europe/Berlin' };
    expect(resolveRegion({ region: 'JP' }, device)).toStrictEqual({ kind: 'chosen', region: 'JP' });
    expect(resolveRegion({ region: 'auto' }, device)).toStrictEqual({
      kind: 'detected',
      region: 'DE',
      from: 'locale',
    });
  });
});

describe('region preference', () => {
  it('defaults to automatic and rejects unknown regions', () => {
    expect(CLIENT_PREFS.region.decode(null)).toMatchObject({ value: { region: 'auto' } });
    expect(CLIENT_PREFS.region.schema.safeParse({ region: 'XX' }).success).toBe(false);
  });
});

const ROW: ExchangeRatesRow = {
  id: 'usd',
  rates: { USD: 1, JPY: 158.25 },
  rate_date: '2026-10-09',
  fetched_at: '2026-10-10T17:30:00.000Z',
  next_fetch_at: null,
  error: null,
  failed_at: null,
  updated_at: '2026-10-10T17:30:00.000Z',
};

describe('exchange rate status', () => {
  it('is missing without a row or without rates, carrying the failure reason', () => {
    expect(exchangeRatesStatusOf(null, new Date())).toStrictEqual({
      kind: 'missing',
      reason: null,
    });
    expect(
      exchangeRatesStatusOf(
        { ...ROW, rates: null, rate_date: null, fetched_at: null, error: 'down' },
        new Date(),
      ),
    ).toStrictEqual({ kind: 'missing', reason: 'down' });
  });

  it('is ready and fresh within three days of the fetch', () => {
    expect(exchangeRatesStatusOf(ROW, new Date('2026-10-12T17:30:00.000Z'))).toMatchObject({
      kind: 'ready',
      stale: false,
      rateDate: '2026-10-09',
    });
  });

  it('is ready but stale after three days, still carrying the last error', () => {
    expect(
      exchangeRatesStatusOf({ ...ROW, error: 'down' }, new Date('2026-10-13T17:30:01.000Z')),
    ).toMatchObject({ kind: 'ready', stale: true, error: 'down' });
  });
});

describe('locale region through Intl.Locale', () => {
  it('reads script-qualified, numeric and mixed-case tags', () => {
    expect(localeRegionOf('zh-Hans-CN')).toBe('CN');
    expect(localeRegionOf('es-419')).toBe('419');
    expect(localeRegionOf('EN-us')).toBe('US');
    expect(localeRegionOf('de_AT')).toBe('AT');
  });

  it('reads the region of every tabled locale and none from a bare language', () => {
    for (const code of REGION_CODES) {
      expect(localeRegionOf(REGIONS[code].locale)).toBe(code);
    }
    expect(localeRegionOf('fr')).toBeNull();
  });
});

describe('automatic region without a detection', () => {
  it('reports why nothing was detected', () => {
    expect(resolveRegion({ region: 'auto' }, { locale: 'en', timeZone: 'Etc/UTC' })).toStrictEqual({
      kind: 'undetected',
      detection: { status: 'unknown' },
    });
  });
});
