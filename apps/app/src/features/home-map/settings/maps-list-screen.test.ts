import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  type HomeMapFeed,
  type HomeMapSummary,
} from '@smarteverything/domain';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());
const created = vi.hoisted(() => ({ create: (): void => undefined }));
const updates = vi.hoisted(() => new Array<{ readonly mapId: string; readonly update: unknown }>());
const pane = vi.hoisted(() => ({ area: 412, split: false }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), ScrollView: stub('ScrollView') }));
vi.mock('expo-router', () => ({ useRouter: (): unknown => ({ push: vi.fn() }) }));
vi.mock('../../../components/badge', () => ({ Badge: stub('Badge') }));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/error-state', () => ({ ErrorState: stub('ErrorState') }));
vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../components/section', () => ({ List: stub('List') }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: stub('Skeleton') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/house-map/iso/iso-still', () => ({ IsoStill: stub('IsoStill') }));
vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: (): unknown => ({ floors: [{ id: 'floor-1' }] }),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { settings: { page: (path: string): string => `/settings/${path}` } },
}));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): unknown => pane,
  MASTER_WIDTH: 420,
  DETAIL_MIN_WIDTH: 560,
}));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: stub('SettingsFrame') }));
vi.mock('../../../settings/settings-page', () => ({ SettingsPageBody: stub('SettingsPageBody') }));
vi.mock('../../../store/selectors', () => ({ useDevices: (): unknown => [] }));
vi.mock('../data/home-map-query', () => ({ useHomeMap: (): unknown => ({ map: { id: 'm' } }) }));
vi.mock('../data/map-set-query', () => ({
  useHomeMapSet: (): unknown => ({ maps: null, failure: null, retry: vi.fn() }),
  useHomeMapSetActions: (): unknown => ({
    create: vi.fn(),
    update: (mapId: string, update: unknown): Promise<unknown> => {
      updates.push({ mapId, update });
      return Promise.resolve({ kind: 'offline' });
    },
  }),
  useRobotMapFeeds: (): null => null,
}));
vi.mock('../model/create-map', () => ({
  useCreateMap: (): unknown => ({
    create: created.create,
    busy: false,
    offline: false,
    problem: null,
  }),
}));
vi.mock('../settings', () => ({ HOME_MAPS_PATH: 'home/maps', HOME_MAP_SETTINGS_PAGE: 'home/map' }));

const screen = await import('./maps-list-screen');
const { MapsList, LookSection, mapSubLine, mapFedLine, nextMapName, addProblemOf, mapPageHref } =
  screen;
const { moveProblemOf, useMapOrder } = await import('./map-order');

describe('map settings pane layout', () => {
  it('opens the list scroller only when the Settings pane fits both columns', () => {
    const previous = { ...pane };
    const withDetail = createElement(screen.MapsListScreen, { detail: 'Selected map' });
    try {
      pane.split = true;
      pane.area = 1399;
      expect(of(render(withDetail), 'ScrollView')).toHaveLength(0);
      pane.area = 1400;
      expect(of(render(withDetail), 'ScrollView')).toHaveLength(1);
    } finally {
      Object.assign(pane, previous);
    }
  });
});

type SummaryPatch = Partial<Omit<HomeMapSummary, 'id'>> & { readonly id?: string };

function summary({ id = 'map-a', ...patch }: SummaryPatch): HomeMapSummary {
  return {
    id: HOME_MAP_MAP_ID.parse(id),
    name: 'Home',
    revision: 1,
    floorNames: ['Ground floor', 'First floor'],
    roomCount: 7,
    isDefault: false,
    position: 0,
    fedBy: [],
    hasScan: false,
    updatedAt: '2026-10-25T10:00:00.000Z',
    ...patch,
  };
}

function feed(deviceId: string, mapId: string | null): HomeMapFeed {
  return {
    deviceId,
    robotMapId: 1,
    robotMapName: 'Ground',
    isCurrent: true,
    target:
      mapId === null
        ? null
        : { mapId: HOME_MAP_MAP_ID.parse(mapId), floorId: HOME_MAP_FLOOR_ID.parse('floor-1') },
  };
}

function render(node: ReactNode): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(() => node));
  return [...seen];
}

