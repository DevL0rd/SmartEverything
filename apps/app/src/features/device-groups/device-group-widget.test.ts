import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const selects: { renders: number; labels: readonly string[] } = { renders: 0, labels: [] };

vi.mock('../../components/select', () => ({
  Select: ({ options }: { readonly options: readonly { readonly label: string }[] }): null => {
    selects.renders += 1;
    selects.labels = options.map((option) => option.label);
    return null;
  },
}));
vi.mock('./widget/light-group', () => ({ LightGroup: (): null => null }));
vi.mock('./widget/group-preview', () => ({ GroupPreview: (): null => null }));

const { CommandLedger } = await import('../../store/command-ledger');
const { deviceFixture, stateFixture } = await import('../../store/device-fixture');
const { EntityStore } = await import('../../store/entity-store');
const { makeTable } = await import('../../store/state');
const { StoreProvider } = await import('../../store/store-context');
const { DEVICE_GROUP_WIDGET } = await import('./device-group-widget');

type Store = InstanceType<typeof EntityStore>;
type Device = ReturnType<typeof deviceFixture>;

const KITCHEN = '00000000-0000-4000-8000-0000000000a1';
const HALL = '00000000-0000-4000-8000-0000000000b1';
const ROOMS = [
  { id: KITCHEN, name: 'Kitchen', position: 0 },
  { id: HALL, name: 'Hall', position: 1 },
];
const LAMP = deviceFixture(0, { id: 'lamp', kind: 'light', room_id: KITCHEN });
const SPOT = deviceFixture(1, { id: 'spot', kind: 'light', room_id: KITCHEN });
const VALUE = { target: { kind: 'room', roomId: KITCHEN, families: ['light'] } };

function Editor(): ReactNode {
  const editor = DEVICE_GROUP_WIDGET.instanceOptions?.editor;
  if (editor === undefined) throw new Error('The light group widget has no options editor.');
  return editor({ value: VALUE, onChange: (): undefined => undefined });
}

function Root({ store }: { readonly store: Store }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: createElement(Editor) });
}

async function setDevices(store: Store, devices: readonly Device[]): Promise<void> {
  await act(async () => {
    store.update((state) => ({
      ...state,
      tables: {
        ...state.tables,
        devices: makeTable(
          Object.fromEntries(devices.map((device) => [device.id, device])),
          devices.map((device) => device.id),
          state.tables.devices.version + 1,
        ),
      },
    }));
    await Promise.resolve();
  });
}

function mount(): Store {
  const store = new EntityStore();
  store.update(() => {
    const state = stateFixture([LAMP, SPOT], {});
    const rooms = makeTable(
      Object.fromEntries(ROOMS.map((room) => [room.id, room])),
      [KITCHEN, HALL],
      1,
    );
    return { ...state, loaded: true, tables: { ...state.tables, rooms } };
  });
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

beforeEach(() => {
  selects.renders = 0;
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

describe('light group options editor', () => {
  it('stays still while device heartbeats change rows that leave its choices alone', async () => {
    const store = mount();
    const mounted = selects.renders;
    expect(selects.labels).toEqual(['Kitchen lights']);
    for (let tick = 1; tick <= 20; tick += 1) {
      await setDevices(store, [{ ...LAMP, online: tick % 2 === 0 }, SPOT]);
    }
    expect(selects.renders - mounted).toBe(0);
  });

  it('follows a change to its choices', async () => {
    const store = mount();
    const mounted = selects.renders;
    await setDevices(store, [
      LAMP,
      SPOT,
      deviceFixture(2, { id: 'hall-1', kind: 'light', room_id: HALL }),
      deviceFixture(3, { id: 'hall-2', kind: 'light', room_id: HALL }),
    ]);
    expect(selects.renders - mounted).toBe(1);
    expect(selects.labels).toEqual(['Kitchen lights', 'Hall lights']);
  });
});
