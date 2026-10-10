import { z } from 'zod';
import { DAY, MOMENT } from './api/primitives';

export const CURRENCY_CODE = z.string().regex(/^[A-Z]{3}$/);

export const EXCHANGE_RATES_ROW = z.strictObject({
  id: z.literal('usd'),
  rates: z.record(CURRENCY_CODE, z.number().positive()).nullable(),
  rate_date: DAY.nullable(),
  fetched_at: MOMENT.nullable(),
  next_fetch_at: MOMENT.nullable(),
  error: z.string().nullable(),
  failed_at: MOMENT.nullable(),
  updated_at: MOMENT,
});

export type ExchangeRatesRow = z.infer<typeof EXCHANGE_RATES_ROW>;

export const EXCHANGE_RATES_SOURCE = {
  name: 'Frankfurter (European Central Bank reference rates)',
  url: 'https://api.frankfurter.dev/v1/latest?base=USD',
} as const;

export const EXCHANGE_RATES_REPORT = z.strictObject({
  base: z.literal('USD'),
  rates: z.record(CURRENCY_CODE, z.number().positive()),
  rateDate: DAY,
  fetchedAt: MOMENT,
  stale: z.boolean(),
  error: z.string().nullable(),
  source: z.string().min(1),
});

export type ExchangeRatesReport = z.infer<typeof EXCHANGE_RATES_REPORT>;

export const RATES_FRESH_MS = 24 * 60 * 60_000;

export const RATES_STALE_MS = 3 * 24 * 60 * 60_000;

export type ExchangeRatesStatus =
  | { readonly kind: 'missing'; readonly reason: string | null }
  | {
      readonly kind: 'ready';
      readonly rates: Readonly<Record<string, number>>;
      readonly rateDate: string;
      readonly stale: boolean;
      readonly error: string | null;
    };

export function exchangeRatesStatusOf(
  row: ExchangeRatesRow | null,
  now: Date,
): ExchangeRatesStatus {
  if (row === null) {
    return { kind: 'missing', reason: null };
  }
  if (row.rates === null || row.rate_date === null || row.fetched_at === null) {
    return { kind: 'missing', reason: row.error };
  }
  return {
    kind: 'ready',
    rates: row.rates,
    rateDate: row.rate_date,
    stale: now.getTime() - Date.parse(row.fetched_at) > RATES_STALE_MS,
    error: row.error,
  };
}