const of = (entries: readonly Seen[], kind: string): readonly Props[] =>
  entries.filter((entry) => entry.kind === kind).map((entry) => entry.props);

const IDLE_ADD = { add: vi.fn(), busy: false, problem: null };

const IDLE_ORDER = { move: vi.fn(), busy: false, problem: null };

const isPress = (value: unknown): value is () => void => typeof value === 'function';

describe('the Home maps list lines', () => {
  it('counts floors and rooms, marks hand drawn maps and empty ones', () => {
    expect(mapSubLine(summary({ fedBy: ['Ground'] }))).toBe('2 floors · 7 rooms');
    expect(mapSubLine(summary({ floorNames: ['Studio'], roomCount: 1 }))).toBe(
      '1 floor · 1 room · drawn by hand',
    );
    expect(mapSubLine(summary({ floorNames: [], roomCount: 0 }))).toBe('No map yet');
  });

  it('names each robot that feeds the map once, and nothing for a map no robot feeds', () => {
    const names = (id: string): string | null => (id === 'gone' ? null : 'Robot vacuum');
    const feeds = [feed('robot', 'map-a'), feed('robot', 'map-a'), feed('gone', 'map-a')];
    expect(mapFedLine('map-a', feeds, names)).toBe('Fed by Robot vacuum · updates automatically');
    expect(mapFedLine('map-b', [...feeds, feed('robot', null)], names)).toBeNull();
  });

  it('picks the next free map name', () => {
    expect(nextMapName([])).toBe('Map 1');
    expect(nextMapName([summary({ name: 'Home' }), summary({ name: 'map 3' })])).toBe('Map 4');
  });

  it('explains why a map was not added', () => {
    expect(addProblemOf({ kind: 'offline' })).toBe('Connect to the hub to add a map');
    expect(addProblemOf({ kind: 'refused', message: 'No' })).toBe('No');
    expect(addProblemOf({ kind: 'unconfirmed' })).toBe("Couldn't confirm the new map · Try again");
    expect(addProblemOf({ kind: 'done', value: summary({}) })).toBeNull();
    expect(mapPageHref('map-a')).toBe('/settings/home/maps/map-a');
  });
});

describe('the Home maps list', () => {
  it('lists the maps in their order with the Default pill, the fed line and links', () => {
    const maps = [
      summary({ id: 'map-b', name: 'Cabin', position: 1 }),
      summary({ id: 'map-a', name: 'Home', position: 0, isDefault: true, fedBy: ['Ground'] }),
    ];
    const drawn = render(
      createElement(MapsList, {
        maps,
        fedLineOf: (id: string): string | null => (id === 'map-a' ? 'Fed by Robot vacuum' : null),
        selectedId: 'map-b',
        add: IDLE_ADD,
        order: IDLE_ORDER,
      }),
    );
    const rows = of(drawn, 'Interactive');
    expect(rows.map((row) => row['href'])).toEqual([
      '/settings/home/maps/map-a',
      '/settings/home/maps/map-b',
    ]);
    expect(rows.map((row) => row['selected'])).toEqual([false, true]);
    expect(rows[0]?.['label']).toBe('Home, Default, 2 floors · 7 rooms, Fed by Robot vacuum');
    expect(of(drawn, 'Badge')).toEqual([expect.objectContaining({ label: 'Default' })]);
    expect(of(drawn, 'IsoStill')).toHaveLength(2);
  });

  it('offers Create a map only in the row of a map with no content, and Add a map under the list', () => {
    const add = { ...IDLE_ADD, add: vi.fn() };
    const drawn = render(
      createElement(MapsList, {
        maps: [summary({}), summary({ id: 'map-e', name: 'Studio', roomCount: 0, position: 1 })],
        fedLineOf: () => null,
        selectedId: undefined,
        add,
        order: IDLE_ORDER,
      }),
    );
    const buttons = of(drawn, 'Button');
    expect(buttons.map((button) => button['label'])).toEqual(['Create a map', 'Add a map']);
    expect(buttons[0]?.['onPress']).toBe(created.create);
    expect(buttons[1]?.['onPress']).toBe(add.add);
    expect(of(drawn, 'IsoStill')).toHaveLength(1);
  });

  it('shows Add a map alone when there are no maps, and the problem when adding failed', () => {
    const drawn = render(
      createElement(MapsList, {
        maps: [],
        fedLineOf: () => null,
        selectedId: undefined,
        add: { ...IDLE_ADD, busy: true, problem: 'Connect to the hub to add a map' },
        order: IDLE_ORDER,
      }),
    );
    expect(of(drawn, 'List')).toHaveLength(0);
    expect(of(drawn, 'Button')).toEqual([
      expect.objectContaining({ label: 'Add a map', loading: true }),
    ]);
    expect(of(drawn, 'Text').map((text) => text.children)).toContain(
      'Connect to the hub to add a map',
    );
  });

  it('puts the map look of every map under the list', () => {
    const drawn = render(createElement(LookSection));
    expect(of(drawn, 'Text')[0]?.children).toBe('Map look · every map');
    expect(of(drawn, 'SettingsPageBody')[0]?.['page']).toBe('home/map');
  });

  it('uses the full settings pane for the overview without a separate scroll region', () => {
    const drawn = render(createElement(screen.MapsListScreen));
    expect(of(drawn, 'SettingsFrame')[0]).toMatchObject({
      title: 'Home maps',
      page: 'home/map',
      contentWidth: 'full',
    });
    expect(of(drawn, 'ScrollView')).toHaveLength(0);
    expect(of(drawn, 'Skeleton')).toHaveLength(1);
  });
});

