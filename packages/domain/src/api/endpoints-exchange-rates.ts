import { EXCHANGE_RATES_REPORT } from '../exchange-rates';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const EXCHANGE_RATES_AREA_ENDPOINTS = {
  readExchangeRates: endpoint({
    method: 'GET',
    path: '/api/exchange-rates',
    access: 'member',
    summary:
      'US dollar exchange rates the app uses to show costs in a region’s currency, with their date; costs are stored in US dollars',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: EXCHANGE_RATES_REPORT,
  }),
  refreshExchangeRates: endpoint({
    method: 'POST',
    path: '/api/exchange-rates/refresh',
    access: 'member',
    summary: 'Fetch the exchange rates now instead of waiting for the daily update',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: EXCHANGE_RATES_REPORT,
  }),
} as const;
