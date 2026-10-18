import './homelab-mocks';
import { pluginStreamKey, type RobotActivityEntry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { entryOf, movesOf, reportOf, statusOf } from '../../plugins/aibi/robot-fixture';
import { makeTable, type StoreState } from '../../store/state';
import type { RobotFacts } from '../device-visuals';
import {
  budgetCase,
  mountFace,
  renderVisual,
  useCellEnvironment,
  type Budget,
  type Face,
} from './cell-budget';

const AT = '2026-10-18T10:00:00.000Z';

function seeded(status: ReturnType<typeof statusOf>): (state: StoreState) => StoreState {
  const entries: readonly RobotActivityEntry[] = [
    entryOf(1, 'request', '2026-10-18T09:30:00Z'),
    entryOf(2, 'heard', '2026-10-18T09:31:00Z'),
    entryOf(3, 'said', '2026-10-18T09:32:00Z'),
    entryOf(4, 'request', '2026-10-18T08:00:00Z'),
    entryOf(5, 'action', '2026-10-18T07:00:00Z'),
  ];
  const rows = [
    ['aibi.status', status],
    ['aibi.activity', { entries }],
    ['aibi.moves', movesOf()],
  ] as const;
  const byId = Object.fromEntries(
    rows.map(([stream, value]) => [
      pluginStreamKey('aibi', stream),
      {
        plugin_id: 'aibi',
        stream,
        value: z.json().parse(JSON.parse(JSON.stringify(value))),
        at: AT,
      },
    ]),
  );
  return (state) => ({
    ...state,
    tables: { ...state.tables, plugin_streams: makeTable(byId, Object.keys(byId), 1) },
  });
}

const ROBOT: Face = {
  name: 'aibi robot',
  kind: 'robot',
  specs: [['firmware', { kind: 'text', maxLength: 64 }]],
  values: { firmware: '1.7.0' },
  shown: ['firmware', '1.7.1'],
  seed: seeded(statusOf({ robot: reportOf(), contact: null })),
};

const BUDGETS: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 29, hooks: 75, subscriptions: 9 },
  M: { nodes: 67, hooks: 115, subscriptions: 12 },
};

budgetCase('robot', ROBOT, BUDGETS);

const VISUAL = { kind: 'robot', specs: [] } as const;

const MOODS: readonly RobotFacts[] = [
  { mood: 'awake', onBase: true, move: null },
  { mood: 'listening', onBase: true, move: null },
  { mood: 'speaking', onBase: false, move: null },
  { mood: 'worried', onBase: true, move: null },
  { mood: 'asleep', onBase: true, move: null },
];

const VISUAL_LIMITS = [
  ['tile', 48, 30],
  ['card', 96, 45],
  ['hero', 220, 70],
] as const;

describe('robot visual node budgets', () => {
  useCellEnvironment();

  for (const [size, px, limit] of VISUAL_LIMITS) {
    for (const robot of MOODS) {
      it(`draws a ${robot.mood} robot within ${String(limit)} nodes at ${size} size`, () => {
        const { count } = renderVisual({ ...VISUAL, facts: { robot } }, {}, size, px);
        expect(count).toBeLessThanOrEqual(limit);
      });
    }
  }
});

const SERVER_DOWN: Face = {
  ...ROBOT,
  seed: seeded(statusOf({ server: { state: 'failed', reason: 'Port 443 is taken' } })),
};

const WIDE = { width: 560, height: 190, idiom: 'pointer' } as const;
const PANEL = { width: 360, height: 420, idiom: 'touch' } as const;

describe('robot card faces', () => {
  useCellEnvironment();

  it('offers a quick move and the moves menu while the robot is well', () => {
    const mounted = mountFace(ROBOT, 'M');
    expect(mounted.tree()).toContain('accessibilityLabel="Dance"');
    expect(mounted.tree()).toContain('accessibilityLabel="Moves"');
    mounted.unmount();
  });

  it('offers no moves while the server is down', () => {
    const mounted = mountFace(SERVER_DOWN, 'M');
    expect(mounted.tree()).not.toContain('accessibilityLabel="Dance"');
    expect(mounted.tree()).not.toContain('accessibilityLabel="Moves"');
    mounted.unmount();
  });

  it('shows a second quick move at wide size and stays within its node budget', () => {
    const mounted = mountFace(ROBOT, WIDE);
    expect(mounted.tree()).toContain('accessibilityLabel="Sing"');
    expect(mounted.mountNodes).toBeLessThanOrEqual(68);
    mounted.unmount();
  });

  it('keeps the quick moves and the Moves menu on one row in the narrow panel', () => {
    const mounted = mountFace(ROBOT, PANEL);
    expect(mounted.tree()).toContain('accessibilityLabel="Sing"');
    expect(mounted.tree()).not.toContain('accessibilityLabel="Animal"');
    expect(mounted.mountNodes).toBeLessThanOrEqual(73);
    mounted.unmount();
  });
});
