import { describe, expect, it, vi } from 'vitest';
import {
  budgetCase,
  renderVisual,
  useCellEnvironment,
  type Budget,
  type Face,
} from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const BLASTER: Face = {
  name: 'ir blaster',
  kind: 'ir_blaster',
  model: 'tuya.wfcon',
  specs: [
    ['temperature', { kind: 'number', min: -20, max: 60, step: 0.1, unit: '°C' }],
    ['humidity', { kind: 'number', min: 0, max: 100, step: 1, unit: '%' }],
    ['ir_send', { kind: 'action' }],
    ['ir_learn', { kind: 'action' }],
  ],
  values: { temperature: 22, humidity: 67 },
  shown: ['temperature', 23],
};

const REMOTE: Face = {
  name: 'ir remote',
  kind: 'ir_remote',
  model: 'ir-category-5',
  specs: [
    ['remote_key', { kind: 'enum', options: ['Power', 'Temp up', 'Temp down', 'Mode', 'Swing'] }],
  ],
  values: { remote_key: 'Power' },
  shown: ['remote_key', 'Mode'],
};

const BUDGETS: Readonly<Record<string, Readonly<Record<'S' | 'M', Budget>>>> = {
  'ir blaster': {
    S: { nodes: 41, hooks: 74, subscriptions: 10 },
    M: { nodes: 61, hooks: 70, subscriptions: 10 },
  },
  'ir remote': {
    S: { nodes: 30, hooks: 70, subscriptions: 10 },
    M: { nodes: 40, hooks: 63, subscriptions: 9 },
  },
};

function budgetOf(name: string): Readonly<Record<'S' | 'M', Budget>> {
  const budget = BUDGETS[name];
  if (budget === undefined) throw new Error(`Expected a budget for ${name}`);
  return budget;
}

budgetCase(BLASTER.name, BLASTER, budgetOf(BLASTER.name));
budgetCase(REMOTE.name, REMOTE, budgetOf(REMOTE.name));

const VISUAL_LIMITS = [
  ['tile', 48, 40],
  ['card', 96, 40],
  ['hero', 220, 40],
] as const;

describe('ir visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_LIMITS) {
    it(`draws a blaster within ${String(limit)} nodes at ${size} size`, () => {
      const { count } = renderVisual(BLASTER, BLASTER.values, size, px);
      expect(count).toBeLessThanOrEqual(limit);
    });
    it(`draws a remote within ${String(limit)} nodes at ${size} size`, () => {
      const { count } = renderVisual(REMOTE, REMOTE.values, size, px);
      expect(count).toBeLessThanOrEqual(limit);
    });
  }
});
