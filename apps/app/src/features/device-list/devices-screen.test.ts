import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceFixture } from '../../store/device-fixture';
import type * as Hrefs from '../../app-shell/hrefs';
import type { HomeMapSelection } from '../home-map';
import type { DeviceQuery } from './model/device-filter';

interface Probe {
  params: { room?: string; status?: string; device?: string };
  stageMounts: number;
  stageUnmounts: number;
  focus: HomeMapSelection[];
  queries: DeviceQuery[];
  chips: (string | null)[];
  roomCards: string[];
  selectedDeviceIds: (string | null)[];
  selectedRoomIds: (string | null)[];
  pick: ((selection: HomeMapSelection) => void) | null;
  clear: (() => void) | null;
  change: ((query: DeviceQuery) => void) | null;
  choice: { kind: string; map?: unknown };
  splits: number;
  summaries: unknown[];
  noMaps: { map: unknown; className: unknown }[];
}

const probe: Probe = vi.hoisted(() => ({
  params: {},
  stageMounts: 0,
  stageUnmounts: 0,
  focus: [],
  queries: [],
  chips: [],
  roomCards: [],
  selectedDeviceIds: [],
  selectedRoomIds: [],
  pick: null,
  clear: null,
  change: null,
  choice: { kind: 'map', map: { id: 'home', name: 'Home', roomCount: 3 } },
  splits: 0,
  summaries: [],
  noMaps: [],
}));

interface Slot {
  readonly children?: ReactNode;
  readonly stage?: ReactNode;
  readonly header?: ReactNode;
}

const pass = ({ children }: Slot): ReactNode => createElement(Fragment, null, children);
const none = (): null => null;
const DEVICES = vi.hoisted(() => new Array<unknown>());
const ROOMS = vi.hoisted(() => new Array<unknown>());

vi.mock('expo-router', () => ({ useLocalSearchParams: (): Probe['params'] => probe.params }));
vi.mock('../../store/selectors', () => ({
  useListedDevices: (): unknown[] => DEVICES,
  useRooms: (): unknown[] => ROOMS,
}));
vi.mock('../../app-shell/main-pages', () => ({ mainPageSettings: none }));
vi.mock('../../app-shell/hrefs', async (importOriginal) => {
  const original = await importOriginal<typeof Hrefs>();
  return {
    ...original,
    href: {
      ...original.href,
      settings: { ...original.href.settings, page: (): string => '/settings' },
    },
  };
});
vi.mock('../../components/screen', () => ({ Screen: pass }));
vi.mock('../../components/page-header', () => ({ PageHeader: none }));
vi.mock('../../components/banner', () => ({ Banner: none }));
vi.mock('../../components/button', () => ({ Button: none }));
vi.mock('../../components/empty-state', () => ({ EmptyState: none }));
vi.mock('../../components/text', () => ({ Text: none }));
vi.mock('../../components/use-lifecycle-log', () => ({ useLifecycleLog: none }));
vi.mock('../devices', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isOffline: (): boolean => false,
}));
vi.mock('../device-visuals', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  familyIcon: (): string => 'bulb',
}));
vi.mock('./components/map-selection', () => ({
  SelectedRoomCard: ({ roomId }: { readonly roomId: string }): null => {
    probe.roomCards.push(roomId);
    return null;
  },
}));
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: pass,
}));
vi.mock('./components/groups-strip', () => ({ GroupsStrip: none }));
vi.mock('./components/device-grid', () => ({
  DeviceGrid: ({
    header,
    selectedDeviceId,
    selectedRoomId,
  }: Slot & {
    readonly selectedDeviceId: string | null;
    readonly selectedRoomId: string | null;
  }): ReactNode => {
    probe.selectedDeviceIds.push(selectedDeviceId);
    probe.selectedRoomIds.push(selectedRoomId);
    return header;
  },
}));
vi.mock('./components/device-filters', () => ({
  DeviceFilters: ({
    query,
    selection,
    onChange,
  }: {
    readonly query: DeviceQuery;
    readonly onChange: (query: DeviceQuery) => void;
    readonly selection: { readonly label: string; readonly onClear: () => void } | null;
  }): null => {
    probe.queries.push(query);
    probe.chips.push(selection?.label ?? null);
    probe.clear = selection?.onClear ?? null;
    probe.change = onChange;
    return null;
  },
}));
vi.mock('./components/pinned-split', () => ({
  PinnedSplit: ({ stage, children }: Slot): ReactNode => {
    probe.splits += 1;
    return createElement(Fragment, null, stage, children);
  },
}));
vi.mock('../home-map/components/stage/no-map-entry', () => ({
  NoMapEntry: (props: { readonly map: unknown; readonly className: unknown }): null => {
    probe.noMaps.push({ map: props.map, className: props.className });
    return null;
  },
}));
vi.mock('./components/pinned-map', async () => {
  const { useEffect } = await import('react');
  return {
    usePinnedChoice: (): Probe['choice'] => probe.choice,
    PinnedMap: ({
      summary,
      focus,
      onSelect,
    }: {
      readonly summary: unknown;
      readonly focus: HomeMapSelection;
      readonly onSelect: (selection: HomeMapSelection) => void;
    }): null => {
      useEffect(() => {
        probe.stageMounts += 1;
        return (): void => {
          probe.stageUnmounts += 1;
        };
      }, []);
      probe.summaries.push(summary);
      probe.focus.push(focus);
      probe.pick = onSelect;
      return null;
    },
  };
});
vi.mock('./model/device-filter', () => ({
  ANY: 'any',
  NO_ROOM: 'none',
  isFiltering: (query: DeviceQuery): boolean => query.text !== '' || query.offline,
  groupedDevices: (): [] => [],
  roomOptions: (): [] => [],
  kindOptions: (): [] => [],
  selectedDevice: (query: DeviceQuery): string | null => query.device ?? null,
  selectedRoom: (query: DeviceQuery): string | null =>
    query.device === undefined && query.room !== 'any' && query.room !== 'none' ? query.room : null,
}));

