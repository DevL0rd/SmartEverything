import { GOOGLE_ACCOUNT_ROW } from '../google-accounts';
import { PLANNER_ALARM_ROW } from '../planner/alarms';
import { PLANNER_COLLECTION_ROW } from '../planner/collections';
import { PLANNER_ITEM_ROW } from '../planner/items';
import { PLANNER_OCCURRENCE_ROW } from '../planner/occurrences';
import { PLANNER_RING_NOTICE } from '../planner/signals';
import { PLANNER_STOPWATCH_ROW } from '../planner/stopwatch';
import { PLANNER_SUMMARY_NOTICE } from '../planner/summary';
import { PLANNER_TIMER_ROW } from '../planner/timers';

export const PLANNER_TABLE_ROWS = {
  planner_collections: PLANNER_COLLECTION_ROW,
  planner_items: PLANNER_ITEM_ROW,
  planner_occurrences: PLANNER_OCCURRENCE_ROW,
  planner_alarms: PLANNER_ALARM_ROW,
  planner_timers: PLANNER_TIMER_ROW,
  planner_stopwatches: PLANNER_STOPWATCH_ROW,
  google_accounts: GOOGLE_ACCOUNT_ROW,
} as const;

export const PLANNER_LIVE_NOTICES = [PLANNER_RING_NOTICE, PLANNER_SUMMARY_NOTICE] as const;
