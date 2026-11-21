import { watchUserOf, watchWeatherOf, type WatchData } from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface WatchDataOptions {
  readonly store: Store;
  readonly now: () => Date;
}

export class WatchDataService {
  constructor(private readonly options: WatchDataOptions) {}

  async dataOf(profileId: string): Promise<WatchData> {
    const { store } = this.options;
    const [row, readings, profile] = await Promise.all([
      store.host.call('weather', 'read'),
      store.host.call('bodyReadings', 'ofProfile', profileId),
      store.host.call('profiles', 'byId', profileId),
    ]);
    const weight = readings.reduce<number | null>(
      (latest, reading) => reading.weight_kg ?? latest,
      null,
    );
    return {
      weather:
        row.forecast === null || row.fetched_at === null
          ? null
          : watchWeatherOf(row.forecast, store.settings.read().home_name, row.fetched_at),
      user: watchUserOf(profile, weight, this.options.now()),
    };
  }
}
