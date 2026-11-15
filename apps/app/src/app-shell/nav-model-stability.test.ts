import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from '../store/command-ledger';
import { EntityStore } from '../store/entity-store';
import { StoreProvider } from '../store/store-context';
import type { NavModel } from './nav-model';

vi.mock('expo-router', () => ({ usePathname: (): string => '/' }));

const { useNavModel } = await import('./use-nav-model');

const NOTICES = 300;
const DEVICE = '00000000-0000-4000-8000-000000000001';

const seen: NavModel[] = [];

function Probe(): ReactNode {
  const model = useNavModel('home');
  if (seen.at(-1) !== model) seen.push(model);
  return null;
}

function changeAt(seq: number): LiveChange {
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

function mount(store: EntityStore): void {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const providers = {
    runtime: { store, ledger: new CommandLedger(store) },
    children: createElement(Probe),
  };
  act(() => {
    root.render(createElement(StoreProvider, providers));
  });
}

beforeEach(() => {
  seen.length = 0;
  vi.stubGlobal('requestAnimationFrame', (): number => 0);
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

describe('the navigation model at idle', () => {
  it('keeps one model, so no sidebar row renders, through live notices', () => {
    const store = new EntityStore();
    store.update((state) => ({ ...state, loaded: true }));
    store.setSync({ status: 'live', problem: null });
    mount(store);
    expect(seen).toHaveLength(1);
    for (let seq = 1; seq <= NOTICES; seq += 1) {
      act(() => {
        if (seq % 3 === 0) store.apply([changeAt(seq)]);
        else if (seq % 3 === 1) store.setSync({ status: 'live', problem: null });
        else store.appendLog([`line ${String(seq)}`]);
      });
    }
    expect(seen).toHaveLength(1);
  });
});
