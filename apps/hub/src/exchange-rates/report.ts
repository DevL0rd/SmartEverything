import {
  ApiError,
  EXCHANGE_RATES_REPORT,
  EXCHANGE_RATES_SOURCE,
  exchangeRatesStatusOf,
  type ExchangeRatesReport,
  type ExchangeRatesRow,
} from '@smarteverything/domain';

export function reportOf(row: ExchangeRatesRow, now: Date): ExchangeRatesReport {
  const status = exchangeRatesStatusOf(row, now);
  if (status.kind === 'missing' || row.fetched_at === null) {
    throw new ApiError(
      'upstream_failed',
      status.kind === 'missing' && status.reason !== null
        ? `The exchange rates aren’t available: ${status.reason}`
        : 'The exchange rates are still being fetched; try again shortly.',
    );
  }
  return EXCHANGE_RATES_REPORT.parse({
    base: 'USD',
    rates: status.rates,
    rateDate: status.rateDate,
    fetchedAt: row.fetched_at,
    stale: status.stale,
    error: status.error,
    source: EXCHANGE_RATES_SOURCE.name,
  });
}
