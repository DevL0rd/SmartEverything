import { act, createElement, use, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SNAPSHOT, type Snapshot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PickerSourceContext,
  usePickerSource,
  type PickerView,
} from '../components/widget-board/picker-source';
import { ScreenPause, ScreenPausedContext } from '../design/screen-pause';
import { CommandLedger } from './command-ledger';
import { EntityStore } from './entity-store';
import { PickerSourceProvider } from './picker-source';
import { snapshotWire } from './snapshot-fixture';
import { StoreProvider } from './store-context';

const KITCHEN = { id: '00000000-0000-4000-8000-000000000011', name: 'Kitchen', position: 0 };
const HALL = { id: '00000000-0000-4000-8000-000000000012', name: 'Hall', position: 1 };

function snapshotOf(seq: number, rooms: readonly (typeof KITCHEN)[], homeName = 'Home'): Snapshot {
  const base = SNAPSHOT.parse(snapshotWire());
  return SNAPSHOT.parse({
    ...base,
    seq,
    tables: { ...base.tables, rooms, settings: { ...base.tables.settings, home_name: homeName } },
  });
}

let frames: (() => void)[] = [];
let root: Root | null = null;

beforeEach(() => {
  frames = [];
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
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

function ContextReader({ onRender }: { readonly onRender: () => void }): null {
  use(PickerSourceContext);
  onRender();
  return null;
}

function Gallery({ onView }: { readonly onView: (view: PickerView) => void }): null {
  onView(usePickerSource());
  return null;
}

async function mount(store: EntityStore, children: ReactNode, pause?: ScreenPause): Promise<void> {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const tree = createElement(StoreProvider, {
    runtime: { store, ledger: new CommandLedger(store) },
    children: createElement(PickerSourceProvider, null, children),
  });
  await act(() => {
    root?.render(
      pause === undefined
        ? tree
        : createElement(ScreenPausedContext.Provider, { value: pause }, tree),
    );
    return Promise.resolve();
  });
}

async function replace(store: EntityStore, snapshot: Snapshot): Promise<void> {
  await act(() => {
    store.replace(snapshot);
    return Promise.resolve();
  });
}

describe('PickerSourceProvider', () => {
  it('keeps one context value and no store subscription while no gallery is open', async () => {
    const store = new EntityStore();
    store.replace(snapshotOf(1, [KITCHEN]));
    const baseline = store.subscriptions.size;
    const onRender = vi.fn<() => void>();
    await mount(store, createElement(ContextReader, { onRender }));
    expect(store.subscriptions.size).toBe(baseline);
    await replace(store, snapshotOf(2, [KITCHEN, HALL]));
    await replace(store, snapshotOf(3, [HALL]));
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it('re-renders an open gallery only when devices, rooms or groups change', async () => {
    const store = new EntityStore();
    store.replace(snapshotOf(1, [KITCHEN]));
    const baseline = store.subscriptions.size;
    const views: PickerView[] = [];
    await mount(
      store,
      createElement(Gallery, {
        onView: (view) => {
          views.push(view);
        },
      }),
    );
    expect(store.subscriptions.size).toBe(baseline + 1);
    expect(views.map((view) => view.state.rooms.map((room) => room.name))).toEqual([['Kitchen']]);
    await replace(store, snapshotOf(2, [KITCHEN], 'Renamed home'));
    expect(views).toHaveLength(1);
    await replace(store, snapshotOf(3, [KITCHEN, HALL], 'Renamed home'));
    expect(views.map((view) => view.state.rooms.map((room) => room.name))).toEqual([
      ['Kitchen'],
      ['Kitchen', 'Hall'],
    ]);
    expect(views.at(-1)?.read()).toBe(views.at(-1)?.state);
    act(() => {
      root?.unmount();
    });
    root = null;
    expect(store.subscriptions.size).toBe(baseline);
  });

  it('holds gallery updates while its screen is paused and catches up on resume', async () => {
    const store = new EntityStore();
    store.replace(snapshotOf(1, [KITCHEN]));
    const pause = new ScreenPause(null, true);
    const views: PickerView[] = [];
    await mount(
      store,
      createElement(Gallery, {
        onView: (view) => {
          views.push(view);
        },
      }),
      pause,
    );
    await replace(store, snapshotOf(2, [KITCHEN, HALL]));
    expect(views).toHaveLength(1);
    act(() => {
      pause.setOwn(false);
      frames.splice(0).forEach((callback) => {
        callback();
      });
    });
    expect(views.at(-1)?.state.rooms.map((room) => room.name)).toEqual(['Kitchen', 'Hall']);
  });
});
