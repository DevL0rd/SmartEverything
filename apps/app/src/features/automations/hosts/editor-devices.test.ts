import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from '../../../store/command-ledger';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';
import { EntityStore } from '../../../store/entity-store';
import { useDevices } from '../../../store/selectors';
import { StoreProvider } from '../../../store/store-context';
import { makeTable, type Device, type StoreState } from '../../../store/state';
import { editorDevicesIn, shownEditorDevicesIn, useEditorDevices } from './editor-devices';

const TELEMETRY = { updated_at: '2026-11-21T10:00:00.000Z', details: { battery: 40 } };

function withDevices(state: StoreState, devices: readonly Device[]): StoreState {
  return {
    ...state,
    tables: {
      ...state.tables,
      devices: makeTable(
        Object.fromEntries(devices.map((device) => [device.id, device])),
        devices.map((device) => device.id),
        state.tables.devices.version + 1,
      ),
    },
  };
}

const watch = deviceFixture(0);
const lamp = deviceFixture(1, { hidden: true });

describe('editor device selectors', () => {
  it('keeps the same list when a device changes only its telemetry', () => {
    const before = stateFixture([watch, lamp], {});
    const kept = editorDevicesIn(before);
    const after = withDevices(before, [deviceFixture(0, TELEMETRY), lamp]);
    expect(editorDevicesIn(after)).toBe(kept);
  });

  it('gives a new list when a device is renamed, moved or changes its capabilities', () => {
    const base = stateFixture([watch, lamp], {});
    const kept = editorDevicesIn(base);
    const renamed = editorDevicesIn(withDevices(base, [deviceFixture(0, { name: 'Wrist' }), lamp]));
    expect(renamed).not.toBe(kept);
    expect(renamed[0]?.label).toBe('Wrist');
    const moved = editorDevicesIn(
      withDevices(base, [deviceFixture(0, { room_id: 'room-9' }), lamp]),
    );
    expect(moved[0]?.room_id).toBe('room-9');
    const bare = editorDevicesIn(withDevices(base, [deviceFixture(0, { capabilities: [] }), lamp]));
    expect(bare[0]?.capabilities).toEqual([]);
  });

  it('keeps hidden devices out of the shown list', () => {
    const state = stateFixture([watch, lamp], {});
    expect(shownEditorDevicesIn(state).map((device) => device.id)).toEqual([watch.id]);
    expect(editorDevicesIn(state).map((device) => device.id)).toEqual([watch.id, lamp.id]);
  });
});

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    queueMicrotask(callback);
    return 0;
  });
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

function mount(store: EntityStore): { readonly editor: number; readonly raw: number } {
  const counts = { editor: 0, raw: 0 };
  function Editor(): ReactNode {
    useEditorDevices();
    counts.editor += 1;
    return null;
  }
  function Raw(): ReactNode {
    useDevices({ includeHidden: true });
    counts.raw += 1;
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
      StoreProvider({
        runtime: { store, ledger: new CommandLedger(store) },
        children: [createElement(Editor, { key: 'editor' }), createElement(Raw, { key: 'raw' })],
      }),
    );
  });
  return counts;
}

describe('editor device subscription', () => {
  it('does not render again when only device telemetry changes', async () => {
    const store = new EntityStore();
    store.update(() => stateFixture([watch, lamp], {}));
    const counts = mount(store);
    const first = { ...counts };
    for (let tick = 0; tick < 5; tick += 1) {
      await act(async () => {
        store.update((state) =>
          withDevices(state, [
            deviceFixture(0, { ...TELEMETRY, details: { battery: tick } }),
            lamp,
          ]),
        );
        await Promise.resolve();
      });
    }
    expect(counts.raw - first.raw).toBe(5);
    expect(counts.editor).toBe(first.editor);
    await act(async () => {
      store.update((state) => withDevices(state, [deviceFixture(0, { name: 'Wrist' }), lamp]));
      await Promise.resolve();
    });
    expect(counts.editor).toBe(first.editor + 1);
  });
});
