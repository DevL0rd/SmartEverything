import type { FlowType } from '../automation-v3/types';
import {
  PLANNER_SIGNAL_KINDS,
  PLANNER_SIGNAL_SOURCE,
  type PlannerSignalKind,
} from '../planner/signals';
import { defineNodeKind, type InputPortDecl, type NodeKind } from './define';
import { ERROR_OUT } from './error-port';
import { AT, ANY_RECORD, input, output, ref, trigger } from './trigger-parts';
import type { MatcherMapping } from './triggers-device';

const TEXT: FlowType = { t: 'text' };
const BOOLEAN: FlowType = { t: 'boolean' };
const INSTANT: FlowType = { t: 'instant' };
const DURATION: FlowType = { t: 'duration' };
const MINUTES: FlowType = { t: 'number', integer: true, min: 1 };
const WEEKDAYS: FlowType = { t: 'list', of: { t: 'number', integer: true, min: 0, max: 6 } };

const MILLISECONDS_PER_SECOND = 1000;

export const PLANNER_EVENT_LABELS: Readonly<Record<PlannerSignalKind, string>> = {
  task_due: 'A task is due',
  task_missed: 'A task was missed',
  task_done: 'A task was done',
  alarm_rang: 'An alarm rang',
  alarm_dismissed: 'An alarm was dismissed',
  alarm_snoozed: 'An alarm was snoozed',
  timer_done: 'A timer finished',
  event_starting: 'An event is starting',
};

const PLANNER_EVENT_TYPE: FlowType = {
  t: 'choice',
  options: PLANNER_SIGNAL_KINDS.map((id) => ({ id, label: PLANNER_EVENT_LABELS[id] })),
};

export const PLANNER_MATCHER_MAPPINGS: Readonly<Record<string, MatcherMapping>> = {
  'trigger.planner': {
    variantPort: 'event',
    defaultVariant: 'task_due',
    variants: Object.fromEntries(
      PLANNER_SIGNAL_KINDS.map((kind) => [kind, { source: PLANNER_SIGNAL_SOURCE, kind }]),
    ),
    subjectPort: null,
    fieldPort: null,
    matchPorts: { title: 'title', label: 'label' },
    runtimePorts: [],
  },
};

const PLANNER_TRIGGER = trigger({
  tier: 'v1.1',
  id: 'trigger.planner',
  name: 'Planner event',
  icon: 'calendar-check',
  description:
    'Starts when something in the planner happens: a task falls due, is missed or is done, an alarm rings, is dismissed or snoozed, a timer finishes, or an event is about to start. Fill in a title to react to one task or event only, or a label for one alarm or timer; leave both empty for every one in the home.',
  inputs: [
    input('event', PLANNER_EVENT_TYPE, 'What happened in the planner.', {
      default: 'task_due',
      summary: true,
    }),
    input('title', TEXT, 'Only the task or event with exactly this title.', {
      ui: { label: 'Title' },
    }),
    input('label', TEXT, 'Only the alarm or timer with exactly this label.', {
      ui: { label: 'Label' },
    }),
  ],
  outputs: [
    output('kind', PLANNER_EVENT_TYPE, 'What happened.'),
    output('data', ANY_RECORD, 'What the planner reported: ids, the title or label and the times.'),
    AT,
  ],
  summary: 'When the planner reports {event}',
  keywords: [
    'planner',
    'task',
    'todo',
    'reminder',
    'alarm',
    'timer',
    'event',
    'calendar',
    'due',
    'missed',
    'wake',
  ],
});

const PERSON_INPUT: InputPortDecl = {
  name: 'person',
  type: ref('person'),
  required: false,
  description: 'Whose planner. Leave empty for the person the automation belongs to.',
  ui: { label: 'Person' },
};

