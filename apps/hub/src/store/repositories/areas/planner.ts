import type { StoreContext } from '../../context';
import { GoogleAccountsRepository } from '../google-accounts';
import { GoogleSyncLogRepository } from '../google-sync-log';
import { GoogleSyncStateRepository } from '../google-sync-state';
import { PlannerAlarmsRepository } from '../planner-alarms';
import { PlannerCollectionsRepository } from '../planner-collections';
import { PlannerItemsRepository } from '../planner-items';
import { PlannerOccurrencesRepository } from '../planner-occurrences';
import { PlannerPreferencesRepository } from '../planner-preferences';
import { PlannerRingsRepository } from '../planner-rings';
import { PlannerStopwatchRepository } from '../planner-stopwatch';
import { PlannerTimersRepository } from '../planner-timers';

export interface PlannerRepositories {
  readonly plannerOccurrences: PlannerOccurrencesRepository;
  readonly plannerItems: PlannerItemsRepository;
  readonly plannerCollections: PlannerCollectionsRepository;
  readonly plannerAlarms: PlannerAlarmsRepository;
  readonly plannerRings: PlannerRingsRepository;
  readonly plannerTimers: PlannerTimersRepository;
  readonly plannerStopwatch: PlannerStopwatchRepository;
  readonly plannerPreferences: PlannerPreferencesRepository;
  readonly googleAccounts: GoogleAccountsRepository;
  readonly googleSyncState: GoogleSyncStateRepository;
  readonly googleSyncLog: GoogleSyncLogRepository;
}

export function plannerRepositories(context: StoreContext): PlannerRepositories {
  const plannerOccurrences = new PlannerOccurrencesRepository(context);
  const plannerItems = new PlannerItemsRepository(context, plannerOccurrences);
  return {
    plannerOccurrences,
    plannerItems,
    plannerCollections: new PlannerCollectionsRepository(context, plannerItems),
    plannerAlarms: new PlannerAlarmsRepository(context),
    plannerRings: new PlannerRingsRepository(context),
    plannerTimers: new PlannerTimersRepository(context),
    plannerStopwatch: new PlannerStopwatchRepository(context),
    plannerPreferences: new PlannerPreferencesRepository(context),
    googleAccounts: new GoogleAccountsRepository(context),
    googleSyncState: new GoogleSyncStateRepository(context),
    googleSyncLog: new GoogleSyncLogRepository(context),
  };
}
