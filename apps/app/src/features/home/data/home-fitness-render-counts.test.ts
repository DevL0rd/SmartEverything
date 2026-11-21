import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SNAPSHOT, type HealthDailyRow, type Snapshot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotWire } from '../../../store/snapshot-fixture';

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AppState: {
    currentState: 'active',
    addEventListener: (): { remove: () => undefined } => ({ remove: (): undefined => undefined }),
  },
}));

const { CommandLedger } = await import('../../../store/command-ledger');
const { EntityStore } = await import('../../../store/entity-store');
const { StoreProvider } = await import('../../../store/store-context');
const { startClock } = await import('../../../store/clock');
const { makeTable } = await import('../../../store/state');
const { useHomeFitness } = await import('./home-data');

const PROFILE = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PROFILE = '00000000-0000-4000-8000-0000000000a2';
const NOW = Date.parse('2026-10-18T10:00:30.000Z');
const STAMP = '2026-10-18T09:00:00.000Z';

function row(
  profile: string,
  metric: HealthDailyRow['metric'],
  value: number,
  day = '2026-10-18',
): HealthDailyRow {
  return { profile_id: profile, day, metric, value, unit: 'count', updated_at: STAMP };
}

const MOVE = row(PROFILE, 'active_energy', 310);
const MINE = [row(PROFILE, 'steps', 4200), MOVE];

function snapshotOf(seq: number, rows: readonly HealthDailyRow[]): Snapshot {
  const wire = snapshotWire(null);
  const session = SNAPSHOT.shape.session.parse(wire['session']);
  const tables = SNAPSHOT.shape.tables.parse(wire['tables']);
  return SNAPSHOT.parse({
    ...wire,
    seq,
    session: { ...session, client: { ...session.client, profile_id: PROFILE } },
    tables: { ...tables, health_daily: rows },
  });
}

interface Mounted {
  readonly setHealth: (rows: readonly HealthDailyRow[]) => void;
  readonly renders: () => number;
  readonly seen: () => readonly unknown[];
  readonly close: () => void;
}

function mount(): Mounted {
  const store = new EntityStore();
  store.replace(snapshotOf(1, MINE));
  const seen: unknown[] = [];
  function Probe(): null {
    seen.push(useHomeFitness());
    return null;
  }
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    const providers = {
      runtime: { store, ledger: new CommandLedger(store) },
      children: createElement(Probe),
    };
    root.render(createElement(StoreProvider, providers));
  });
  return {
    setHealth: (rows): void => {
      store.update((state) => {
        const byId = Object.fromEntries(
          rows.map((health) => [
            `${String(health.profile_id)}:${health.day}:${health.metric}`,
            health,
          ]),
        );
        const table = makeTable(byId, Object.keys(byId), state.tables.health_daily.version + 1);
        return { ...state, tables: { ...state.tables, health_daily: table } };
      });
    },
    renders: () => seen.length,
    seen: () => seen,
    close: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

let stopClock: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    callback();
    return 0;
  });
  stopClock = startClock();
});

afterEach(() => {
  stopClock();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Home fitness root under minute ticks and unrelated health rows', () => {
  it('does not re-render on minute ticks within the same day', () => {
    const mounted = mount();
    const before = mounted.renders();
    for (let minute = 0; minute < 10; minute += 1) {
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
    }
    expect(mounted.renders() - before).toBe(0);
    mounted.close();
  });

  it('keeps the same value and renders nothing when another profile or metric changes', async () => {
    const mounted = mount();
    const before = mounted.renders();
    const first = mounted.seen().at(-1);
    for (let index = 0; index < 10; index += 1) {
      await act(() => {
        mounted.setHealth([
          ...MINE,
          row(OTHER_PROFILE, 'steps', 1000 + index),
          row(PROFILE, 'heart_rate_average', 60 + index),
        ]);
        return Promise.resolve();
      });
    }
    expect(mounted.renders() - before).toBe(0);
    expect(mounted.seen().at(-1)).toBe(first);
    mounted.close();
  });

  it('re-renders once with the new figure when a shown figure changes', async () => {
    const mounted = mount();
    const before = mounted.renders();
    await act(() => {
      mounted.setHealth([row(PROFILE, 'steps', 5000), MOVE]);
      return Promise.resolve();
    });
    expect(mounted.renders() - before).toBe(1);
    expect(mounted.seen().at(-1)).toMatchObject({
      day: '2026-10-18',
      figures: [{ key: 'steps', value: '5,000' }, { key: 'active_energy' }],
    });
    mounted.close();
  });
});
