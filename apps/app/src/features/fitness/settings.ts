import { createElement } from 'react';
import {
  FITNESS_GOAL_KEYS,
  FITNESS_GOAL_LIMITS,
  UNSET_FITNESS_GOALS,
  effectiveFitnessGoals,
  type FitnessGoalKey,
} from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import type { SettingDefinition, SettingEnv, StepperSetting } from '../../settings/types';
import { activeProfileIn } from '../../store/people';
import { writeFitnessSettings } from './data/settings-write';
import { goalText } from './model/goals';
import { AppsRows } from './settings-rows/apps-rows';
import { HealthConnectRows } from './settings-rows/health-connect-rows';
import { HealthInfoRow } from './settings-rows/health-info-row';
import { MaxHeartRateRow } from './settings-rows/max-heart-rate-row';
import { PhonesRows } from './settings-rows/phones-rows';
import { ScaleWritesRow } from './settings-rows/scale-writes-row';
import { SyncIntervalRow } from './settings-rows/sync-interval-row';

const onAndroid = (env: SettingEnv): boolean => env.platform === 'android';
const elsewhere = (env: SettingEnv): boolean => env.platform !== 'android';

const GOAL_KEYWORDS: Readonly<Record<FitnessGoalKey, readonly string[]>> = {
  steps: ['steps', 'walking', 'goal'],
  move_kcal: ['move', 'calories', 'kcal', 'goal'],
  active_minutes: ['exercise', 'active', 'minutes', 'goal'],
  sleep_minutes: ['sleep', 'bedtime', 'goal'],
  hydration_ml: ['water', 'hydration', 'drink', 'goal'],
};

const STANDARD_GOALS = FITNESS_GOAL_KEYS.map((key) =>
  goalText(key, FITNESS_GOAL_LIMITS[key].standard),
).join(', ');

function goalSetting(key: FitnessGoalKey): StepperSetting {
  const limit = FITNESS_GOAL_LIMITS[key];
  return {
    id: `fitness-goal-${key}`,
    page: 'health/goals',
    title: limit.label,
    keywords: GOAL_KEYWORDS[key],
    scope: 'server',
    control: 'stepper',
    min: limit.min,
    max: limit.max,
    step: limit.step,
    format: (value) => goalText(key, value),
    read: (state) =>
      effectiveFitnessGoals(activeProfileIn(state)?.fitness_goals ?? UNSET_FITNESS_GOALS)[key],
    write: (value, { store }) => writeFitnessSettings(store, { goals: { [key]: value } }),
  };
}

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'health.browse',
    page: 'health',
    section: 'Health data',
    title: 'All health data',
    icon: 'list',
    keywords: ['browse', 'records', 'all health data'],
    scope: 'server',
    control: 'link',
    href: href.fitnessPage('browse'),
  },
  {
    id: 'health.log',
    page: 'health',
    section: 'Health data',
    title: 'Log health data',
    icon: 'plus',
    keywords: ['log', 'add', 'manual', 'record', 'measurement'],
    scope: 'server',
    control: 'link',
    href: href.logHealth(),
  },
  {
    id: 'health-connect',
    page: 'health',
    section: 'This phone',
    title: 'Health Connect',
    keywords: ['health connect', 'connect', 'permissions', 'sync now'],
    scope: 'device',
    visible: onAndroid,
    control: 'custom',
    row: true,
    render: () => createElement(HealthConnectRows),
  },
  {
    id: 'health-sync-interval',
    page: 'health',
    section: 'This phone',
    title: 'Background sync',
    keywords: ['background', 'sync', 'interval', 'health connect'],
    scope: 'client',
    visible: onAndroid,
    control: 'custom',
    row: true,
    render: () => createElement(SyncIntervalRow),
  },
  {
    id: 'health-scale-writes',
    page: 'health',
    section: 'This phone',
    title: 'Save weigh-ins to Health Connect',
    keywords: ['scale', 'weigh-in', 'weight', 'health connect'],
    scope: 'device',
    visible: onAndroid,
    control: 'custom',
    row: true,
    render: () => createElement(ScaleWritesRow),
  },
  {
    id: 'health-sync-status',
    page: 'health',
    title: 'Health Connect',
    keywords: ['health connect', 'sync', 'phone'],
    scope: 'server',
    visible: elsewhere,
    control: 'custom',
    row: true,
    render: () => createElement(HealthInfoRow),
  },
  {
    id: 'health-max-heart-rate',
    page: 'health',
    section: 'Heart',
    title: 'Max heart rate',
    keywords: ['heart rate', 'zones', 'max', 'bpm'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(MaxHeartRateRow),
  },
  ...FITNESS_GOAL_KEYS.map(goalSetting),
  {
    id: 'fitness-goals-reset',
    page: 'health/goals',
    title: 'Use standard goals',
    icon: 'reset',
    keywords: ['reset', 'goals', 'standard'],
    scope: 'server',
    control: 'action',
    confirm: {
      title: 'Use standard goals?',
      body: STANDARD_GOALS,
      confirmLabel: 'Use standard goals',
    },
    run: ({ store }) => writeFitnessSettings(store, { goals: UNSET_FITNESS_GOALS }),
  },
  {
    id: 'health-phones',
    page: 'health/sources',
    section: 'Phones',
    title: 'Phones',
    keywords: ['phones', 'sources', 'stop syncing'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(PhonesRows),
  },
  {
    id: 'health-apps',
    page: 'health/sources',
    section: 'Apps',
    title: 'Apps',
    keywords: ['apps', 'mi fitness', 'sources', 'fitbit'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(AppsRows),
  },
];
