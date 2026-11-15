import { act, createElement, type ReactNode } from 'react';
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
import type { AutomationList } from './automation-rows';
import { hubSource } from './source';
import { useAutomations } from './use-automations';

const CONSUMERS = 6;

let root: Root | null = null;
let frames: (() => void)[] = [];

function row(lastRunAt: string | null): StoredAutomationRow {
  return {
    ...storedAutomationRow({
      index: 1,
      name: 'Hall light',
      triggers: [buttonTrigger('button-1')],
      nodes: [setPower('lamp-1', true)],
    }),
    last_run_at: lastRunAt,
  };
}

function withRow(store: EntityStore, stored: StoredAutomationRow): void {
  store.update((state) => ({
    ...state,
    tables: {
      ...state.tables,
      automations: makeTable(
        { [stored.id]: stored },
        [stored.id],
        state.tables.automations.version + 1,
      ),
    },
  }));
}

interface Mounted {
  readonly renders: () => number;
  readonly lists: AutomationList[];
}

function mount(store: EntityStore, pause: ScreenPause): Mounted {
  let renders = 0;
  const lists: AutomationList[] = [];
  function Probe({ index }: { readonly index: number }): ReactNode {
    renders += 1;
    lists[index] = useAutomations();
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  const probes = Array.from({ length: CONSUMERS }, (_, index) =>
    createElement(Probe, { key: index, index }),
  );
  act(() => {
    created.render(
      createElement(
        StoreContext,
        { value: { store, ledger: new CommandLedger(store) } },
        createElement(ScreenPausedContext, { value: pause }, probes),
      ),
    );
  });
  return { renders: () => renders, lists };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
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

describe('useAutomations on a paused screen', () => {
  it('shares one source per store so every consumer reads the same parsed list', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRow(store, row(null));
    expect(hubSource(store)).toBe(hubSource(store));
    const mounted = mount(store, new ScreenPause(null));
    withRow(store, row('2026-11-14T08:00:00.000Z'));
    await settle();
    const first = mounted.lists[0];
    expect(first?.rows).toHaveLength(1);
    expect(mounted.lists.every((list) => list === first)).toBe(true);
  });

  it('holds run updates while paused and renders each consumer once on resume', async () => {
    const store = new EntityStore();
    store.update(() => emptyState());
    withRow(store, row(null));
    const pause = new ScreenPause(null);
    pause.setOwn(true);
    const mounted = mount(store, pause);
    const mountedRenders = mounted.renders();
    expect(mountedRenders).toBe(CONSUMERS);
    for (let run = 0; run < 8; run += 1) {
      withRow(store, row(`2026-11-14T08:00:0${String(run)}.000Z`));
      await settle();
    }
    expect(mounted.renders()).toBe(mountedRenders);
    act(() => {
      pause.setOwn(false);
      for (const frame of frames.splice(0)) frame();
    });
    await settle();
    expect(mounted.renders()).toBe(mountedRenders + CONSUMERS);
    expect(mounted.lists[0]?.byId.get(row(null).id)?.last_run_at).toBe('2026-11-14T08:00:07.000Z');
  });
});
