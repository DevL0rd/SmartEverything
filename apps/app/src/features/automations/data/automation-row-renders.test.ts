import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredAutomationRow } from '@smarteverything/domain';
import { ScreenPause, ScreenPausedContext } from '../../../design/screen-pause';
import { CommandLedger } from '../../../store/command-ledger';
import { EntityStore } from '../../../store/entity-store';
import { emptyState, makeTable } from '../../../store/state';
import { StoreContext } from '../../../store/store-runtime';
import {
  buttonTrigger,
  setPower,
  storedAutomationRow,
} from '../../../test-support/automation-rows';
import type { AutomationRow } from './graph-adapter';
import { useAutomationName, useAutomationRow, useAutomations } from './use-automations';

type Probe = 'whole' | 'row' | 'name';

let root: Root | null = null;
let frames: (() => void)[] = [];

function automation(index: number, name: string, runCount = 0): StoredAutomationRow {
  return {
    ...storedAutomationRow({
      index,
      name,
      triggers: [buttonTrigger(`button-${String(index)}`)],
      nodes: [setPower(`lamp-${String(index)}`, true)],
    }),
    run_count: runCount,
  };
}

const HALL = automation(1, 'Hall light');
const DESK = automation(2, 'Desk lamp');

function withRows(store: EntityStore, rows: readonly StoredAutomationRow[]): void {
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      automations: makeTable(
        Object.fromEntries(rows.map((row) => [row.id, row])),
        rows.map((row) => row.id),
        state.tables.automations.version + 1,
      ),
    },
  }));
}

interface Mounted {
  readonly renders: Record<Probe, number>;
  readonly seen: { row: AutomationRow | null; name: string | null };
}

function mount(store: EntityStore, pause: ScreenPause): Mounted {
  const renders: Record<Probe, number> = { whole: 0, row: 0, name: 0 };
  const seen: Mounted['seen'] = { row: null, name: null };
  function Whole(): ReactNode {
    renders.whole += 1;
    useAutomations();
    return null;
  }
  function Row(): ReactNode {
    renders.row += 1;
    seen.row = useAutomationRow(HALL.id);
    return null;
  }
  function Name(): ReactNode {
    renders.name += 1;
    seen.name = useAutomationName(HALL.id);
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(
      createElement(
        StoreContext,
        { value: { store, ledger: new CommandLedger(store) } },
        createElement(
          ScreenPausedContext,
          { value: pause },
          createElement(
            Fragment,
            null,
            createElement(Whole),
            createElement(Row),
            createElement(Name),
          ),
        ),
      ),
    );
  });
  return { renders, seen };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function storeWith(rows: readonly StoredAutomationRow[]): EntityStore {
  const store = new EntityStore();
  store.update(() => emptyState());
  withRows(store, rows);
  return store;
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('one automation readers', () => {
  it('stay still while other automations change', async () => {
    const store = storeWith([HALL, DESK]);
    const mounted = mount(store, new ScreenPause(null));
    const before = { ...mounted.renders };
    const row = mounted.seen.row;
    for (let run = 1; run <= 20; run += 1) {
      withRows(store, [HALL, automation(2, 'Desk lamp', run)]);
      await settle();
    }
    expect(mounted.renders.whole - before.whole).toBe(20);
    expect(mounted.renders.row - before.row).toBe(0);
    expect(mounted.renders.name - before.name).toBe(0);
    expect(mounted.seen.row).toBe(row);
    expect(mounted.seen.name).toBe('Hall light');
  });

  it('follow their own automation', async () => {
    const store = storeWith([HALL, DESK]);
    const mounted = mount(store, new ScreenPause(null));
    const before = { ...mounted.renders };
    withRows(store, [automation(1, 'Hall light', 3), DESK]);
    await settle();
    expect(mounted.renders.row - before.row).toBe(1);
    expect(mounted.renders.name - before.name).toBe(0);
    expect(mounted.seen.row?.run_count).toBe(3);
    withRows(store, [automation(1, 'Porch light', 3), DESK]);
    await settle();
    expect(mounted.seen.name).toBe('Porch light');
    withRows(store, [DESK]);
    await settle();
    expect(mounted.seen.row).toBeNull();
    expect(mounted.seen.name).toBeNull();
  });

  it('hold their row while the screen is paused', async () => {
    const store = storeWith([HALL, DESK]);
    const pause = new ScreenPause(null);
    pause.setOwn(true);
    const mounted = mount(store, pause);
    const before = { ...mounted.renders };
    for (let run = 1; run <= 5; run += 1) {
      withRows(store, [automation(1, 'Hall light', run), DESK]);
      await settle();
    }
    expect(mounted.renders).toEqual(before);
    act(() => {
      pause.setOwn(false);
      for (const frame of frames.splice(0)) frame();
    });
    await settle();
    expect(mounted.renders.row - before.row).toBe(1);
    expect(mounted.seen.row?.run_count).toBe(5);
  });
});
