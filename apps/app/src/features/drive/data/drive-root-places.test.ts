import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DriveRoot, DriveSuggestion } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLedger } from '../../../store/command-ledger';
import { EntityStore } from '../../../store/entity-store';
import { makeTable } from '../../../store/state';
import { StoreProvider } from '../../../store/store-context';
import type { DriveRootPlace } from '../model/drive-access';
import { useSuggestionViews } from '../priority/suggestion-views';
import {
  OTHER_ROOT_ID,
  OWNER_ID,
  ROOT_ID,
  imageFixture,
  personalRootRow,
  rootRow,
} from './fixtures';
import { useDriveRootBytes, useDriveRootPlaces, useDriveRoots } from './tables';

const STAMP = '2026-11-14T09:00:00.000Z';

const PROBES = ['whole', 'places', 'bytes', 'folderBytes', 'suggestions'] as const;

type Probe = (typeof PROBES)[number];

const renders: Record<Probe, number> = {
  whole: 0,
  places: 0,
  bytes: 0,
  folderBytes: 0,
  suggestions: 0,
};

const seen: { places: readonly DriveRootPlace[] | null; bytes: number | null } = {
  places: null,
  bytes: null,
};

const SUGGESTIONS: readonly DriveSuggestion[] = [
  { item: imageFixture({ rootId: ROOT_ID }), at: STAMP, reason: 'opened' },
  { item: imageFixture({ rootId: OTHER_ROOT_ID }), at: STAMP, reason: 'edited' },
];

function useRenderCount(name: Probe): void {
  useEffect(() => {
    renders[name] += 1;
  });
}

function Whole(): ReactNode {
  useRenderCount('whole');
  useDriveRoots();
  return null;
}

function Places(): ReactNode {
  useRenderCount('places');
  const places = useDriveRootPlaces();
  useEffect(() => {
    seen.places = places;
  });
  return null;
}

function Bytes(): ReactNode {
  useRenderCount('bytes');
  const bytes = useDriveRootBytes(ROOT_ID);
  useEffect(() => {
    seen.bytes = bytes;
  });
  return null;
}

function FolderBytes(): ReactNode {
  useRenderCount('folderBytes');
  useDriveRootBytes(null);
  return null;
}

function Suggestions(): ReactNode {
  useRenderCount('suggestions');
  useSuggestionViews(SUGGESTIONS);
  return null;
}

const SUBTREE = createElement(
  Fragment,
  null,
  createElement(Whole),
  createElement(Places),
  createElement(Bytes),
  createElement(FolderBytes),
  createElement(Suggestions),
);

function Root({ store }: { readonly store: EntityStore }): ReactNode {
  const [runtime] = useState(() => ({ store, ledger: new CommandLedger(store) }));
  return StoreProvider({ runtime, children: SUBTREE });
}

const SHARED = rootRow(ROOT_ID, 'ready');
const MINE = personalRootRow(OTHER_ROOT_ID, OWNER_ID);

async function setRoots(store: EntityStore, roots: readonly DriveRoot[]): Promise<void> {
  await act(async () => {
    store.update((state) => ({
      ...state,
      tables: {
        ...state.tables,
        drive_roots: makeTable(
          Object.fromEntries(roots.map((root) => [root.id, root])),
          roots.map((root) => root.id),
          state.tables.drive_roots.version + 1,
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
      client: {
        id: 'phone',
        name: 'phone',
        platform: 'android',
        kind: 'phone',
        role: 'owner',
        built_in: false,
        profile_id: OWNER_ID,
        created_at: STAMP,
        last_seen_at: null,
      },
      hub: { version: '1.0.0', startedAt: STAMP, cameras: 'running' },
    },
  }));
  await setRoots(store, [SHARED, MINE]);
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

function counted(root: DriveRoot, tick: number): DriveRoot {
  return { ...root, items: tick, folders: tick, bytes: tick * 1024 };
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

describe('drive root places', () => {
  it('stay still while the Hub counts files into a drive', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const places = seen.places;
    for (let tick = 1; tick <= 20; tick += 1) {
      await setRoots(store, [counted(SHARED, tick), counted(MINE, tick)]);
    }
    expect(since(mounted)).toEqual({
      whole: 20,
      places: 0,
      bytes: 20,
      folderBytes: 0,
      suggestions: 0,
    });
    expect(seen.places).toBe(places);
    expect(seen.bytes).toBe(20 * 1024);
  });

  it('follow a change to a drive’s state and keep the untouched drive', async () => {
    const store = await mount();
    const mounted = { ...renders };
    const [, mine] = seen.places ?? [];
    await setRoots(store, [{ ...SHARED, state: 'scanning', stateReason: 'Reading' }, MINE]);
    expect(since(mounted)).toMatchObject({ places: 1, bytes: 0, folderBytes: 0 });
    expect(seen.places?.[0]).toMatchObject({ id: ROOT_ID, state: 'scanning' });
    expect(seen.places?.[1]).toBe(mine);
  });
});
