import type { Snapshot } from '@smarteverything/domain';
import type { NextTable, Tables } from './state';

export type PlannerTables = Pick<
  Tables,
  | 'planner_collections'
  | 'planner_items'
  | 'planner_occurrences'
  | 'planner_alarms'
  | 'planner_timers'
  | 'planner_stopwatches'
  | 'planner_collection_shares'
  | 'planner_guests'
  | 'planner_booking_pages'
  | 'google_accounts'
>;

export function plannerTablesOf(snapshot: Snapshot, next: NextTable): PlannerTables {
  const t = snapshot.tables;
  return {
    planner_collections: next('planner_collections', t.planner_collections),
    planner_items: next('planner_items', t.planner_items),
    planner_occurrences: next('planner_occurrences', t.planner_occurrences),
    planner_alarms: next('planner_alarms', t.planner_alarms),
    planner_timers: next('planner_timers', t.planner_timers),
    planner_stopwatches: next('planner_stopwatches', t.planner_stopwatches),
    planner_collection_shares: next('planner_collection_shares', t.planner_collection_shares),
    planner_guests: next('planner_guests', t.planner_guests),
    planner_booking_pages: next('planner_booking_pages', t.planner_booking_pages),
    google_accounts: next('google_accounts', t.google_accounts),
  };
}
