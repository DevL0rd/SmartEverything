import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.weather');

export async function refreshWeather(): Promise<void> {
  const report = await api().call(E.refreshWeather, {});
  log.info('weather.refreshed', { fetchedAt: report.fetchedAt });
}
