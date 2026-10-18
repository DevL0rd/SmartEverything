import { HC_CODES } from '@smarteverything/domain';
import { exerciseChoices } from './exercise-types';
import { NOTES, TITLE, choicesOf, temperature, type LogForm } from './form-kit';

const SESSIONS: readonly LogForm[] = [
  {
    type: 'ExerciseSession',
    title: 'Workout',
    icon: 'dumbbell',
    group: 'Activity & rest',
    timing: 'duration',
    minutes: 30,
    fields: [
      {
        kind: 'choice',
        key: 'exerciseType',
        label: 'Kind',
        options: exerciseChoices(),
        initial: 0,
      },
      TITLE,
      NOTES,
    ],
    fixed: { plannedExerciseSessionId: null, segments: [], laps: [], route: { status: 'absent' } },
  },
  {
    type: 'SleepSession',
    title: 'Sleep',
    icon: 'moon',
    group: 'Activity & rest',
    timing: 'span',
    minutes: 480,
    fields: [NOTES],
    fixed: { title: null, stages: [] },
  },
  {
    type: 'MindfulnessSession',
    title: 'Mindfulness',
    icon: 'brain',
    group: 'Activity & rest',
    timing: 'duration',
    minutes: 10,
    fields: [
      {
        kind: 'choice',
        key: 'mindfulnessSessionType',
        label: 'Kind',
        options: choicesOf(HC_CODES.mindfulnessType),
        initial: 1,
      },
      NOTES,
    ],
    fixed: { title: null },
  },
];

const CYCLE: readonly LogForm[] = [
  {
    type: 'MenstruationFlow',
    title: 'Period flow',
    icon: 'flower',
    group: 'Cycle',
    timing: 'instant',
    fields: [
      {
        kind: 'choice',
        key: 'flow',
        label: 'Flow',
        options: choicesOf(HC_CODES.flow),
        initial: 2,
      },
    ],
  },
  {
    type: 'MenstruationPeriod',
    title: 'Period',
    icon: 'flower',
    group: 'Cycle',
    timing: 'span',
    minutes: 5 * 24 * 60,
    fields: [],
  },
  {
    type: 'IntermenstrualBleeding',
    title: 'Spotting',
    icon: 'droplet',
    group: 'Cycle',
    timing: 'instant',
    fields: [],
  },
  {
    type: 'CervicalMucus',
    title: 'Cervical mucus',
    icon: 'droplet',
    group: 'Cycle',
    timing: 'instant',
    fields: [
      {
        kind: 'choice',
        key: 'appearance',
        label: 'Appearance',
        options: choicesOf(HC_CODES.mucusAppearance),
        initial: 0,
      },
      {
        kind: 'choice',
        key: 'sensation',
        label: 'Sensation',
        options: choicesOf(HC_CODES.sensation),
        initial: 0,
      },
    ],
  },
  {
    type: 'OvulationTest',
    title: 'Ovulation test',
    icon: 'flower',
    group: 'Cycle',
    timing: 'instant',
    fields: [
      {
        kind: 'choice',
        key: 'result',
        label: 'Result',
        options: choicesOf(HC_CODES.ovulationResult),
        initial: 3,
      },
    ],
  },
  temperature('BasalBodyTemperature', 'Basal temperature', 'Cycle'),
  {
    type: 'SexualActivity',
    title: 'Sexual activity',
    icon: 'flower',
    group: 'Cycle',
    timing: 'instant',
    fields: [
      {
        kind: 'choice',
        key: 'protectionUsed',
        label: 'Protection',
        options: choicesOf(HC_CODES.protection),
        initial: 0,
      },
    ],
  },
];

export const SESSION_FORMS: readonly LogForm[] = [...SESSIONS, ...CYCLE];
