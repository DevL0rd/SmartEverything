import { GOOGLE_ACCOUNT_ROW } from '../google-accounts';
import { PLANNER_ALARM_ROW } from '../planner/alarms';
import {
  PLANNER_BEDTIME_NOTICE,
  PLANNER_SLEEP_SOUND_NOTICE,
  PLANNER_WIND_DOWN_NOTICE,
} from '../planner/bedtime';
import { PLANNER_BOOKING_PAGE_ROW } from '../planner/booking';
import { PLANNER_COLLECTION_ROW } from '../planner/collections';
import { PLANNER_GUEST_ROW } from '../planner/guests';
import { PLANNER_ITEM_ROW } from '../planner/items';
import { PLANNER_OCCURRENCE_ROW } from '../planner/occurrences';
import { PLANNER_COLLECTION_SHARE_ROW } from '../planner/sharing';
import {
  PLANNER_ASSIGNED_NOTICE,
  PLANNER_BOOKED_NOTICE,
  PLANNER_INVITED_NOTICE,
  PLANNER_PHONE_RINGS_NOTICE,
  PLANNER_RING_NOTICE,
  PLANNER_RSVP_NOTICE,
} from '../planner/signals';
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
  planner_collection_shares: PLANNER_COLLECTION_SHARE_ROW,
  planner_guests: PLANNER_GUEST_ROW,
  planner_booking_pages: PLANNER_BOOKING_PAGE_ROW,
  google_accounts: GOOGLE_ACCOUNT_ROW,
} as const;

export const PLANNER_LIVE_NOTICES = [
  PLANNER_RING_NOTICE,
  PLANNER_SUMMARY_NOTICE,
  PLANNER_PHONE_RINGS_NOTICE,
  PLANNER_INVITED_NOTICE,
  PLANNER_RSVP_NOTICE,
  PLANNER_ASSIGNED_NOTICE,
  PLANNER_BOOKED_NOTICE,
  PLANNER_BEDTIME_NOTICE,
  PLANNER_WIND_DOWN_NOTICE,
  PLANNER_SLEEP_SOUND_NOTICE,
] as const;
