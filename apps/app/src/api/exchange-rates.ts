import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.exchange-rates');

export async function refreshExchangeRates(): Promise<void> {
  const report = await api().call(E.refreshExchangeRates, {});
  log.info('exchange_rates.refreshed', { rateDate: report.rateDate });
}
