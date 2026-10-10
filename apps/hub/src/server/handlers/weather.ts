import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { reportOf } from '../../weather/report';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type WeatherRoutes = Record<'readWeather' | 'refreshWeather', Bound>;

export function weatherRoutes(context: ServerContext, now: () => Date): WeatherRoutes {
  const { store, weather } = context;
  return {
    readWeather: bound(E.readWeather, async () => {
      await weather.settled();
      return reportOf(weather.current(), store.settings.read(), now());
    }),
    refreshWeather: bound(E.refreshWeather, async () =>
      reportOf(await weather.refresh(), store.settings.read(), now()),
    ),
  };
}