describe('reordering the Home maps', () => {
  const maps = [
    summary({ id: 'map-c', name: 'Garage', position: 2 }),
    summary({ id: 'map-a', name: 'Home', position: 0 }),
    summary({ id: 'map-b', name: 'Cabin', position: 1 }),
  ];

  it('gives every row labelled move up and move down buttons that send the new position', () => {
    const order = { move: vi.fn(), busy: false, problem: null };
    const drawn = render(
      createElement(MapsList, {
        maps,
        fedLineOf: () => null,
        selectedId: undefined,
        add: IDLE_ADD,
        order,
      }),
    );
    const buttons = of(drawn, 'IconButton');
    expect(buttons.map((button) => [button['label'], button['disabled']])).toEqual([
      ['Move Home up', true],
      ['Move Home down', false],
      ['Move Cabin up', false],
      ['Move Cabin down', false],
      ['Move Garage up', false],
      ['Move Garage down', true],
    ]);
    const press = (index: number): void => {
      const onPress = buttons[index]?.['onPress'];
      if (isPress(onPress)) onPress();
    };
    press(2);
    press(3);
    expect(order.move.mock.calls).toEqual([
      ['map-b', 0],
      ['map-b', 2],
    ]);
  });

  it('shows no order buttons for a single map, and says why a move failed', () => {
    const drawn = render(
      createElement(MapsList, {
        maps: [summary({})],
        fedLineOf: () => null,
        selectedId: undefined,
        add: IDLE_ADD,
        order: { ...IDLE_ORDER, problem: 'Connect to the hub to reorder the maps' },
      }),
    );
    expect(of(drawn, 'IconButton')).toHaveLength(0);
    expect(of(drawn, 'Text').map((text) => text.children)).toContain(
      'Connect to the hub to reorder the maps',
    );
    expect(moveProblemOf({ kind: 'offline' })).toBe('Connect to the hub to reorder the maps');
    expect(moveProblemOf({ kind: 'refused', message: 'No' })).toBe('No');
    expect(moveProblemOf({ kind: 'unconfirmed' })).toBe(
      "Couldn't confirm the new order · Try again",
    );
    expect(moveProblemOf({ kind: 'done', value: null })).toBeNull();
  });

  it('updates the map with its new position and keeps the problem the hub answered', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
    updates.length = 0;
    const held: { order: ReturnType<typeof useMapOrder> | null } = { order: null };
    function Probe(): ReactNode {
      held.order = useMapOrder();
      return null;
    }
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      root.render(createElement(Probe));
    });
    await act(async () => {
      held.order?.move('map-b', 0);
      await Promise.resolve();
    });
    expect(updates).toEqual([{ mapId: 'map-b', update: { position: 0 } }]);
    expect(held.order?.problem).toBe('Connect to the hub to reorder the maps');
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
  });
});
