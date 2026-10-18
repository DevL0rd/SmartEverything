import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { reportOf } from '../../exchange-rates/report';
import type { ServerContext } from '../context';
import { bound } from '../router';

export const exchangeRatesRoutes = ({ exchangeRates }: ServerContext, now: () => Date) =>
  ({
    readExchangeRates: bound(E.readExchangeRates, async () => {
      await exchangeRates.settled();
      return reportOf(exchangeRates.current(), now());
    }),
    refreshExchangeRates: bound(E.refreshExchangeRates, async () =>
      reportOf(await exchangeRates.refresh(), now()),
    ),
  }) as const;
