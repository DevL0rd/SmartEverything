import { createElement } from 'react';
import { PLANNER_BRIEFINGS, PLANNER_CALENDAR_VIEWS } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { SettingDefinition } from '../../../settings/types';
import { rowsOf, type StoreState } from '../../../store/state';
import { at, choose, custom, link, subHref, toggle } from './define';
import {
  BRIEFING_OPTIONS,
  CALENDAR_SHOWS,
  NONE,
  VIEW_OPTIONS,
  idOrNull,
  onCount,
  picked,
  rampOptions,
  reminderOptions,
  shownCount,
  soundOptions,
} from './options';
import { PrefMinutesRow } from './rows';
import { GoogleRow, WakeSceneRow } from './source-rows';
import { WatchSettingsRow } from './watch-row';

function shownCalendars(state: StoreState): string {
  const me = state.session?.client.profile_id ?? null;
  const calendars = rowsOf(state.tables.planner_collections).filter(
    (row) => row.kind === 'calendar' && row.profile_id === me,
  );
  return shownCount(calendars.filter((row) => row.visible).length, calendars.length);
}

export const CALENDAR: readonly SettingDefinition[] = [
  choose(
    'calendar.view',
    at('Calendar'),
    {
      title: 'Opens on',
      icon: 'calendar',
      get: (prefs) => prefs.calendar.default_view,
      set: (view) => ({ calendar: { default_view: picked(PLANNER_CALENDAR_VIEWS, view) } }),
      options: VIEW_OPTIONS,
    },
    ['view', 'week', 'month', 'agenda'],
  ),
  {
    id: 'planner.calendar.calendars',
    ...at('Calendar'),
    title: 'Calendars',
    description: 'Visibility and colour',
    icon: 'eye',
    keywords: ['planner', 'calendars', 'visibility', 'hide'],
    scope: 'server',
    control: 'link',
    href: subHref('calendars'),
    value: shownCalendars,
  },
  choose(
    'calendar.reminders',
    at('Calendar'),
    {
      title: 'Default reminders',
      icon: 'bell',
      get: (prefs) => String(prefs.calendar.default_reminders[0]?.minutes_before ?? NONE),
      set: (minutes) => ({
        calendar: {
          default_reminders: minutes === NONE ? [] : [{ minutes_before: Number(minutes) }],
        },
      }),
      options: reminderOptions,
    },
    ['reminders', 'notify', 'before'],
  ),
  link(
    'calendar.show',
    at('Calendar'),
    {
      title: 'Show on the calendar',
      icon: 'layers',
      description: 'Tasks, alarms, sleep, free time',
      href: subHref('calendar-show'),
      value: (prefs) => onCount(CALENDAR_SHOWS.filter(({ key }) => prefs.calendar[key]).length),
    },
    ['overlays', 'tasks', 'alarms', 'sleep', 'free time'],
  ),
];

export const CLOCK: readonly SettingDefinition[] = [
  choose(
    'clock.sound',
    at('Clock'),
    {
      title: 'Alarm sound',
      icon: 'bell',
      get: (prefs) => prefs.clock.sound,
      set: (sound) => ({ clock: { sound } }),
      options: soundOptions,
    },
    ['alarm', 'sound', 'ringtone'],
  ),
  choose(
    'clock.ramp',
    at('Clock'),
    {
      title: 'Gentle volume',
      icon: 'sunrise',
      get: (prefs) => String(prefs.clock.ramp_seconds),
      set: (seconds) => ({ clock: { ramp_seconds: Number(seconds) } }),
      options: rampOptions,
    },
    ['ramp', 'volume', 'gentle', 'fade in'],
  ),
  custom('clock.snooze', at('Clock'), ['snooze', 'alarm'], {
    title: 'Snooze',
    render: () =>
      createElement(PrefMinutesRow, {
        spec: {
          title: 'Snooze',
          icon: 'timer',
          get: (prefs) => prefs.clock.snooze_minutes,
          set: (minutes) => ({ clock: { snooze_minutes: minutes } }),
        },
      }),
  }),
  link(
    'clock.ring-on',
    at('Clock'),
    {
      title: 'Ring on',
      icon: 'smartphone',
      href: subHref('ring-on'),
      value: (prefs) => onCount(prefs.clock.targets.length),
    },
    ['ring', 'phone', 'targets', 'devices'],
  ),
  custom('clock.wake', at('Clock'), ['wake', 'scene', 'morning', 'lights'], {
    title: 'Wake routine',
    render: () =>
      createElement(WakeSceneRow, {
        spec: {
          title: 'Wake routine',
          icon: 'sun',
          description: 'Scene before new alarms',
          get: (prefs) => prefs.clock.wake_scene_id ?? NONE,
          set: (id) => ({ clock: { wake_scene_id: idOrNull(id) } }),
        },
      }),
  }),
  link(
    'clock.world',
    at('Clock'),
    {
      title: 'World clocks',
      icon: 'globe',
      href: href.clock.world(),
      value: (prefs) => String(prefs.clock.world_clocks.length),
    },
    ['world clock', 'time zones', 'cities'],
  ),
];

export const WATCH_AND_AI: readonly SettingDefinition[] = [
  toggle(
    'watch.alarms',
    at('Watch'),
    {
      title: 'Sync alarms both ways',
      icon: 'watch',
      get: (prefs) => prefs.watch.watch_alarm_sync,
      set: (on) => ({ watch: { watch_alarm_sync: on } }),
    },
    ['watch', 'alarms', 'sync'],
  ),
  toggle(
    'watch.events',
    at('Watch'),
    {
      title: 'Next events on the watch',
      icon: 'calendar',
      get: (prefs) => prefs.watch.watch_calendar_push,
      set: (on) => ({ watch: { watch_calendar_push: on } }),
    },
    ['watch', 'events', 'calendar'],
  ),
  custom('watch.settings', at('Watch'), ['watch', 'settings', 'alarms', 'sync', 'band'], {
    title: 'Watch settings',
    render: () => createElement(WatchSettingsRow),
  }),
  custom('accounts.google', at('Accounts'), ['google', 'calendar', 'tasks', 'link'], {
    title: 'Google',
    render: () => createElement(GoogleRow),
  }),
  choose(
    'ai.briefing',
    at('AI'),
    {
      title: 'Morning briefing',
      icon: 'sparkles',
      get: (prefs) => prefs.ai.briefing,
      set: (briefing) => ({ ai: { briefing: picked(PLANNER_BRIEFINGS, briefing) } }),
      options: BRIEFING_OPTIONS,
    },
    ['ai', 'briefing', 'morning'],
  ),
  toggle(
    'ai.evening',
    at('AI'),
    {
      title: 'Evening review',
      icon: 'moon',
      get: (prefs) => prefs.ai.evening_review,
      set: (on) => ({ ai: { evening_review: on } }),
    },
    ['ai', 'evening', 'review'],
  ),
  toggle(
    'ai.plans',
    at('AI'),
    {
      title: 'Plan suggestions',
      icon: 'sparkles',
      get: (prefs) => prefs.ai.plan_suggestions,
      set: (on) => ({ ai: { plan_suggestions: on } }),
    },
    ['ai', 'plan', 'suggestions', 'proposals'],
  ),
];
