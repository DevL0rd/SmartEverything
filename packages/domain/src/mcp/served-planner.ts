import type { Served } from './served-types';

export const PLANNER_READ_VIEWS = [
  'day',
  'range',
  'tasks',
  'item',
  'alarms',
  'timers',
  'stats',
  'free_slots',
  'google_status',
] as const;

export const PLANNER_EDIT_ACTIONS = [
  'add',
  'update',
  'complete',
  'skip',
  'move',
  'remove',
  'propose',
  'alarm_set',
  'alarm_remove',
  'timer_start',
  'timer_stop',
  'stopwatch',
] as const;

export const SERVED_PLANNER = [
  {
    name: 'planner_read',
    area: 'planner',
    access: 'read',
    title: 'Read the planner',
    line: 'Day, calendar, tasks, alarms, timers and stats',
    description:
      'A person’s planner (personId from person_read; you when left out): view day gives what is missed, now, next and done, range the events and tasks between two dates, tasks the open tasks, item one task or event, alarms and timers what is set, stats the totals over a range, free_slots the gaps that fit a length of time, google_status the linked Google account. Returns ids planner_edit takes.',
    route: { custom: true },
  },
  {
    name: 'planner_edit',
    area: 'planner',
    access: 'control',
    title: 'Edit the planner',
    line: 'Tasks, events, alarms, timers and the stopwatch',
    description:
      'Changes a person’s planner (personId from person_read; you when left out): add, update, move, skip, complete or remove a task or event, propose drafts the person accepts or rejects, set or remove an alarm, start or stop a timer, or run the stopwatch. Use it for timers, alarms and reminders. Ids come from planner_read.',
    route: { custom: true },
  },
] as const satisfies readonly Served[];
