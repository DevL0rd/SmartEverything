import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceTarget, StoredAutomationRow } from '@smarteverything/domain';
import { ScreenPause, ScreenPausedContext } from '../../../design/screen-pause';
import { CommandLedger } from '../../../store/command-ledger';
import { EntityStore } from '../../../store/entity-store';
import { emptyState, makeTable } from '../../../store/state';
import { StoreContext } from '../../../store/store-runtime';
import {
  buttonTrigger,
  setGroupPower,
  storedAutomationRow,
} from '../../../test-support/automation-rows';
import type { AutomationUse } from '../model/automation-uses';
import { useAutomationUses } from './use-automation-uses';

const GROUP = '22222222-2222-4222-8222-222222222222';
const TARGET: DeviceTarget = { kind: 'group', groupId: GROUP };

let root: Root | null = null;

function automation(name: string, lastRunAt: string | null): StoredAutomationRow {
  return {
    ...storedAutomationRow({
      index: 1,
      name,
      triggers: [buttonTrigger('button-1')],
      nodes: [setGroupPower(GROUP, true)],
    }),
    last_run_at: lastRunAt,
  };
}

function withRow(store: EntityStore, row: StoredAutomationRow): void {
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      automations: makeTable({ [row.id]: row }, [row.id], state.tables.automations.version + 1),
    },
  }));
}

interface Mounted {
  readonly renders: () => number;
  readonly latest: () => readonly AutomationUse[];
}

function mount(store: EntityStore): Mounted {
  let renders = 0;
  let latest: readonly AutomationUse[] = [];
  function Probe(): ReactNode {
    renders += 1;
    latest = useAutomationUses(TARGET);
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

describe('automations that use a device group', () => {
  it('does not re-render when an automation only records a run', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRow(store, automation('Hall lights', null));
    const mounted = mount(store);
    const first = mounted.latest();
    expect(first.map((use) => use.name)).toEqual(['Hall lights']);
    const mountedRenders = mounted.renders();
    for (let run = 0; run < 10; run += 1) {
      withRow(store, automation('Hall lights', `2026-11-21T08:00:0${String(run)}.000Z`));
      await settle();
    }
    expect(mounted.renders()).toBe(mountedRenders);
    expect(mounted.latest()).toBe(first);
  });

  it('re-renders with the new name when the automation is renamed', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRow(store, automation('Hall lights', null));
    const mounted = mount(store);
    withRow(store, automation('Landing lights', null));
    await settle();
    expect(mounted.latest().map((use) => use.name)).toEqual(['Landing lights']);
  });
});
