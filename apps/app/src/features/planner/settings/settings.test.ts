import { PLANNER_COLOUR_KEYS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { Availability } from '../../../store/selectors';
import { emptyState } from '../../../store/state';
import { UNLINKED } from '../data';
import {
  COLOUR_OPTIONS,
  beforeText,
  googleRowText,
  rampOptions,
  rampText,
  reminderOptions,
  shownCount,
  timeOfClockText,
  clockTextOf,
} from './options';
import { mergedPrefs, type Prefs } from './preferences';

const { SETTINGS, PLANNER_CLOCK_SETTING, PLANNER_SETTINGS_PAGE } = await import('../settings');
const { settingsPage } = await import('../../../settings/tree');

const PREFS: Prefs = {
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

describe('planner settings', () => {
  it('gives every setting a unique planner id on a known page', () => {
    const ids = SETTINGS.map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const setting of SETTINGS) {
      expect(setting.id.startsWith('planner.')).toBe(true);
      expect(settingsPage(setting.page)).toBeDefined();
      expect(setting.scope).toBe('server');
    }
  });

  it('shows the groups in the designed order on the planner page', () => {
    const sections = SETTINGS.filter((setting) => setting.page === PLANNER_SETTINGS_PAGE).map(
      (setting) => setting.section,
    );
    expect([...new Set(sections)]).toEqual([
      'General',
      'Day planner',
      'Tasks',
      'Calendar',
      'Clock',
      'Watch',
      'Accounts',
      'AI',
    ]);
  });

  it('points the Clock entry at the first Clock row', () => {
    const clock = SETTINGS.find((setting) => setting.section === 'Clock');
    expect(clock?.id).toBe(PLANNER_CLOCK_SETTING);
  });

  it('keeps the owner-only person row hidden from members', () => {
    const shown = SETTINGS.find((setting) => setting.id === 'planner.general.shown');
    const env = { platform: 'android', developer: false } as const;
    expect(shown?.visible?.({ ...env, owner: true, availability: emptyAvailability() })).toBe(true);
    expect(shown?.visible?.({ ...env, owner: false, availability: emptyAvailability() })).toBe(
      false,
    );
  });

  it('summarises the Google link on the settings master', () => {
    const summary = settingsPage('planner')?.summary;
    expect(summary?.(emptyState())).toBe('Google not linked');
  });
});

function emptyAvailability(): Availability {
  return {
    hasDevices: false,
    hasClimate: false,
    hasCameras: false,
    hasHealth: false,
    hasScenes: false,
    hasEnergy: false,
    hasSecurity: false,
    hasIr: false,
    hasWatch: false,
    needsAttention: false,
  };
}

describe('planner settings text', () => {
  it('names the Google link in one vocabulary', () => {
    expect(googleRowText(UNLINKED)).toBe('Not linked');
    expect(googleRowText({ ...UNLINKED, needsAttention: true, status: 'needs_attention' })).toBe(
      'Needs attention',
    );
    const linked = {
      ...UNLINKED,
      linked: true,
      status: 'linked' as const,
      email: 'me@example.com',
    };
    expect(googleRowText(linked)).toBe('Linked as me@example.com');
    expect(googleRowText({ ...linked, lastSyncAt: '2026-11-07T14:02:00.000Z' })).toMatch(
      /^Linked as me@example\.com · synced /,
    );
  });

  it('words reminders and the gentle volume', () => {
    expect(beforeText(0)).toBe('At the start');
    expect(beforeText(10)).toBe('10 min before');
    expect(beforeText(60)).toBe('1 hour before');
    expect(beforeText(1440)).toBe('1 day before');
    expect(rampText(0)).toBe('Off');
    expect(rampText(15)).toBe('Over 15 s');
    expect(rampText(120)).toBe('Over 2 minutes');
  });

  it('keeps a stored value that is not a preset selectable', () => {
    expect(reminderOptions('45').at(-1)).toEqual({ value: '45', label: '45 min before' });
    expect(rampOptions('45').at(-1)).toEqual({ value: '45', label: 'Over 45 s' });
    expect(rampOptions('30').filter((option) => option.value === '30')).toHaveLength(1);
  });

  it('offers every calendar colour on its data colour swatch, never the primary one', () => {
    expect(COLOUR_OPTIONS.map((option) => option.value)).toEqual([...PLANNER_COLOUR_KEYS]);
    const swatches = COLOUR_OPTIONS.map((option) => option.swatchClassName);
    expect(new Set(swatches).size).toBe(swatches.length);
    expect(swatches).not.toContain('bg-viz-2');
  });

  it('counts what is shown', () => {
    expect(shownCount(7, 7)).toBe('All 7');
    expect(shownCount(3, 7)).toBe('3 shown');
    expect(shownCount(0, 7)).toBe('None');
  });

  it('reads and writes clock times', () => {
    expect(timeOfClockText('06:30')).toEqual({ hour: 6, minute: 30 });
    expect(clockTextOf({ hour: 7, minute: 5 })).toBe('07:05');
  });
});

describe('planner preference changes', () => {
  it('changes only the named fields', () => {
    const next = mergedPrefs(PREFS, { clock: { snooze_minutes: 5 }, ai: { evening_review: true } });
    expect(next.clock).toEqual({ ...PREFS.clock, snooze_minutes: 5 });
    expect(next.ai).toEqual({ ...PREFS.ai, evening_review: true });
    expect(next.general).toEqual(PREFS.general);
    expect(next.tasks).toEqual(PREFS.tasks);
  });
});
