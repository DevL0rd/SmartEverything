import { exerciseChoices } from './exercise-types';
import { NOTES, TITLE, choices, temperature, type LogForm } from './form-kit';

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
        options: exerciseChoices().map((kind) => ({ value: kind.code, label: kind.name })),
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
        options: [
          { value: 1, label: 'Meditation' },
          { value: 3, label: 'Breathing' },
          { value: 4, label: 'Music' },
          { value: 5, label: 'Movement' },
          { value: 6, label: 'Unguided' },
          { value: 2, label: 'Other' },
        ],
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
        options: choices('Not set', 'Light', 'Medium', 'Heavy'),
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
        options: choices('Not set', 'Dry', 'Sticky', 'Creamy', 'Watery', 'Egg white', 'Unusual'),
        initial: 0,
      },
      {
        kind: 'choice',
        key: 'sensation',
        label: 'Sensation',
        options: choices('Not set', 'Light', 'Medium', 'Heavy'),
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
        options: choices('Positive', 'High', 'Negative', 'Inconclusive'),
        initial: 2,
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
        options: choices('Not set', 'Protected', 'Unprotected'),
        initial: 0,
      },
    ],
  },
];

export const SESSION_FORMS: readonly LogForm[] = [...SESSIONS, ...CYCLE];
