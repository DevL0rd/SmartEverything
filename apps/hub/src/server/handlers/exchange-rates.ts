import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { reportOf } from '../../exchange-rates/report';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type ExchangeRatesRoutes = Record<'readExchangeRates' | 'refreshExchangeRates', Bound>;

export function exchangeRatesRoutes(context: ServerContext, now: () => Date): ExchangeRatesRoutes {
  const { exchangeRates } = context;
  return {
    readExchangeRates: bound(E.readExchangeRates, async () => {
      await exchangeRates.settled();
      return reportOf(exchangeRates.current(), now());
    }),
    refreshExchangeRates: bound(E.refreshExchangeRates, async () =>
      reportOf(await exchangeRates.refresh(), now()),
    ),
  };
}
