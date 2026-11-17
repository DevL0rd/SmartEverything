import type { PlannerPreferences } from '@smarteverything/domain';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { OWN_PREFS_KEY, prefsSaves } from './prefs-saves';

const notify = vi.fn();
vi.mock('../../../components/toast-store', () => ({
  notify: (toast: unknown): void => {
    notify(toast);
  },
}));

interface Held {
  readonly prefs: PlannerPreferences;
  readonly resolve: (saved: PlannerPreferences) => void;
  readonly reject: (error: Error) => void;
}

const PREFS: PlannerPreferences = {
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
  tasks: { default_collection_id: null, smart_lists: ['today'], suggest_completion: true },
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

function prefsWith(snooze: number): PlannerPreferences {
  return { ...PREFS, clock: { ...PREFS.clock, snooze_minutes: snooze } };
}

function rig(): {
  readonly client: QueryClient;
  readonly sent: Held[];
  readonly save: ReturnType<typeof prefsSaves>;
} {
  const client = new QueryClient();
  const sent: Held[] = [];
  const save = prefsSaves(
    client,
    (prefs) =>
      new Promise<PlannerPreferences>((resolve, reject) => {
        sent.push({ prefs, resolve, reject });
      }),
  );
  return { client, sent, save };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function shown(client: QueryClient): unknown {
  return client.getQueryData(OWN_PREFS_KEY);
}

describe('Planner preference saves', () => {
  it('sends one write at a time and keeps the newest value while an older reply lands', async () => {
    const { client, sent, save } = rig();
    const first = prefsWith(5);
    const second = prefsWith(10);
    save({ prefs: first, title: 'Snooze' });
    await settled();
    save({ prefs: second, title: 'Snooze' });
    await settled();
    expect(sent.map((entry) => entry.prefs)).toEqual([first]);
    expect(shown(client)).toEqual(second);
    sent[0]?.resolve(first);
    await settled();
    expect(shown(client)).toEqual(second);
    expect(sent.map((entry) => entry.prefs)).toEqual([first, second]);
    sent[1]?.resolve(prefsWith(10));
    await settled();
    expect(shown(client)).toEqual(second);
  });

  it('reports a failed last write and reloads the saved preferences', async () => {
    const { client, sent, save } = rig();
    const reload = vi.spyOn(client, 'invalidateQueries');
    save({ prefs: prefsWith(5), title: 'Snooze' });
    await settled();
    sent[0]?.reject(new Error('offline'));
    await settled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Snooze was not changed', tone: 'critical' }),
    );
    expect(reload).toHaveBeenCalledWith({ queryKey: OWN_PREFS_KEY });
  });
});
