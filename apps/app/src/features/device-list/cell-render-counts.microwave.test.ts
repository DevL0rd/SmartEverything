import { MICROWAVE_KEYS, type DeviceCapability } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceValues, StoreState } from '../../store/state';
import {
  budgetCase,
  renderVisual,
  useCellEnvironment,
  type Budget,
  type Face,
  type Spec,
} from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const DEVICE = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-16T08:00:00.000Z';
const LAMP = 'raw:samsungce.lamp.brightness_level';

const TIME = { min: '00:00:10', max: '01:00:00', default: '00:01:00', resolution: '00:00:10' };
const SPECIFICATION = {
  single: [
    {
      mode: 'MicroWave',
      supportedOperations: ['set', 'stop'],
      supportedOptions: {
        operationTime: TIME,
        powerLevel: { default: '700W', supportedValues: ['100W', '450W', '700W', '900W'] },
      },
    },
    {
      mode: 'Convection',
      supportedOperations: ['start', 'set', 'stop'],
      supportedOptions: {
        operationTime: TIME,
        temperature: { C: { min: 40, max: 200, default: 180, resolution: 5 } },
      },
    },
    {
      mode: 'AirFryer',
      supportedOperations: ['start', 'set', 'stop'],
      supportedOptions: {
        operationTime: TIME,
        temperature: { C: { min: 100, max: 200, default: 180, resolution: 5 } },
      },
    },
  ],
};

const TEXT: DeviceCapability['value'] = { kind: 'text', maxLength: 80 };
const KEYS: readonly DeviceCapability['key'][] = [
  MICROWAVE_KEYS.mode,
  MICROWAVE_KEYS.power,
  MICROWAVE_KEYS.temperature,
  MICROWAVE_KEYS.state,
  MICROWAVE_KEYS.job,
  MICROWAVE_KEYS.duration,
  MICROWAVE_KEYS.progress,
  MICROWAVE_KEYS.door,
  MICROWAVE_KEYS.lock,
  MICROWAVE_KEYS.remote,
  LAMP,
];
const SPECS: readonly Spec[] = KEYS.map((key): Spec => [key, TEXT]);

function seeded(state: StoreState): StoreState {
  const known: DeviceValues = state.deviceValues.get(DEVICE) ?? {};
  const extra: DeviceValues = {
    [MICROWAVE_KEYS.specification]: { value: SPECIFICATION, observedAt: AT },
    [MICROWAVE_KEYS.supportedModes]: {
      value: ['MicroWave', 'Convection', 'AirFryer'],
      observedAt: AT,
    },
    [MICROWAVE_KEYS.supportedPower]: {
      value: ['100W', '450W', '700W', '900W'],
      observedAt: AT,
    },
  };
  return { ...state, deviceValues: state.deviceValues.set(DEVICE, { ...known, ...extra }) };
}

const IDLE_VALUES = {
  [MICROWAVE_KEYS.state]: 'ready',
  [MICROWAVE_KEYS.mode]: 'AirFryer',
  [MICROWAVE_KEYS.remote]: 'true',
  [MICROWAVE_KEYS.door]: 'closed',
  [MICROWAVE_KEYS.lock]: 'unlocked',
  [LAMP]: 'off',
};

const COOKING_VALUES = {
  ...IDLE_VALUES,
  [MICROWAVE_KEYS.state]: 'running',
  [MICROWAVE_KEYS.mode]: 'Convection',
  [MICROWAVE_KEYS.temperature]: 180,
  [MICROWAVE_KEYS.duration]: '00:06:00',
  [MICROWAVE_KEYS.progress]: 30,
};

const IDLE: Face = {
  name: 'microwave idle',
  kind: 'appliance',
  model: 'oven',
  specs: SPECS,
  values: IDLE_VALUES,
  shown: [LAMP, 'high'],
  seed: seeded,
};

const COOKING: Face = {
  name: 'microwave cooking',
  kind: 'appliance',
  model: 'oven',
  specs: SPECS,
  values: COOKING_VALUES,
  shown: [MICROWAVE_KEYS.progress, 40],
  seed: seeded,
};

const BUDGETS: Readonly<Record<string, Readonly<Record<'S' | 'M', Budget>>>> = {
  'microwave idle': {
    S: { nodes: 37, hooks: 80, subscriptions: 11 },
    M: { nodes: 67, hooks: 90, subscriptions: 11 },
  },
  'microwave cooking': {
    S: { nodes: 38, hooks: 90, subscriptions: 13 },
    M: { nodes: 82, hooks: 109, subscriptions: 15 },
  },
};

function budgetOf(name: string): Readonly<Record<'S' | 'M', Budget>> {
  const budget = BUDGETS[name];
  if (budget === undefined) throw new Error(`Expected a budget for ${name}`);
  return budget;
}

budgetCase(IDLE.name, IDLE, budgetOf(IDLE.name));
budgetCase(COOKING.name, COOKING, budgetOf(COOKING.name));

const VISUAL_STATES: readonly (readonly [
  string,
  Readonly<Record<string, number | boolean | string>>,
])[] = [
  ['idle', IDLE_VALUES],
  ['cooking convection', COOKING_VALUES],
  ['cooking grill', { ...COOKING_VALUES, [MICROWAVE_KEYS.mode]: 'Grill' }],
  ['cooking microwave', { ...COOKING_VALUES, [MICROWAVE_KEYS.mode]: 'MicroWave' }],
  ['cooking freshen', { ...COOKING_VALUES, [MICROWAVE_KEYS.mode]: 'Deodorization' }],
  ['paused', { ...COOKING_VALUES, [MICROWAVE_KEYS.state]: 'paused' }],
  ['door open', { ...IDLE_VALUES, [MICROWAVE_KEYS.door]: 'open' }],
  ['finished', { ...IDLE_VALUES, [MICROWAVE_KEYS.job]: 'finished' }],
];

const VISUAL_LIMITS = [
  ['tile', 48, 35],
  ['card', 96, 60],
  ['hero', 220, 90],
] as const;

describe('microwave visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_LIMITS) {
    for (const [name, values] of VISUAL_STATES) {
      it(`draws ${name} within ${String(limit)} nodes at ${size} size`, () => {
        const { count } = renderVisual(IDLE, values, size, px);
        expect(count).toBeLessThanOrEqual(limit);
      });
    }
  }
});
