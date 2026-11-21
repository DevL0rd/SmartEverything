import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredAutomationRow, TriggerNode } from '@smarteverything/domain';
import { ScreenPause, ScreenPausedContext } from '../../../design/screen-pause';
import { CommandLedger } from '../../../store/command-ledger';
import { EntityStore } from '../../../store/entity-store';
import { emptyState, makeTable } from '../../../store/state';
import { StoreContext } from '../../../store/store-runtime';
import { nodeId, setPower, storedAutomationRow } from '../../../test-support/automation-rows';
import type { ByHand } from '../../automations';
import { useHomeByHand } from './home-data';

vi.mock('../../talk/data/talk-available', () => ({ talkAvailable: (): boolean => true }));

const CALLED: TriggerNode = { id: nodeId(1), key: 't1', kind: 'trigger.called', ports: {} };

let root: Root | null = null;

function automation(
  index: number,
  name: string,
  lastRunAt: string | null,
  enabled = true,
): StoredAutomationRow {
  return {
    ...storedAutomationRow({
      index,
      name,
      enabled,
      triggers: [CALLED],
      nodes: [setPower('lamp-1', true)],
    }),
    last_run_at: lastRunAt,
  };
}

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
  readonly renders: () => number;
  readonly latest: () => readonly ByHand[];
}

function mount(store: EntityStore): Mounted {
  let renders = 0;
  let latest: readonly ByHand[] = [];
  function Probe(): ReactNode {
    renders += 1;
    latest = useHomeByHand();
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
        createElement(ScreenPausedContext, { value: new ScreenPause(null) }, createElement(Probe)),
      ),
    );
  });
  return { renders: () => renders, latest: () => latest };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('Home By hand list', () => {
  it('does not re-render when an automation only records a run', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRows(store, [automation(1, 'Movie', null), automation(2, 'Bedtime', null)]);
    const mounted = mount(store);
    const first = mounted.latest();
    const mountedRenders = mounted.renders();
    for (let run = 0; run < 10; run += 1) {
      withRows(store, [
        automation(1, 'Movie', `2026-11-21T08:00:0${String(run)}.000Z`),
        automation(2, 'Bedtime', null),
      ]);
      await settle();
    }
    expect(mounted.renders()).toBe(mountedRenders);
    expect(mounted.latest()).toBe(first);
  });

  it('re-renders with the new list when a name or the switched-on set changes', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRows(store, [automation(1, 'Movie', null), automation(2, 'Bedtime', null)]);
    const mounted = mount(store);
    withRows(store, [automation(1, 'Cinema', null), automation(2, 'Bedtime', null)]);
    await settle();
    expect(mounted.latest().map((entry) => entry.name)).toEqual(['Bedtime', 'Cinema']);
    withRows(store, [automation(1, 'Cinema', null), automation(2, 'Bedtime', null, false)]);
    await settle();
    expect(mounted.latest().map((entry) => entry.name)).toEqual(['Cinema']);
  });
});
