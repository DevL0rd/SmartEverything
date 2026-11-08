import { createElement } from 'react';
import {
  PLANNER_FADE_STRENGTHS,
  PLANNER_MISSED_SCOPES,
  PLANNER_SMART_LISTS,
} from '@smarteverything/domain';
import type { SettingDefinition } from '../../../settings/types';
import { at, choose, custom, link, subHref, toggle } from './define';
import {
  FADE_OPTIONS,
  MISSED_OPTIONS,
  NONE,
  WEEK_OPTIONS,
  idOrNull,
  picked,
  shownCount,
  spanText,
} from './options';
import { DefaultListRow, ShownPersonRow } from './source-rows';

export const GENERAL: readonly SettingDefinition[] = [
  choose(
    'general.week-start',
    at('General'),
    {
      title: 'Week starts on',
      icon: 'calendar',
      get: (prefs) => String(prefs.general.week_start),
      set: (day) => ({ general: { week_start: Number(day) } }),
      options: WEEK_OPTIONS,
    },
    ['week', 'first day', 'monday', 'sunday'],
  ),
  link(
    'general.day',
    at('General'),
    {
      title: 'Day runs',
      icon: 'sun',
      href: subHref('day'),
      value: (prefs) => spanText(prefs.general.day_start, prefs.general.day_end),
    },
    ['day start', 'day end', 'morning', 'bedtime'],
  ),
  link(
    'general.working-hours',
    at('General'),
    {
      title: 'Working hours',
      icon: 'clock',
      href: subHref('working-hours'),
      value: (prefs) =>
        spanText(prefs.general.working_hours.start, prefs.general.working_hours.end),
    },
    ['work', 'office', 'work days'],
  ),
  custom(
    'general.shown',
    { ...at('General'), visible: (env) => env.owner },
    ['person', 'family', 'default person'],
    {
      title: 'Shown when Planner opens',
      render: () =>
        createElement(ShownPersonRow, {
          spec: {
            title: 'Shown when Planner opens',
            icon: 'user',
            description: 'Owner only',
            get: (prefs) => prefs.general.shown_profile_id ?? NONE,
            set: (id) => ({ general: { shown_profile_id: idOrNull(id) } }),
          },
        }),
    },
  ),
];

export const DAY_PLANNER: readonly SettingDefinition[] = [
  choose(
    'day.fade',
    at('Day planner'),
    {
      title: 'Fade later items',
      icon: 'eye',
      get: (prefs) => prefs.day_planner.fade,
      set: (fade) => ({ day_planner: { fade: picked(PLANNER_FADE_STRENGTHS, fade) } }),
      options: FADE_OPTIONS,
    },
    ['fade', 'dim', 'later'],
  ),
  toggle(
    'day.happened',
    at('Day planner'),
    {
      title: 'Show what happened',
      icon: 'washer',
      description: 'Device sessions with no task',
      get: (prefs) => prefs.day_planner.show_happened,
      set: (on) => ({ day_planner: { show_happened: on } }),
    },
    ['happened', 'device sessions', 'evidence'],
  ),
  toggle(
    'day.sleep',
    at('Day planner'),
    {
      title: 'Sleep from the watch',
      icon: 'moon',
      get: (prefs) => prefs.day_planner.show_sleep,
      set: (on) => ({ day_planner: { show_sleep: on } }),
    },
    ['sleep', 'watch', 'sleep band'],
  ),
  toggle(
    'day.weather',
    at('Day planner'),
    {
      title: 'Weather',
      icon: 'cloud',
      get: (prefs) => prefs.day_planner.show_weather,
      set: (on) => ({ day_planner: { show_weather: on } }),
    },
    ['weather', 'forecast'],
  ),
  choose(
    'day.missed',
    at('Day planner'),
    {
      title: 'Missed items',
      icon: 'undo',
      get: (prefs) => prefs.day_planner.missed_scope,
      set: (scope) => ({ day_planner: { missed_scope: picked(PLANNER_MISSED_SCOPES, scope) } }),
      options: MISSED_OPTIONS,
    },
    ['missed', 'catch up', 'overdue'],
  ),
];

export const TASKS: readonly SettingDefinition[] = [
  custom('tasks.default-list', at('Tasks'), ['list', 'inbox', 'default'], {
    title: 'New tasks go to',
    render: () =>
      createElement(DefaultListRow, {
        spec: {
          title: 'New tasks go to',
          icon: 'listCheck',
          get: (prefs) => prefs.tasks.default_collection_id ?? NONE,
          set: (id) => ({ tasks: { default_collection_id: idOrNull(id) } }),
        },
      }),
  }),
  link(
    'tasks.smart-lists',
    at('Tasks'),
    {
      title: 'Smart lists shown',
      icon: 'list',
      href: subHref('smart-lists'),
      value: (prefs) => shownCount(prefs.tasks.smart_lists.length, PLANNER_SMART_LISTS.length),
    },
    ['smart lists', 'today', 'upcoming', 'habits', 'someday'],
  ),
  toggle(
    'tasks.suggest',
    at('Tasks'),
    {
      title: 'Suggest device checks',
      icon: 'zap',
      description: 'Offers a device rule when the title matches',
      get: (prefs) => prefs.tasks.suggest_completion,
      set: (on) => ({ tasks: { suggest_completion: on } }),
    },
    ['suggest', 'completion', 'device rule', 'automatic'],
  ),
];
