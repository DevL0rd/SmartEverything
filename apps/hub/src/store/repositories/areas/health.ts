import type { StoreContext } from '../../context';
import { BodyReadingsRepository } from '../body-readings';
import { FoodsRepository } from '../foods';
import { HealthEntriesRepository } from '../health-entries';
import { HealthRecordsRepository } from '../health-records';
import { HealthSourcesRepository } from '../health-sources';
import { WatchDaysRepository } from '../watch-days';

export interface HealthRepositories {
  readonly healthSources: HealthSourcesRepository;
  readonly watchDays: WatchDaysRepository;
  readonly health: HealthRecordsRepository;
  readonly healthEntries: HealthEntriesRepository;
  readonly foods: FoodsRepository;
  readonly bodyReadings: BodyReadingsRepository;
}

export function healthRepositories(context: StoreContext): HealthRepositories {
  const watchDays = new WatchDaysRepository(context);
  const health = new HealthRecordsRepository(context, watchDays);
  return {
    healthSources: new HealthSourcesRepository(context),
    watchDays,
    health,
    healthEntries: new HealthEntriesRepository(context, health),
    foods: new FoodsRepository(context),
    bodyReadings: new BodyReadingsRepository(context),
  };
}
