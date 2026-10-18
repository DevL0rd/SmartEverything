import type { DeviceCapability } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { televisionFixture } from '../../store/television-fixture';
import {
  budgetCase,
  renderVisual,
  useCellEnvironment,
  type Budget,
  type Face,
  type Spec,
} from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const BOOL = { kind: 'boolean' } as const;
const num = (max: number, unit?: string): DeviceCapability['value'] =>
  unit === undefined
    ? { kind: 'number', min: 0, max, step: 1 }
    : { kind: 'number', min: 0, max, step: 1, unit };
const choice = (...options: string[]): DeviceCapability['value'] => ({ kind: 'enum', options });

function television(): Face {
  const { device, values } = televisionFixture('livingRoom', true, { power: true });
  return {
    name: 'television',
    kind: 'television',
    model: device.model,
    specs: device.capabilities.map((capability): Spec => [capability.key, capability.value]),
    values: Object.fromEntries(
      Object.entries(values).flatMap(([key, reported]) =>
        typeof reported.value === 'number' ||
        typeof reported.value === 'boolean' ||
        typeof reported.value === 'string'
          ? [[key, reported.value]]
          : [],
      ),
    ),
    shown: ['volume', 35],
  };
}

const FACES: readonly Face[] = [
  {
    name: 'light',
    kind: 'light',
    specs: [
      ['power', BOOL],
      ['brightness', num(100, '%')],
      ['color_temperature', num(6500, 'K')],
    ],
    values: { power: true, brightness: 60, color_temperature: 3000 },
    shown: ['brightness', 30],
  },
  {
    name: 'plug',
    kind: 'plug',
    specs: [
      ['power', BOOL],
      ['power_draw', num(3000, 'W')],
    ],
    values: { power: true, power_draw: 120 },
    shown: ['power', false],
  },
  {
    name: 'climate sensor',
    kind: 'sensor',
    specs: [
      ['temperature', num(50, 'C')],
      ['humidity', num(100, '%')],
    ],
    values: { temperature: 21, humidity: 40 },
    shown: ['temperature', 24],
  },
  {
    name: 'lock',
    kind: 'lock',
    specs: [['lock', BOOL]],
    values: { lock: true },
    shown: ['lock', false],
  },
  {
    name: 'fan',
    kind: 'fan',
    specs: [
      ['power', BOOL],
      ['fan_speed', num(100, '%')],
      ['oscillation', BOOL],
    ],
    values: { power: true, fan_speed: 50, oscillation: true },
    shown: ['fan_speed', 80],
  },
  {
    name: 'vacuum',
    kind: 'vacuum',
    specs: [
      ['cleaning', choice('docked', 'cleaning', 'paused')],
      ['battery', num(100, '%')],
    ],
    values: { cleaning: 'docked', battery: 90 },
    shown: ['cleaning', 'cleaning'],
  },
  {
    name: 'blind',
    kind: 'cover',
    specs: [['cover_position', num(100, '%')]],
    values: { cover_position: 40 },
    shown: ['cover_position', 80],
  },
  television(),
  {
    name: 'thermostat',
    kind: 'thermostat',
    specs: [
      ['temperature', num(50, 'C')],
      ['target_temperature', num(30, 'C')],
      ['hvac_mode', choice('heat', 'cool', 'off')],
    ],
    values: { temperature: 21, target_temperature: 22, hvac_mode: 'heat' },
    shown: ['temperature', 23],
  },
  {
    name: 'washer',
    kind: 'appliance',
    model: 'mibx5.washer.f29gl',
    specs: [
      ['power', BOOL],
      ['raw:2.2', choice('Idle', 'Paused', 'Busy', 'Delay', 'Completed', 'Off')],
      ['raw:2.11', choice('Not Run', 'Washing', 'Rinsing', 'Spinning', 'Drying')],
      ['raw:2.10', num(900, 'min')],
      ['raw:2.9', choice('Open', 'Closed And Can Be Opened', 'Closed And Can Not Be Opened')],
      ['raw:2.7', choice('800', '1200', '1400')],
      ['raw:2.4', choice('No Faults', 'Door Lock Malfunction')],
    ],
    values: {
      power: true,
      'raw:2.2': 'Busy',
      'raw:2.11': 'Washing',
      'raw:2.10': 72,
      'raw:2.9': 'Closed And Can Not Be Opened',
      'raw:2.7': '1400',
    },
    shown: ['raw:2.10', 71],
  },
];

