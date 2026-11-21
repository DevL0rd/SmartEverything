import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SNAPSHOT } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotWire } from '../../store/snapshot-fixture';
import type { Device } from '../../store/state';

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AppState: {
    currentState: 'active',
    addEventListener: (): { remove: () => undefined } => ({ remove: (): undefined => undefined }),
  },
}));
vi.mock('./watch-link', () => ({ usePhoneWatch: (): null => null }));

const { CommandLedger } = await import('../../store/command-ledger');
const { EntityStore } = await import('../../store/entity-store');
const { StoreProvider } = await import('../../store/store-context');
const { makeTable } = await import('../../store/state');
const { useHasMyWatch, useMyWatch, useMyWatchId } = await import('./watch-glance');
const { useWatchWorkout } = await import('./watch-workout');

const WORKOUT = {
  sport: 'treadmill',
  state: 'running',
  startedAt: '2026-10-18T09:00:00.000Z',
  endedAt: null,
  pausedAt: null,
  pausedSeconds: 0,
  startedFrom: 'phone',
  heartRate: null,
  kcal: null,
  steps: null,
  distanceM: null,
  updatedAt: '2026-10-18T09:00:00.000Z',
};

function watch(details: Record<string, unknown>): Device {
  return {
    id: 'watch-1',
    provider: 'local',
    external_id: 'watch-1',
    parent_id: null,
    kind: 'sensor',
    name: 'Watch',
    display_name: null,
    model: 'band',
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: { driver: 'xiaomi_watch', profileId: null, ...details },
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Watch',
  };
}

interface Mounted {
  readonly report: (details: Record<string, unknown>) => Promise<void>;
  readonly renders: () => number;
  readonly last: () => unknown;
  readonly close: () => void;
}

function mount(useProbe: () => unknown): Mounted {
  const store = new EntityStore();
  store.replace(SNAPSHOT.parse(snapshotWire(null)));
  const report = (details: Record<string, unknown>): void => {
    store.update((state) => {
      const device = watch(details);
      const table = makeTable(
        { [device.id]: device },
        [device.id],
        state.tables.devices.version + 1,
      );
      return { ...state, tables: { ...state.tables, devices: table } };
    });
  };
  report({ battery: 50 });
  const seen: unknown[] = [];
  function Probe(): null {
    seen.push(useProbe());
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
    report: async (details): Promise<void> => {
      await act(() => {
        report(details);
        return Promise.resolve();
      });
    },
    renders: () => seen.length,
    last: () => seen.at(-1),
    close: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

async function reportTenTimes(
  mounted: Mounted,
  extra: Record<string, unknown> = {},
): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await mounted.report({ battery: 60 + index, heartRate: 70 + index, ...extra });
  }
}

beforeEach(() => {
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('my watch selectors under watch reports', () => {
  it('the whole row hook re-renders on every report', async () => {
    const mounted = mount(useMyWatch);
    const before = mounted.renders();
    await reportTenTimes(mounted);
    expect(mounted.renders() - before).toBe(10);
    mounted.close();
  });

  it('the existence and id selectors do not re-render on reports', async () => {
    const has = mount(useHasMyWatch);
    const id = mount(useMyWatchId);
    const before = [has.renders(), id.renders()];
    await reportTenTimes(has);
    await reportTenTimes(id);
    expect([has.renders() - (before[0] ?? 0), id.renders() - (before[1] ?? 0)]).toEqual([0, 0]);
    expect([has.last(), id.last()]).toEqual([true, 'watch-1']);
    has.close();
    id.close();
  });

  it('the workout view ignores reports that change neither the sports nor the workout', async () => {
    const mounted = mount(() => useWatchWorkout('watch-1'));
    const before = mounted.renders();
    await reportTenTimes(mounted);
    expect(mounted.renders() - before).toBe(0);
    mounted.close();
  });

  it('the workout view re-renders once when the workout starts', async () => {
    const mounted = mount(() => useWatchWorkout('watch-1'));
    const before = mounted.renders();
    await mounted.report({ battery: 50, workout: WORKOUT });
    await reportTenTimes(mounted, { workout: WORKOUT });
    expect(mounted.renders() - before).toBe(1);
    expect(mounted.last()).toMatchObject({
      reading: { kind: 'ready', workout: { sport: 'treadmill', state: 'running' } },
    });
    mounted.close();
  });
});
