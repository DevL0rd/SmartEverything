import { describe, expect, it, vi } from 'vitest';
import {
  budgetCase,
  renderVisual,
  useCellEnvironment,
  type Budget,
  type Face,
} from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const BUTTON: Face = {
  name: 'wireless button',
  kind: 'other',
  model: 'lumi.sensor_switch.v2',
  specs: [['firmware', { kind: 'text', maxLength: 64 }]],
  values: { firmware: '1.0.0' },
  shown: ['firmware', '1.0.1'],
};

const GATEWAY: Face = {
  name: 'gateway',
  kind: 'gateway',
  model: 'lumi.gateway.mgl001',
  specs: [['firmware', { kind: 'text', maxLength: 64 }]],
  values: { firmware: '1.0.0' },
  shown: ['firmware', '1.0.1'],
};

const BUDGETS: Readonly<Record<string, Readonly<Record<'S' | 'M', Budget>>>> = {
  'wireless button': {
    S: { nodes: 39, hooks: 86, subscriptions: 12 },
    M: { nodes: 49, hooks: 72, subscriptions: 9 },
  },
  gateway: {
    S: { nodes: 37, hooks: 84, subscriptions: 12 },
    M: { nodes: 41, hooks: 65, subscriptions: 9 },
  },
};

function budgetOf(name: string): Readonly<Record<'S' | 'M', Budget>> {
  const budget = BUDGETS[name];
  if (budget === undefined) throw new Error(`Expected a budget for ${name}`);
  return budget;
}

budgetCase(BUTTON.name, BUTTON, budgetOf(BUTTON.name));
budgetCase(GATEWAY.name, GATEWAY, budgetOf(GATEWAY.name));

const VISUAL_LIMITS = [
  ['tile', 48, 30],
  ['card', 96, 30],
  ['hero', 220, 30],
] as const;

describe('button and gateway visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_LIMITS) {
    it(`draws a button within ${String(limit)} nodes at ${size} size`, () => {
      const { count } = renderVisual(BUTTON, BUTTON.values, size, px);
      expect(count).toBeLessThanOrEqual(limit);
    });
    it(`draws a gateway within ${String(limit)} nodes at ${size} size`, () => {
      const { count } = renderVisual(GATEWAY, GATEWAY.values, size, px);
      expect(count).toBeLessThanOrEqual(limit);
    });
  }
});