const BUDGETS: Readonly<Record<string, Readonly<Record<'S' | 'M', Budget>>>> = {
  light: {
    S: { nodes: 48, hooks: 88, subscriptions: 9 },
    M: { nodes: 69, hooks: 109, subscriptions: 10 },
  },
  plug: {
    S: { nodes: 54, hooks: 93, subscriptions: 11 },
    M: { nodes: 57, hooks: 93, subscriptions: 11 },
  },
  'climate sensor': {
    S: { nodes: 45, hooks: 89, subscriptions: 11 },
    M: { nodes: 51, hooks: 99, subscriptions: 12 },
  },
  lock: {
    S: { nodes: 45, hooks: 89, subscriptions: 10 },
    M: { nodes: 48, hooks: 89, subscriptions: 10 },
  },
  fan: {
    S: { nodes: 55, hooks: 94, subscriptions: 10 },
    M: { nodes: 65, hooks: 110, subscriptions: 12 },
  },
  vacuum: {
    S: { nodes: 48, hooks: 89, subscriptions: 9 },
    M: { nodes: 52, hooks: 89, subscriptions: 9 },
  },
  blind: {
    S: { nodes: 38, hooks: 93, subscriptions: 10 },
    M: { nodes: 41, hooks: 93, subscriptions: 10 },
  },
  television: {
    S: { nodes: 84, hooks: 114, subscriptions: 10 },
    M: { nodes: 174, hooks: 206, subscriptions: 14 },
  },
  thermostat: {
    S: { nodes: 31, hooks: 84, subscriptions: 9 },
    M: { nodes: 48, hooks: 104, subscriptions: 10 },
  },
  washer: {
    S: { nodes: 40, hooks: 66, subscriptions: 7 },
    M: { nodes: 65, hooks: 80, subscriptions: 7 },
  },
};

function faceNamed(name: string): Face {
  const face = FACES.find((known) => known.name === name);
  if (face === undefined) throw new Error(`Expected a face named ${name}`);
  return face;
}

function budgetOf(name: string): Readonly<Record<'S' | 'M', Budget>> {
  const budget = BUDGETS[name];
  if (budget === undefined) throw new Error(`Expected a budget for ${name}`);
  return budget;
}

for (const face of FACES) {
  budgetCase(face.name, face, budgetOf(face.name));
}

type WasherValues = Readonly<Record<string, number | boolean | string>>;

const WASHER_BASE: WasherValues = {
  power: true,
  'raw:2.4': 'No Faults',
  'raw:2.9': 'Closed And Can Not Be Opened',
  'raw:2.10': 72,
  'raw:2.7': '1400',
};

const BUSY: WasherValues = { 'raw:2.2': 'Busy' };

const WASHER_STATES: Readonly<Record<string, WasherValues>> = {
  off: { power: false, 'raw:2.2': 'Off' },
  ready: { 'raw:2.2': 'Idle' },
  open: { 'raw:2.2': 'Idle', 'raw:2.9': 'Open' },
  delayed: { 'raw:2.2': 'Delay' },
  weighing: { ...BUSY, 'raw:2.11': 'Weighing' },
  washing: { ...BUSY, 'raw:2.11': 'Washing' },
  soaking: { ...BUSY, 'raw:2.11': 'Soaking' },
  rinsing: { ...BUSY, 'raw:2.11': 'Rinsing' },
  spinning: { ...BUSY, 'raw:2.11': 'Spinning' },
  drying: { ...BUSY, 'raw:2.11': 'Drying' },
  steaming: { ...BUSY, 'raw:2.11': 'Steam Sterilization' },
  paused: { 'raw:2.2': 'Paused', 'raw:2.11': 'Rinsing' },
  finished: { 'raw:2.2': 'Completed' },
  fault: { ...BUSY, 'raw:2.11': 'Rinsing', 'raw:2.4': 'Door Lock Malfunction' },
};

const VISUAL_SIZES = [
  ['tile', 48, 40],
  ['card', 96, 60],
  ['hero', 220, 90],
] as const;

function washerVisual(
  state: string,
  size: 'tile' | 'card' | 'hero',
  px: 48 | 96 | 220,
): { readonly count: number; readonly tree: string } {
  return renderVisual(faceNamed('washer'), { ...WASHER_BASE, ...WASHER_STATES[state] }, size, px);
}

describe('laundry visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_SIZES) {
    it(`stays within ${String(limit)} nodes at ${size} size in every state`, () => {
      for (const state of Object.keys(WASHER_STATES)) {
        const { count } = washerVisual(state, size, px);
        expect(count, `${state} ${size}`).toBeLessThanOrEqual(limit);
      }
    });
  }

  for (const state of Object.keys(WASHER_STATES)) {
    it(`draws the ${state} card`, async () => {
      const { tree } = washerVisual(state, 'card', 96);
      await expect(tree).toMatchFileSnapshot(`__snapshots__/laundry-visual/${state}-card.txt`);
    });
  }

  it('prints the node counts', () => {
    const lines = Object.keys(WASHER_STATES).map(
      (state) =>
        `${state.padEnd(10)} ${VISUAL_SIZES.map(([size, px]) => `${size}=${String(washerVisual(state, size, px).count).padStart(3)}`).join(' ')}`,
    );
    process.stdout.write(`\nlaundry visual nodes\n${lines.join('\n')}\n`);
    expect(lines.length).toBe(Object.keys(WASHER_STATES).length);
  });

  it('mounts no sparkle, spin blur or particles for a finished machine', () => {
    const { tree } = washerVisual('finished', 'hero', 220);
    expect(tree).not.toContain('M0-4L1-1L4 0');
    expect(tree).not.toContain('strokeDasharray');
  });

  it('mounts the spin blur only while spinning', () => {
    expect(washerVisual('spinning', 'card', 96).tree).toContain('strokeDasharray');
    expect(washerVisual('washing', 'card', 96).tree).not.toContain('strokeDasharray');
  });

  it('draws no water in the tile', () => {
    expect(washerVisual('washing', 'tile', 48).tree).not.toContain('transitionProperty');
  });
});
