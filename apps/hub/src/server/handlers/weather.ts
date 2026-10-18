import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { reportOf } from '../../weather/report';
import type { ServerContext } from '../context';
import { bound } from '../router';

export const weatherRoutes = ({ store, weather }: ServerContext, now: () => Date) =>
  ({
    readWeather: bound(E.readWeather, async () => {
      await weather.settled();
      return reportOf(weather.current(), store.settings.read(), now());
    }),
    refreshWeather: bound(E.refreshWeather, async () =>
      reportOf(await weather.refresh(), store.settings.read(), now()),
    ),
  }) as const;