const ADD_TASK = defineNodeKind({
  id: 'planner.add_task',
  name: 'Add task',
  category: 'time',
  icon: 'list-plus',
  class: 'effect',
  description:
    'Adds a task to a person’s planner, with an optional note, due moment, priority and time estimate. The task id comes out so a later step can complete it. Adding the same title twice makes two tasks.',
  inputs: [
    {
      name: 'title',
      type: TEXT,
      required: true,
      live: true,
      description: 'What has to be done.',
      summary: true,
      ui: { label: 'Task' },
    },
    PERSON_INPUT,
    {
      name: 'notes',
      type: TEXT,
      required: false,
      live: true,
      description: 'More detail about the task.',
      ui: { label: 'Notes' },
    },
    {
      name: 'due',
      type: INSTANT,
      required: false,
      live: true,
      description: 'When it is due. Leave empty for a task without a due moment.',
      ui: { label: 'Due' },
    },
    {
      name: 'priority',
      type: {
        t: 'choice',
        options: [
          { id: '1', label: 'High' },
          { id: '2', label: 'Medium' },
          { id: '3', label: 'Low' },
        ],
      },
      required: false,
      static: true,
      description: 'How important it is. Leave empty for no priority.',
      ui: { label: 'Priority' },
    },
    {
      name: 'estimate',
      type: DURATION,
      required: false,
      static: true,
      description: 'How long it takes, in whole minutes.',
      ui: { label: 'Takes', unit: 'ms', min: 60 * MILLISECONDS_PER_SECOND, editor: 'duration' },
    },
  ],
  outputs: [{ name: 'itemId', type: TEXT, description: 'The id of the new task.' }, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Add task {title}',
  keywords: ['planner', 'task', 'todo', 'add', 'create', 'remind', 'reminder', 'list'],
  access: 'member',
  tier: 'v1.1',
});

const COMPLETE_TASK = defineNodeKind({
  id: 'planner.complete_task',
  name: 'Complete task',
  category: 'time',
  icon: 'list-checks',
  class: 'effect',
  description:
    'Marks a task in the planner as done, by the id a planner trigger or Add task gave. Completing a task that is already done changes nothing. For a repeating task it completes the occurrence that is due now.',
  inputs: [
    {
      name: 'itemId',
      type: TEXT,
      required: true,
      live: true,
      description: 'The id of the task.',
      summary: true,
      ui: { label: 'Task' },
    },
    PERSON_INPUT,
  ],
  outputs: [{ name: 'ok', type: BOOLEAN, description: 'Whether the task is done.' }, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Complete task {itemId}',
  keywords: ['planner', 'task', 'todo', 'complete', 'done', 'finish', 'check'],
  access: 'member',
  tier: 'v1.1',
});

const START_TIMER = defineNodeKind({
  id: 'planner.start_timer',
  name: 'Start timer',
  category: 'time',
  icon: 'timer',
  class: 'effect',
  description:
    'Starts a countdown timer in a person’s planner. It rings on the person’s phones and chosen devices when it finishes, and the planner reports that it finished. Starting it twice makes two timers.',
  inputs: [
    {
      name: 'duration',
      type: DURATION,
      required: true,
      live: true,
      description: 'How long the timer runs.',
      summary: true,
      ui: { label: 'Duration', unit: 'ms', min: MILLISECONDS_PER_SECOND, editor: 'duration' },
    },
    {
      name: 'label',
      type: TEXT,
      required: false,
      live: true,
      description: 'What the timer is for, shown when it rings.',
      summary: true,
      ui: { label: 'Label' },
    },
    PERSON_INPUT,
  ],
  outputs: [
    { name: 'timerId', type: TEXT, description: 'The id of the running timer.' },
    { name: 'endsAt', type: INSTANT, description: 'When the timer will finish.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Start a {duration} timer',
  keywords: ['planner', 'timer', 'countdown', 'start', 'kitchen', 'minutes'],
  access: 'member',
  tier: 'v1.1',
});

const SET_ALARM = defineNodeKind({
  id: 'planner.set_alarm',
  name: 'Set alarm',
  category: 'time',
  icon: 'alarm-clock',
  class: 'effect',
  description:
    'Sets an alarm in a person’s planner for a time of day. Choose weekdays to repeat it, or leave them empty to ring once at the next time that comes round. It rings on the person’s phones and chosen devices.',
  inputs: [
    {
      name: 'at',
      type: { t: 'timeOfDay' },
      required: true,
      live: true,
      description: 'The time of day it rings.',
      summary: true,
      ui: { label: 'Time', editor: 'time-of-day' },
    },
    {
      name: 'days',
      type: WEEKDAYS,
      required: false,
      static: true,
      description: 'Weekdays it repeats on, 0 is Sunday. Empty rings once.',
      ui: { label: 'Repeat on', editor: 'week-grid' },
    },
    {
      name: 'label',
      type: TEXT,
      required: false,
      live: true,
      description: 'What the alarm is for, shown when it rings.',
      ui: { label: 'Label' },
    },
    {
      name: 'snooze',
      type: MINUTES,
      required: false,
      static: true,
      description: 'Minutes a snooze lasts. Leave empty for the person’s default.',
      ui: { label: 'Snooze minutes', unit: 'min', min: 1 },
    },
    PERSON_INPUT,
  ],
  outputs: [
    { name: 'alarmId', type: TEXT, description: 'The id of the alarm.' },
    { name: 'nextAt', type: INSTANT, description: 'When it rings next.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects', mode: 'wait_for_result' },
  summary: 'Set an alarm for {at}',
  keywords: ['planner', 'alarm', 'wake', 'clock', 'set', 'morning', 'ring'],
  access: 'member',
  tier: 'v1.1',
});

export const PLANNER_KINDS: readonly NodeKind[] = [
  PLANNER_TRIGGER,
  ADD_TASK,
  COMPLETE_TASK,
  START_TIMER,
  SET_ALARM,
];
