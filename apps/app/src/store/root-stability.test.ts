import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from './command-ledger';
import { EntityStore } from './entity-store';
import { useLoaded, useSyncStatus } from './selectors';
import { StoreProvider, useStoreSelector } from './store-context';

const NOTICES = 500;
const DEVICE = '00000000-0000-4000-8000-000000000001';

const renders = { root: 0, child: 0, gate: 0, valueReader: 0, prefReader: 0 };

let frames: (() => void)[] = [];

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

function deviceStateChange(seq: number): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq,
    record: {
      device_id: DEVICE,
      capability: 'level',
      value: seq,
      observed_at: new Date(Date.UTC(2026, 9, 16, 0, 0, seq % 60)).toISOString(),
    },
    oldRecord: null,
  });
}

function useRenderCount(name: keyof typeof renders): void {
  useEffect(() => {
    renders[name] += 1;
  });
}

function Child(): ReactNode {
  useRenderCount('child');
  return null;
}

function Gate(): ReactNode {
  useRenderCount('gate');
  useLoaded();
  useSyncStatus();
  return null;
}

function ValueReader(): ReactNode {
  useRenderCount('valueReader');
  useStoreSelector((state) => state.deviceValues.get(DEVICE)?.['level']?.value ?? null);
  return null;
}

function PrefReader(): ReactNode {
  useRenderCount('prefReader');
  useStoreSelector((state) => state.tables.layouts.byId['appearance'] ?? null, Object.is, [
    'appearance',
  ]);
  return null;
}

const SUBTREE = createElement(
  Fragment,
  null,
  createElement(Child),
  createElement(Gate),
  createElement(ValueReader),
  createElement(PrefReader),
);

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  useRenderCount('root');
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: SUBTREE });
}

function noticesOf(store: EntityStore): void {
  for (let seq = 1; seq <= NOTICES; seq += 1) {
    const kind = seq % 4;
    act(() => {
      if (kind === 0) {
        store.apply([deviceStateChange(seq)]);
      } else if (kind === 1) {
        store.update((state) => ({ ...state, tables: { ...state.tables } }));
      } else if (kind === 2) {
        store.setSync({ status: 'live', problem: null });
      } else {
        store.appendLog([`line ${String(seq)}`]);
      }
      flushFrames();
    });
  }
}

beforeEach(() => {
  frames = [];
  Object.assign(renders, { root: 0, child: 0, gate: 0, valueReader: 0, prefReader: 0 });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(store: EntityStore): void {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Root, { store }));
  });
}

describe('store provider stability under live notices', () => {
  it('never re-renders the root, the provider subtree or equal-valued gates', () => {
    const store = new EntityStore();
    store.update((state) => ({ ...state, loaded: true }));
    store.setSync({ status: 'live', problem: null });
    mount(store);
    const mounted = { ...renders };
    expect(mounted.root).toBe(1);

    noticesOf(store);

    expect(renders.root).toBe(mounted.root);
    expect(renders.child).toBe(mounted.child);
    expect(renders.gate).toBe(mounted.gate);
    expect(renders.prefReader).toBe(mounted.prefReader);
  });

  it('re-renders only the subscriber whose value changed', () => {
    const store = new EntityStore();
    mount(store);
    const before = renders.valueReader;

    noticesOf(store);

    expect(renders.valueReader - before).toBeGreaterThan(0);
    expect(renders.valueReader - before).toBeLessThanOrEqual(NOTICES / 4);
  });
});
