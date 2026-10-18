import { describe, expect, it, vi } from 'vitest';
import { makeTable, type StoreState } from '../../store/state';
import {
  budgetCase,
  mountFace,
  renderVisual,
  useCellEnvironment,
  type Budget,
  type Face,
} from './cell-budget';

vi.mock('../../queries/use-screen-query', async () => (await import('./idle-queries')).idleQueries);

const DIFFUSER: Face = {
  name: 'scent diffuser',
  kind: 'humidifier',
  model: 'xiaomi.diffuser.xw2iv',
  specs: [
    ['power', { kind: 'boolean' }],
    ['raw:2.1', { kind: 'boolean' }],
    ['raw:2.3', { kind: 'number', min: 2, max: 6, step: 1 }],
    ['raw:2.4', { kind: 'number', min: 10, max: 20, step: 5 }],
    ['raw:action.4.1', { kind: 'action' }],
    ['raw:3.1', { kind: 'boolean' }],
    ['raw:3.2', { kind: 'number', min: 1, max: 100, step: 1 }],
    ['battery', { kind: 'number', min: 0, max: 100, step: 5 }],
  ],
  values: {
    power: true,
    'raw:2.1': false,
    'raw:2.3': 4,
    'raw:2.4': 15,
    'raw:3.1': true,
    'raw:3.2': 50,
    battery: 35,
  },
  shown: ['raw:2.4', 20],
};

const BUDGETS: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 55, hooks: 102, subscriptions: 11 },
  M: { nodes: 85, hooks: 111, subscriptions: 14 },
};

budgetCase(DIFFUSER.name, DIFFUSER, BUDGETS);

const VISUAL_LIMITS = [
  ['tile', 48, 40],
  ['card', 96, 44],
  ['hero', 220, 44],
] as const;

describe('scent diffuser visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_LIMITS) {
    it(`draws a scenting diffuser within ${String(limit)} nodes at ${size} size`, () => {
      const { count } = renderVisual(DIFFUSER, DIFFUSER.values, size, px);
      expect(count).toBeLessThanOrEqual(limit);
    });
  }
});

const WIDE = { width: 560, height: 190, idiom: 'pointer' } as const;
const PANEL = { width: 360, height: 420, idiom: 'touch' } as const;

describe('scent diffuser wide and panel faces', () => {
  useCellEnvironment();

  it('mounts the wide face within its node and hook budget', () => {
    const mounted = mountFace(DIFFUSER, WIDE);
    expect(mounted.mountNodes).toBeLessThanOrEqual(91);
    expect(mounted.firstHooks).toBeLessThanOrEqual(133);
    mounted.unmount();
  });

  it('mounts the panel within its node and hook budget', () => {
    const mounted = mountFace(DIFFUSER, PANEL);
    expect(mounted.mountNodes).toBeLessThanOrEqual(93);
    expect(mounted.firstHooks).toBeLessThanOrEqual(157);
    mounted.unmount();
  });
});

function offline(state: StoreState): StoreState {
  const { byId, ids, version } = state.tables.devices;
  const grounded = Object.fromEntries(
    Object.entries(byId).map(([id, row]) => [id, { ...row, online: false }]),
  );
  return { ...state, tables: { ...state.tables, devices: makeTable(grounded, ids, version + 1) } };
}

const FAULTY: Face = { ...DIFFUSER, values: { ...DIFFUSER.values, 'raw:2.1': true } };
const OFFLINE: Face = { ...DIFFUSER, seed: offline };
const OFF: Face = { ...DIFFUSER, values: { ...DIFFUSER.values, power: false } };

describe('scent diffuser states', () => {
  useCellEnvironment();

  it('says a fault once and keeps only the power button', () => {
    const mounted = mountFace(FAULTY, 'M');
    const tree = mounted.tree();
    expect(tree).toContain(
      'Needs attention. Check the bottle and nozzle, then turn it off and on.',
    );
    expect(tree).not.toContain('Paused by a fault');
    expect(tree).not.toContain('accessibilityLabel="Spray now"');
    mounted.unmount();
  });

  it('keeps the last known strength in the summary while offline and offers no spray', () => {
    const mounted = mountFace(OFFLINE, 'M');
    const tree = mounted.tree();
    expect(tree).toContain('Offline. Medium · every 15 min · 4 s.');
    expect(tree).not.toContain('accessibilityLabel="Spray now"');
    mounted.unmount();
  });

  it('offers Turn on when it is off and keeps the setting it will use', () => {
    const mounted = mountFace(OFF, 'M');
    const tree = mounted.tree();
    expect(tree).toContain('accessibilityLabel="Turn on"');
    expect(tree).toContain('Off. Medium · every 15 min · 4 s.');
    mounted.unmount();
  });

  it('puts the strength menu, not the light, beside Spray now at wide size', () => {
    const mounted = mountFace(DIFFUSER, WIDE);
    const tree = mounted.tree();
    expect(tree).toContain('accessibilityLabel="Strength: Medium"');
    expect(tree).not.toContain('light"');
    mounted.unmount();
  });

  it('adds the light swatch to the strength menu in the panel', () => {
    const mounted = mountFace(DIFFUSER, PANEL);
    const tree = mounted.tree();
    expect(tree).toContain('accessibilityLabel="Strength: Medium"');
    expect(tree).toContain('light"');
    mounted.unmount();
  });
});
