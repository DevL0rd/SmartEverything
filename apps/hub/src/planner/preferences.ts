import type { PlannerPreferences } from '@smarteverything/domain';
import type { Store } from '../store/store';

export const DEFAULT_PREFERENCES: PlannerPreferences = {
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
    smart_lists: [
      'today',
      'upcoming',
      'overdue',
      'assigned',
      'device_tasks',
      'habits',
      'someday',
      'completed',
    ],
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
    sound: { kind: 'tone', id: 'default' },
    ramp_seconds: 30,
    snooze_minutes: 9,
    snooze_limit: null,
    targets: [],
    wake_automation_id: null,
    world_clocks: [],
  },
  bedtime: {
    enabled: false,
    schedule: [],
    reminder_minutes: 30,
    wind_down_minutes: 30,
    wind_down_automation_id: null,
    do_not_disturb: true,
    sleep_sound: null,
  },
  sleep_sounds: { sound: null, timer_minutes: 60, fade_seconds: 30 },
  watch: { watch_alarm_sync: true, watch_calendar_push: true },
  ai: { briefing: 'off', evening_review: false, plan_suggestions: true },
};

export async function loadPlannerPreferences(
  store: Pick<Store, 'host'>,
  profileId: string,
): Promise<PlannerPreferences> {
  const stored = await store.host.call('plannerPreferences', 'find', profileId);
  return stored?.preferences ?? DEFAULT_PREFERENCES;
}
