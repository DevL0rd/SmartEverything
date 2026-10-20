import { describe, expect, it, vi } from 'vitest';
import { renderVisual, useCellEnvironment, type Spec } from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const NUMBER: Spec[1] = { kind: 'number', min: 0, max: 110, step: 1 };

const SPECS: readonly Spec[] = [
  ['water_level', NUMBER],
  ['battery', { kind: 'number', min: 0, max: 100, step: 1 }],
  ['bottle_volume', { kind: 'number', min: 0, max: 1200, step: 1 }],
  [
    'bottle_state',
    {
      kind: 'enum',
      options: [
        'on',
        'fault',
        'uv_normal',
        'uv_adventure',
        'hydration_reminder',
        'battery_low',
        'charging',
        'charged',
        'uv_interlock',
        'locked',
        'unknown',
      ],
    },
  ],
  ['bottle_charging', { kind: 'enum', options: ['charging', 'charged', 'not_charging'] }],
  [
    'bottle_link',
    { kind: 'enum', options: ['asleep', 'syncing', 'synced', 'sync_failed', 'no_phone'] },
  ],
  ['bottle_reliable', { kind: 'boolean' }],
];

const BASE = {
  water_level: 62,
  battery: 82,
  bottle_state: 'on',
  bottle_charging: 'not_charging',
  bottle_link: 'asleep',
};

const BOTTLE = { kind: 'other', model: 'larq.bottle.purevis2', specs: SPECS } as const;

const STATES: readonly (readonly [string, Readonly<Record<string, number | boolean | string>>])[] =
  [
    ['resting', BASE],
    ['full', { ...BASE, water_level: 100 }],
    ['almost empty', { ...BASE, water_level: 6 }],
    ['level unknown', { battery: 82, bottle_state: 'on' }],
    ['unreliable level', { ...BASE, bottle_reliable: false }],
    ['cleaning', { ...BASE, bottle_state: 'uv_normal' }],
    ['adventure clean', { ...BASE, bottle_state: 'uv_adventure' }],
    ['reminder', { ...BASE, bottle_state: 'hydration_reminder' }],
    ['charging', { ...BASE, bottle_charging: 'charging' }],
    ['charged', { ...BASE, bottle_charging: 'charged' }],
    ['cap off', { ...BASE, bottle_state: 'uv_interlock' }],
    ['fault', { ...BASE, bottle_state: 'fault' }],
    ['travel lock', { ...BASE, bottle_state: 'locked' }],
    ['battery low', { ...BASE, bottle_state: 'battery_low', battery: 12 }],
    ['syncing', { ...BASE, bottle_link: 'syncing' }],
  ];

const LIMITS = [
  ['tile', 48, 42],
  ['card', 96, 70],
  ['hero', 220, 90],
] as const;

describe('water bottle visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of LIMITS) {
    for (const [name, values] of STATES) {
      it(`draws ${name} within ${String(limit)} nodes at ${size} size`, () => {
        const { count, tree } = renderVisual(BOTTLE, values, size, px);
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(limit);
        expect(tree.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('water bottle visual with its filter pod', () => {
  useCellEnvironment();

  const PODDED = {
    ...BOTTLE,
    facts: {
      online: true,
      power: 'on',
      bottle: {
        fill: 0.62,
        reliable: true,
        light: 'off',
        uvMode: null,
        battery: 82,
        filter: true,
        searching: false,
        syncing: false,
        tilt: 'upright',
      },
    },
  } as const;

  for (const [size, px, limit] of LIMITS) {
    it(`draws the pod within ${String(limit)} nodes at ${size} size`, () => {
      const plain = renderVisual(BOTTLE, BASE, size, px);
      const podded = renderVisual(PODDED, BASE, size, px);
      expect(podded.count).toBeGreaterThan(plain.count);
      expect(podded.count).toBeLessThanOrEqual(limit);
    });
  }
});
