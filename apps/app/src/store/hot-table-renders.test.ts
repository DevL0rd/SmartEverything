import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AUTOMATION_ROW, type ClientRow, type StoredAutomationRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRingSources } from '../features/clock/alarm/ring-targets';
import { useAttachmentNames } from '../features/planner/item/attachment-names';
import { useMayChoosePerson } from '../features/profiles/may-choose-person';
import { CommandLedger } from './command-ledger';
import { deviceFixture } from './device-fixture';
import { EntityStore } from './entity-store';
import { useAutomationNames, useRows } from './selectors';
import { makeTable, type Device, type ListTable, type RowOf } from './state';
import { StoreProvider } from './store-context';

const PROFILE = 'person-1';
const STAMP = '2026-11-14T09:00:00.000Z';

const PROBES = ['wholeAutomations', 'names', 'wholeClients', 'choose', 'ring', 'lines'] as const;

type Probe = (typeof PROBES)[number];

const renders: Record<Probe, number> = {
  wholeAutomations: 0,
  names: 0,
  wholeClients: 0,
  choose: 0,
  ring: 0,
  lines: 0,
};

const seen: { names: ReadonlyMap<string, string> | null; choose: boolean | null } = {
  names: null,
  choose: null,
};

function uuid(tail: string): string {
  return `00000000-0000-4000-8000-${tail.padStart(12, '0')}`;
}

function automation(digit: string, name: string, runCount = 0): StoredAutomationRow {
  return AUTOMATION_ROW.parse({
    id: uuid(`a${digit}`),
    name,
    enabled: true,
    revision: 1,
    definition: {
      version: 4,
      kind: 'automation',
      triggers: [{ id: uuid(`b${digit}`), key: 'entry', kind: 'trigger.manual', ports: {} }],
      inputs: [],
      outputs: [],
      variables: [],
      nodes: [{ id: uuid(`c${digit}`), key: 'start', kind: 'flow.start' }],
      policy: { mode: 'single' },
    },
    draft: null,
    layout: { nodes: {}, frames: [], comments: [] },
    origin: null,
    author: null,
    last_run_at: null,
    last_error: null,
    run_count: runCount,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

function client(id: string, change: Partial<ClientRow> = {}): ClientRow {
  return {
    id,
    name: id,
    platform: 'android',
    kind: 'phone',
    role: 'owner',
    built_in: false,
    profile_id: PROFILE,
    created_at: STAMP,
    last_seen_at: null,
    ...change,
  };
}

const WAKE = automation('1', 'Wake up');
const DIM = automation('2', 'Dim lights');
const PHONE = client('phone');
const DESK = client('desk', { name: 'Desk PC', platform: 'desktop', kind: 'computer' });
const LAMP = deviceFixture(0, { id: 'lamp', name: 'Lamp' });
const PLUG = deviceFixture(1, { id: 'plug', name: 'Plug' });

function useRenderCount(name: Probe): void {
  useEffect(() => {
    renders[name] += 1;
  });
}

function WholeAutomations(): ReactNode {
  useRenderCount('wholeAutomations');
  useRows('automations');
  return null;
}

function Names(): ReactNode {
  useRenderCount('names');
  const names = useAutomationNames();
  useEffect(() => {
    seen.names = names;
  });
  return null;
}

function WholeClients(): ReactNode {
  useRenderCount('wholeClients');
  useRows('clients');
  return null;
}

function Choose(): ReactNode {
  useRenderCount('choose');
  const choose = useMayChoosePerson();
  useEffect(() => {
    seen.choose = choose;
  });
  return null;
}

function Ring(): ReactNode {
  useRenderCount('ring');
  useRingSources(PROFILE);
  return null;
}

function Lines(): ReactNode {
  useRenderCount('lines');
  useAttachmentNames();
  return null;
}

const SUBTREE = createElement(
  Fragment,
  null,
  createElement(WholeAutomations),
  createElement(Names),
  createElement(WholeClients),
  createElement(Choose),
  createElement(Ring),
  createElement(Lines),
);

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: SUBTREE });
}

async function setRows<T extends ListTable>(
  store: EntityStore,
  table: T,
  rows: readonly (RowOf<T> & { readonly id: string })[],
): Promise<void> {
  await act(async () => {
    store.update((state) => ({
      ...state,
      tables: {
        ...state.tables,
        [table]: makeTable(
          Object.fromEntries(rows.map((row) => [row.id, row])),
          rows.map((row) => row.id),
          state.tables[table].version + 1,
        ),
      },
    }));
    await Promise.resolve();
  });
}

async function mount(): Promise<EntityStore> {
  const store = new EntityStore();
  store.update((state) => ({
    ...state,
    loaded: true,
    session: {
      client: { ...PHONE, last_seen_at: null },
      hub: { version: '1.0.0', startedAt: STAMP, cameras: 'running' },
    },
  }));
  await setRows(store, 'automations', [WAKE, DIM]);
  await setRows(store, 'clients', [PHONE, DESK]);
  await setRows(store, 'devices', [LAMP, PLUG]);
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Root, { store }));
  });
  return store;
}

function since(mounted: Readonly<Record<Probe, number>>): Record<Probe, number> {
  const delta = { ...renders };
  for (const probe of PROBES) delta[probe] -= mounted[probe];
  return delta;
}

beforeEach(() => {
  for (const probe of PROBES) renders[probe] = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    callback();
    return 0;
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

describe('hot table readers', () => {
  it('stay still while automation runs, client heartbeats and device state change', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const names = seen.names;
    for (let tick = 1; tick <= 20; tick += 1) {
      await setRows(store, 'automations', [automation('1', 'Wake up', tick), DIM]);
      await setRows(store, 'clients', [
        { ...PHONE, last_seen_at: new Date(Date.parse(STAMP) + tick * 1000).toISOString() },
        DESK,
      ]);
      const lamp: Device = { ...LAMP, online: tick % 2 === 0 };
      await setRows(store, 'devices', [lamp, PLUG]);
    }
    expect(since(mounted)).toEqual({
      wholeAutomations: 20,
      names: 0,
      wholeClients: 20,
      choose: 0,
      ring: 0,
      lines: 0,
    });
    expect(seen.names).toBe(names);
    expect(seen.choose).toBe(true);
  });

  it('follow the fields they read', async () => {
    const store = await mount();
    const mounted = { ...renders };
    await setRows(store, 'automations', [automation('1', 'Morning'), DIM]);
    expect(seen.names?.get(WAKE.id)).toBe('Morning');
    await setRows(store, 'clients', [{ ...PHONE, role: 'member' }, DESK]);
    expect(seen.choose).toBe(false);
    await setRows(store, 'devices', [deviceFixture(0, { id: 'lamp', name: 'Desk lamp' }), PLUG]);
    expect(since(mounted)).toMatchObject({ names: 1, choose: 1, ring: 1, lines: 2 });
  });
});