const { DevicesScreen } = await import('./devices-screen');

let root: Root;

function render(params: Probe['params']): void {
  probe.params = params;
  act(() => {
    root.render(createElement(DevicesScreen));
  });
}

beforeEach(() => {
  DEVICES.splice(0, DEVICES.length, deviceFixture(0));
  ROOMS.splice(0, ROOMS.length, { id: 'lounge', name: 'Lounge', position: 0 });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
  probe.stageMounts = 0;
  probe.stageUnmounts = 0;
  probe.focus.length = 0;
  probe.queries.length = 0;
  probe.chips.length = 0;
  probe.roomCards.length = 0;
  probe.selectedDeviceIds.length = 0;
  probe.selectedRoomIds.length = 0;
  probe.pick = null;
  probe.clear = null;
  probe.change = null;
  probe.choice = { kind: 'map', map: { id: 'home', name: 'Home', roomCount: 3 } };
  probe.splits = 0;
  probe.summaries.length = 0;
  probe.noMaps.length = 0;
});

describe('devices screen with the pinned home map', () => {
  it('keeps the stage mounted when Home sends a room and syncs the room into the query', () => {
    render({});
    expect(probe.focus.at(-1)).toEqual({ kind: 'none' });
    render({ room: 'kitchen' });
    expect(probe.stageMounts).toBe(1);
    expect(probe.stageUnmounts).toBe(0);
    expect(probe.queries.at(-1)?.room).toBe('kitchen');
    expect(probe.focus.at(-1)).toEqual({ kind: 'room', roomId: 'kitchen' });
  });

  it('keeps the stage mounted when the offline status arrives and when the room is cleared', () => {
    render({ room: 'hall' });
    render({ room: 'hall', status: 'offline' });
    expect(probe.queries.at(-1)).toMatchObject({ room: 'hall', offline: true });
    render({});
    expect(probe.queries.at(-1)).toMatchObject({ room: 'any', offline: false });
    expect(probe.stageMounts).toBe(1);
    expect(probe.stageUnmounts).toBe(0);
  });

  it('filters by a room picked on the map without remounting the stage', () => {
    render({});
    act(() => {
      probe.pick?.({ kind: 'room', roomId: 'lounge' });
    });
    expect(probe.queries.at(-1)?.room).toBe('lounge');
    expect(probe.focus.at(-1)).toEqual({ kind: 'room', roomId: 'lounge' });
    expect(probe.chips.at(-1)).toBe('Lounge');
    expect(probe.roomCards.at(-1)).toBe('lounge');
    expect(probe.selectedRoomIds.at(-1)).toBe('lounge');
    expect(probe.selectedDeviceIds.at(-1)).toBeNull();
    act(() => {
      probe.pick?.({ kind: 'none' });
    });
    expect(probe.focus.at(-1)).toEqual({ kind: 'none' });
    expect(probe.chips.at(-1)).toBeNull();
    expect(probe.stageMounts).toBe(1);
    expect(probe.stageUnmounts).toBe(0);
  });

  it('keeps the grid layout for search and unassigned-room results', () => {
    render({});
    const current = probe.queries.at(-1);
    act(() => {
      if (current !== undefined) {
        probe.change?.({ ...current, text: 'Device 0', room: 'none' });
      }
    });
    expect(probe.queries.at(-1)).toMatchObject({ room: 'none', text: 'Device 0' });
    expect(probe.selectedDeviceIds.at(-1)).toBeNull();
    expect(probe.roomCards).toHaveLength(0);
    expect(probe.selectedRoomIds.at(-1)).toBeNull();
  });

  it('selects a device tapped on the map in place, shows its chip and clears it from the chip', () => {
    const only = deviceFixture(0);
    const deviceId = only.id;
    render({ room: 'lounge' });
    const before = probe.roomCards.length;
    act(() => {
      probe.pick?.({ kind: 'device', deviceId });
    });
    expect(probe.queries.at(-1)).toMatchObject({ room: 'any', device: deviceId });
    expect(probe.focus.at(-1)).toEqual({ kind: 'device', deviceId });
    expect(probe.chips.at(-1)).toBe(only.label);
    expect(probe.selectedDeviceIds.at(-1)).toBe(deviceId);
    expect(probe.roomCards).toHaveLength(before);
    act(() => {
      probe.clear?.();
    });
    expect(probe.focus.at(-1)).toEqual({ kind: 'none' });
    expect(probe.stageMounts).toBe(1);
    expect(probe.stageUnmounts).toBe(0);
  });

  it('takes a device selection from the address without remounting the stage', () => {
    render({});
    render({ device: 'lamp' });
    expect(probe.focus.at(-1)).toEqual({ kind: 'device', deviceId: 'lamp' });
    expect(probe.selectedDeviceIds.at(-1)).toBe('lamp');
    expect(probe.stageMounts).toBe(1);
  });

  it('arrives with a device in the address, keeps the stage and focuses that device', () => {
    render({ device: 'lamp' });
    expect(probe.queries[0]).toMatchObject({ room: 'any', device: 'lamp' });
    expect(probe.focus.at(-1)).toEqual({ kind: 'device', deviceId: 'lamp' });
    render({ device: 'lamp', status: 'offline' });
    expect(probe.focus.at(-1)).toEqual({ kind: 'device', deviceId: 'lamp' });
    expect(probe.selectedDeviceIds.at(-1)).toBe('lamp');
    expect(probe.stageMounts).toBe(1);
    expect(probe.stageUnmounts).toBe(0);
  });

  it('clears the selected device when a room is picked from the filters', () => {
    render({ device: 'lamp' });
    const current = probe.queries.at(-1);
    act(() => {
      if (current !== undefined) probe.change?.({ ...current, room: 'lounge' });
    });
    expect(probe.queries.at(-1)).toMatchObject({ room: 'lounge', device: undefined });
    expect(probe.focus.at(-1)).toEqual({ kind: 'room', roomId: 'lounge' });
    expect(probe.stageMounts).toBe(1);
  });

  it('starts from the room and status of the address', () => {
    render({ room: 'study', status: 'offline' });
    expect(probe.queries[0]).toMatchObject({ room: 'study', offline: true, text: '' });
  });
});

describe('devices screen without a drawn map', () => {
  it('pins Create a map for a blank map at its own height, with no divider and no stage', () => {
    const cabin = { id: 'cabin', name: 'Cabin', roomCount: 0 };
    probe.choice = { kind: 'blank', map: cabin };
    render({});
    expect(probe.noMaps.at(-1)).toEqual({
      map: cabin,
      className: 'rounded-none border-x-0 border-t-0',
    });
    expect(probe.splits).toBe(0);
    expect(probe.stageMounts).toBe(0);
    expect(probe.queries.length).toBeGreaterThan(0);
  });

  it('offers the default Home map when there are no maps at all', () => {
    probe.choice = { kind: 'blank', map: null };
    render({});
    expect(probe.noMaps.at(-1)?.map).toBeNull();
    expect(probe.splits).toBe(0);
  });

  it('keeps the divider and a loading stage while the maps are still being read', () => {
    probe.choice = { kind: 'loading' };
    render({});
    expect(probe.noMaps).toHaveLength(0);
    expect(probe.splits).toBeGreaterThan(0);
    expect(probe.summaries.at(-1)).toBeNull();
  });
});
