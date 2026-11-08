import { createElement } from 'react';
import { PLANNER_SMART_LISTS } from '@smarteverything/domain';
import type { SettingDefinition } from '../../../settings/types';
import { custom, sub, time, toggle } from './define';
import {
  CALENDAR_SHOWS,
  DAY_NAMES,
  SMART_LIST_LABELS,
  type CalendarShowKey,
  type SmartList,
} from './options';
import type { Prefs } from './preferences';
import { CalendarRows, RingOnRows } from './source-rows';

function smartListRow(list: SmartList): SettingDefinition {
  return toggle(
    `smart-lists.${list}`,
    sub('smart-lists'),
    {
      title: SMART_LIST_LABELS[list],
      icon: 'list',
      get: (prefs) => prefs.tasks.smart_lists.includes(list),
      set: (on, prefs) => ({
        tasks: {
          smart_lists: PLANNER_SMART_LISTS.filter((entry) =>
            entry === list ? on : prefs.tasks.smart_lists.includes(entry),
          ),
        },
      }),
    },
    ['smart lists', SMART_LIST_LABELS[list].toLowerCase()],
  );
}

function workDayRow(name: string, day: number): SettingDefinition {
  return toggle(
    `working-hours.day-${String(day)}`,
    sub('working-hours', 'Days'),
    {
      title: name,
      icon: 'calendar',
      get: (prefs) => prefs.general.working_hours.days.includes(day),
      set: (on, prefs) => {
        const hours = prefs.general.working_hours;
        const days = Array.from(DAY_NAMES.keys()).filter((entry) =>
          entry === day ? on : hours.days.includes(entry),
        );
        return { general: { working_hours: { ...hours, days } } };
      },
    },
    ['work days', name.toLowerCase()],
  );
}

const DAY_ROWS: readonly SettingDefinition[] = [
  time(
    'day.start',
    sub('day'),
    {
      title: 'Starts',
      icon: 'sunrise',
      get: (prefs) => prefs.general.day_start,
      set: (start) => ({ general: { day_start: start } }),
    },
    ['day start', 'morning'],
  ),
  time(
    'day.end',
    sub('day'),
    {
      title: 'Ends',
      icon: 'moon',
      get: (prefs) => prefs.general.day_end,
      set: (end) => ({ general: { day_end: end } }),
    },
    ['day end', 'bedtime'],
  ),
];

const WORKING_HOURS_ROWS: readonly SettingDefinition[] = [
  time(
    'working-hours.start',
    sub('working-hours', 'Hours'),
    {
      title: 'Starts',
      icon: 'clock',
      get: (prefs) => prefs.general.working_hours.start,
      set: (start, prefs) => ({
        general: { working_hours: { ...prefs.general.working_hours, start } },
      }),
    },
    ['work start'],
  ),
  time(
    'working-hours.end',
    sub('working-hours', 'Hours'),
    {
      title: 'Ends',
      icon: 'clock',
      get: (prefs) => prefs.general.working_hours.end,
      set: (end, prefs) => ({
        general: { working_hours: { ...prefs.general.working_hours, end } },
      }),
    },
    ['work end'],
  ),
  ...DAY_NAMES.map(workDayRow),
];

function calendarShown(key: CalendarShowKey, on: boolean): Partial<Prefs['calendar']> {
  switch (key) {
    case 'show_tasks':
      return { show_tasks: on };
    case 'show_alarms':
      return { show_alarms: on };
    case 'show_sleep':
      return { show_sleep: on };
    case 'show_free_time':
      return { show_free_time: on };
  }
}

const CALENDAR_SHOW_ROWS: readonly SettingDefinition[] = CALENDAR_SHOWS.map((show) =>
  toggle(
    `calendar-show.${show.key}`,
    sub('calendar-show'),
    {
      title: show.title,
      icon: show.icon,
      get: (prefs) => prefs.calendar[show.key],
      set: (on) => ({ calendar: calendarShown(show.key, on) }),
    },
    ['show on the calendar', show.title.toLowerCase()],
  ),
);

export const PLANNER_SUBPAGE_SETTINGS: readonly SettingDefinition[] = [
  ...DAY_ROWS,
  ...WORKING_HOURS_ROWS,
  ...PLANNER_SMART_LISTS.map(smartListRow),
  custom('calendars.list', sub('calendars'), ['calendars', 'visibility'], {
    title: 'Calendars',
    render: () => createElement(CalendarRows),
  }),
  ...CALENDAR_SHOW_ROWS,
  custom('ring-on.phones', sub('ring-on'), ['ring', 'phone', 'targets'], {
    title: 'Phones',
    render: () => createElement(RingOnRows),
  }),
];
