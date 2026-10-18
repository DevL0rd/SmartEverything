import { SESSION } from '@smarteverything/domain';
import { makeTable, type StoreState } from '../../store/state';
import { ALEX, DANA, COMPOSITION, daysAgo, profileOf, readingOf } from '../../store/body-fixture';
import { budgetCase, type Budget, type Face } from './cell-budget';

function seeded(state: StoreState): StoreState {
  const profiles = [profileOf(DANA, 'Dana', 1), profileOf(ALEX, 'Alex', 2)];
  const readings = [
    ...Array.from({ length: 30 }, (_, index) =>
      readingOf({
        device_id: CELL_DEVICE,
        weight_kg: 88.4 + ((index * 7) % 10) / 10,
        measured_at: daysAgo(30 - index),
        composition: COMPOSITION,
        bmi: 27.1,
      }),
    ),
    readingOf({
      device_id: CELL_DEVICE,
      weight_kg: 74.2,
      measured_at: daysAgo(2),
      profile_id: ALEX,
    }),
    readingOf({
      device_id: CELL_DEVICE,
      weight_kg: 204.7,
      attribution: 'pending',
      profile_id: null,
    }),
  ];
  const byId = <R extends { readonly id: string }>(rows: readonly R[]): Record<string, R> =>
    Object.fromEntries(rows.map((row) => [row.id, row]));
  return {
    ...state,
    session: SESSION_ROW,
    tables: {
      ...state.tables,
      profiles: makeTable(
        byId(profiles),
        profiles.map((row) => row.id),
        1,
      ),
      body_readings: makeTable(
        byId(readings),
        readings.map((row) => row.id),
        1,
      ),
    },
  };
}

const CELL_DEVICE = '00000000-0000-4000-8000-000000000001';

const SESSION_ROW = SESSION.parse({
  client: {
    id: DANA,
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: DANA,
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
});

const SCALE: Face = {
  name: 'body scale',
  kind: 'sensor',
  model: 'xiaomi.scales.ms116',
  specs: [['battery', { kind: 'number', min: 0, max: 100, step: 1, unit: '%' }]],
  values: { battery: 80 },
  shown: ['battery', 70],
  seed: seeded,
};

const MAX: Readonly<Record<'S' | 'M', Budget>> = {
  S: { nodes: 52, hooks: 101, subscriptions: 14 },
  M: { nodes: 62, hooks: 90, subscriptions: 11 },
};

budgetCase('scale', SCALE, MAX);
