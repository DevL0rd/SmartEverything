import { watchUserOf, watchWeatherOf, type WatchData } from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface WatchDataOptions {
  readonly store: Store;
  readonly now: () => Date;
}

export class WatchDataService {
  constructor(private readonly options: WatchDataOptions) {}

  dataOf(profileId: string): WatchData {
    const { store } = this.options;
    const row = store.weather.read();
    const weight = store.bodyReadings
      .ofProfile(profileId)
      .reduce<number | null>((latest, reading) => reading.weight_kg ?? latest, null);
    return {
      weather:
        row.forecast === null || row.fetched_at === null
          ? null
          : watchWeatherOf(row.forecast, store.settings.read().home_name, row.fetched_at),
      user: watchUserOf(store.profiles.byId(profileId), weight, this.options.now()),
    };
  }
}
