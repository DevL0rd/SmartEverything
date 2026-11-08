import type { PlannerPreferences } from '@smarteverything/domain';
import type { Store } from '../store/store';

const DEFAULT_PREFERENCES: PlannerPreferences = {
  general: {
    week_start: 1,
    day_start: '06:00',
    day_end: '23:00',
    working_hours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    shown_profile_id: null,
  },
  day_planner: {
    fade: 'soft',
    show_happened: true,
    show_sleep: true,
    show_weather: true,
    missed_scope: 'since_last_open',
  },
  tasks: {
    default_collection_id: null,
    smart_lists: ['today', 'upcoming', 'overdue', 'device_tasks', 'habits', 'someday', 'completed'],
    suggest_completion: true,
  },
  calendar: {
    default_view: 'week',
    default_reminders: [{ minutes_before: 10 }],
    show_tasks: true,
    show_alarms: true,
    show_sleep: true,
    show_free_time: false,
  },
  clock: {
    sound: 'default',
    ramp_seconds: 30,
    snooze_minutes: 9,
    targets: [],
    wake_scene_id: null,
    world_clocks: [],
  },
  watch: { watch_alarm_sync: true, watch_calendar_push: true },
  ai: { briefing: 'off', evening_review: false, plan_suggestions: true },
};

export function plannerPreferencesOf(
  store: Pick<Store, 'plannerPreferences'>,
  profileId: string,
): PlannerPreferences {
  return store.plannerPreferences.find(profileId)?.preferences ?? DEFAULT_PREFERENCES;
}
