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
  'search',
  'sharing',
  'guests',
  'feeds',
  'booking_pages',
  'bedtime',
  'sleep',
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
  'share',
  'unshare',
  'guests_set',
  'rsvp',
  'feed_add',
  'feed_refresh',
  'import_ics',
  'export_link',
  'booking_page_set',
  'booking_page_remove',
  'bedtime_set',
  'sleep_sound',
] as const;

export const SERVED_PLANNER = [
  {
    name: 'planner_read',
    area: 'planner',
    access: 'read',
    title: 'Read the planner',
    line: 'Calendar, tasks, alarms, bedtime and sharing',
    description:
      'A person’s planner (personId from person_read; you when left out): view day gives what is missed, now and next, range the events and tasks between two dates, tasks the open ones, item one with its steps, search finds events by words, guests the invited, sharing the shared calendars, feeds subscriptions and feed addresses, booking_pages, alarms, timers, bedtime, sleep, stats, free_slots and google_status. Returns ids planner_edit takes.',
    route: { custom: true },
  },
  {
    name: 'planner_edit',
    area: 'planner',
    access: 'control',
    title: 'Edit the planner',
    line: 'Tasks, events, guests, sharing, alarms and bedtime',
    description:
      'Changes a person’s planner (personId from person_read; you when left out): add, update, move, skip, complete or remove a task or event, assign a task with update, propose drafts the person accepts or rejects, guests_set, rsvp, share or unshare a calendar, feed_add, feed_refresh, import_ics, export_link, booking_page_set, booking_page_remove, bedtime_set, sleep_sound, set an alarm, start a timer or run the stopwatch. Use it for timers, alarms and reminders. Ids come from planner_read.',
    route: { custom: true },
  },
] as const satisfies readonly Served[];
