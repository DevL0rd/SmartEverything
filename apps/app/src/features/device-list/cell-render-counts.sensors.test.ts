import type { DeviceCapability } from '@smarteverything/domain';
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

const BOOL = { kind: 'boolean' } as const;
const num = (max: number, unit?: string): DeviceCapability['value'] =>
  unit === undefined
    ? { kind: 'number', min: 0, max, step: 1 }
    : { kind: 'number', min: 0, max, step: 1, unit };
const choice = (...options: string[]): DeviceCapability['value'] => ({ kind: 'enum', options });

const CONTACT: Face = {
  name: 'contact sensor',
  kind: 'sensor',
  specs: [
    ['contact', BOOL],
    ['battery', num(100, '%')],
  ],
  values: { contact: true, battery: 80 },
  shown: ['contact', false],
};

const PURIFIER: Face = {
  name: 'air purifier',
  kind: 'air_purifier',
  specs: [
    ['power', BOOL],
    ['pm25', num(500)],
    ['purifier_mode', choice('auto', 'sleep', 'favorite')],
    ['filter_life', num(100, '%')],
  ],
  values: { power: true, pm25: 12, purifier_mode: 'auto', filter_life: 70 },
  shown: ['pm25', 40],
};

const HUMIDIFIER: Face = {
  name: 'humidifier',
  kind: 'humidifier',
  specs: [
    ['power', BOOL],
    ['humidity', num(100, '%')],
    ['target_humidity', num(100, '%')],
    ['water_level', num(100, '%')],
  ],
  values: { power: true, humidity: 40, target_humidity: 55, water_level: 70 },
  shown: ['humidity', 48],
};

const BUDGETS: Readonly<Record<string, Readonly<Record<'S' | 'M', Budget>>>> = {
  'contact sensor': {
    S: { nodes: 33, hooks: 65, subscriptions: 10 },
    M: { nodes: 35, hooks: 52, subscriptions: 8 },
  },
  'air purifier': {
    S: { nodes: 47, hooks: 84, subscriptions: 9 },
    M: { nodes: 67, hooks: 105, subscriptions: 13 },
  },
  humidifier: {
    S: { nodes: 60, hooks: 87, subscriptions: 9 },
    M: { nodes: 77, hooks: 112, subscriptions: 13 },
  },
};

function budgetOf(name: string): Readonly<Record<'S' | 'M', Budget>> {
  const budget = BUDGETS[name];
  if (budget === undefined) throw new Error(`Expected a budget for ${name}`);
  return budget;
}

for (const face of [CONTACT, PURIFIER, HUMIDIFIER]) {
  budgetCase(face.name, face, budgetOf(face.name));
}

const VISUAL_LIMITS = [
  ['tile', 48, 40],
  ['card', 96, 40],
  ['hero', 220, 40],
] as const;

describe('contact sensor visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_LIMITS) {
    for (const open of [true, false]) {
      it(`draws a ${open ? 'open' : 'closed'} door within ${String(limit)} nodes at ${size} size`, () => {
        const { count } = renderVisual(CONTACT, { ...CONTACT.values, contact: open }, size, px);
        expect(count).toBeLessThanOrEqual(limit);
      });
    }
  }

  it('shows an open door differently from a closed one', () => {
    const open = renderVisual(CONTACT, { ...CONTACT.values, contact: true }, 'card', 96).tree;
    const closed = renderVisual(CONTACT, { ...CONTACT.values, contact: false }, 'card', 96).tree;
    expect(open).not.toBe(closed);
  });
});

const FACE_NODES_WITHOUT_VISUAL = 60;

describe('sensor faces without their visual', () => {
  useCellEnvironment();

  for (const face of [CONTACT, PURIFIER, HUMIDIFIER]) {
    it(`draws the ${face.name} at m within ${String(FACE_NODES_WITHOUT_VISUAL)} nodes besides its visual`, () => {
      const mounted = mountFace(face, 'M');
      const visual = renderVisual(face, face.values, 'card', 96).count;
      mounted.unmount();
      expect(mounted.mountNodes - visual).toBeLessThanOrEqual(FACE_NODES_WITHOUT_VISUAL);
    });
  }
});

function offline(face: Face): Face {
  return {
    ...face,
    seed: (state): StoreState => {
      const { byId, ids, version } = state.tables.devices;
      const [first] = ids;
      const device = first === undefined ? undefined : byId[first];
      if (first === undefined || device === undefined) {
        throw new Error('Expected the fixture to hold the device under test');
      }
      const devices = makeTable(
        { ...byId, [first]: { ...device, online: false } },
        ids,
        version + 1,
      );
      return { ...state, tables: { ...state.tables, devices } };
    },
  };
}

function treeAt(face: Face): string {
  const mounted = mountFace(face, 'M');
  const tree = mounted.tree();
  mounted.unmount();
  return tree;
}

describe('sensor faces while offline', () => {
  useCellEnvironment();

  for (const face of [CONTACT, PURIFIER, HUMIDIFIER]) {
    it(`says the ${face.name} is offline once and shows the reason instead of controls`, () => {
      const tree = treeAt(offline(face));
      expect(tree).toContain('Offline.');
      expect(tree).toContain('accessibilityRole="summary"');
      expect(tree).not.toContain('Turn off');
      expect(tree).not.toContain('Purifier mode');
      expect(tree).not.toContain('Target humidity');
    });
  }

  it('keeps the power and mode controls while online', () => {
    const tree = treeAt(PURIFIER);
    expect(tree).toContain('Turn off');
    expect(tree).toContain('Purifier mode');
    expect(tree).not.toContain('accessibilityRole="summary"');
  });
});
