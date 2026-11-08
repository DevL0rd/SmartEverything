import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_FLOOR_ID,
  HOME_MAP_MAP_ID,
  HOME_MAP_SOURCE_ID,
  type HomeMap,
  type HomeMapFeed,
  type HomeMapSource,
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
const picker = vi.hoisted(() => ({ change: (_value: string): void => undefined }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('@tanstack/react-query', () => ({ useQueries: (): unknown => [] }));
vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/rows', () => ({
  NavRow: stub('NavRow'),
  SelectRow: (props: Props & { readonly onChange: (value: string) => void }): ReactNode => {
    picker.change = props.onChange;
    return stub('SelectRow')(props);
  },
}));
vi.mock('../../../components/section', () => ({ List: stub('List') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/house-map/iso/iso-still', () => ({ IsoStill: stub('IsoStill') }));
vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: (input: { readonly map: HomeMap }): unknown => ({
    floors: input.map.floors.map((floor) => ({ id: floor.id })),
  }),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { settings: { page: (path: string): string => `/settings/${path}` } },
}));
vi.mock('../../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/selectors', () => ({ useDevices: (): unknown => [] }));
vi.mock('../data/home-map-query', () => ({ homeMapQueryOptions: (): unknown => ({}) }));
vi.mock('../data/map-set-query', () => ({
  useHomeMapSet: (): unknown => ({ maps: [] }),
  useHomeMapSetActions: (): unknown => ({ setFeed: vi.fn() }),
  useRobotMapFeeds: (): unknown => [],
}));
vi.mock('../settings', () => ({ HOME_MAPS_PATH: 'home/maps' }));

const feedModule = await import('./robot-map-feed');
const {
  FeedCard,
  feedProblemOf,
  feedSummaryLines,
  feedTargets,
  feedsIn,
  lastUpdateLine,
  robotMapTitle,
  robotMapsHref,
  targetOptions,
} = feedModule;

const floorId = (id: string): HomeMap['floors'][number]['id'] => HOME_MAP_FLOOR_ID.parse(id);

function floor(id: string, name: string): HomeMap['floors'][number] {
  return {
    id: floorId(id),
    name,
    level: 0,
    elevation: 0,
    ceilingHeight: 2.6,
    rooms: [],
    walls: [],
    openings: [],
    objects: [],
    placements: [],
    annotations: [],
  };
}

function source(deviceId: string, at: string | null): HomeMapSource {
  return {
    id: HOME_MAP_SOURCE_ID.parse(`src-${deviceId}`),
    kind: 'xiaomi_vacuum',
    deviceId,
    floorId: floorId('ground'),
    transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
    frame: { uid: null, name: null, boundsSignature: 'b' },
    lastVersion: null,
    lastImportedAt: at,
    base: { rooms: [], walls: [], openings: [] },
    tombstones: [],
  };
}

function homeMap(
  id: string,
  name: string,
  floors: HomeMap['floors'],
  sources: readonly HomeMapSource[] = [],
): HomeMap {
  return {
    id: HOME_MAP_MAP_ID.parse(id),
    schemaVersion: 1,
    revision: 1,
    name,
    north: 0,
    updatedAt: '2026-10-25T10:00:00.000Z',
    floors,
    sources: [...sources],
    notices: [],
  };
}

const ROBOT = '6f1c1d4e-0d5a-4a39-9a37-1f2b3c4d5e6f';
const OTHER = '7a2b3c4d-1e2f-4a39-8b37-2f3b4c5d6e7f';

function feed(
  robotMapId: number,
  name: string | null,
  target: readonly [string, string] | null,
  deviceId = ROBOT,
): HomeMapFeed {
  return {
    deviceId,
    robotMapId,
    robotMapName: name,
    isCurrent: robotMapId === 1,
    target:
      target === null
        ? null
        : { mapId: HOME_MAP_MAP_ID.parse(target[0]), floorId: floorId(target[1]) },
  };
}

const MAPS = [
  homeMap('home', 'Home', [floor('ground', 'Ground floor'), floor('first', 'First floor')]),
  homeMap('studio', 'Studio', [floor('studio-floor', 'Studio')]),
];

const names = (id: string): string => (id === ROBOT ? 'Robot vacuum' : 'Upstairs robot');

function render(node: ReactNode): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(() => node));
  return [...seen];
}

const of = (entries: readonly Seen[], kind: string): readonly Props[] =>
  entries.filter((entry) => entry.kind === kind).map((entry) => entry.props);

describe('the robot map feed targets', () => {
  it('lists every floor of every map, names a one-floor map alone and ends with Not used', () => {
    expect(feedTargets(MAPS).map((target) => [target.key, target.label])).toEqual([
      ['home/ground', 'Home · Ground floor'],
      ['home/first', 'Home · First floor'],
      ['studio/studio-floor', 'Studio'],
      ['none', 'Not used'],
    ]);
    expect(feedTargets([]).at(-1)?.assignment).toEqual({ target: null });
  });

  it('shows which other robot map already feeds a floor', () => {
    const ground = feed(1, 'Ground', ['home', 'ground']);
    const upstairs = feed(2, 'Upstairs', ['home', 'first']);
    const theirs = feed(5, null, ['studio', 'studio-floor'], OTHER);
    const options = targetOptions([ground, upstairs, theirs], ground, feedTargets(MAPS), names);
    expect(options.map((option) => option.description)).toEqual([
      undefined,
      'Fed by Robot map "Upstairs"',
      'Fed by Robot map 5 of Upstairs robot',
      undefined,
    ]);
  });

  it('summarises which robot map feeds which floor, per robot', () => {
    const feeds = [
      feed(1, 'Ground', ['home', 'ground']),
      feed(2, 'Upstairs', ['home', 'first']),
      feed(3, 'Garage', null),
      feed(4, 'Cabin', null, OTHER),
    ];
    expect(feedSummaryLines(feeds, feedTargets(MAPS), names)).toEqual([
      'Robot vacuum: Ground → Home · Ground floor · Upstairs → Home · First floor · Garage → Not used',
      'Upstairs robot: Cabin → Not used',
    ]);
    expect(feedsIn(feeds, { mapId: 'home' })).toHaveLength(2);
    expect(feedsIn(feeds, { deviceId: OTHER })).toHaveLength(1);
    expect(robotMapTitle(feed(9, null, null))).toBe('Robot map 9');
    expect(robotMapsHref()).toBe('/settings/home/maps/robot-maps');
  });

  it('shows the latest automatic update of the robots in view and never a sync control', () => {
    const now = Date.parse('2026-10-25T16:00:00.000Z');
    const maps = [
      homeMap('home', 'Home', [], [source(ROBOT, '2026-10-25T09:00:00.000Z')]),
      homeMap('cabin', 'Cabin', [], [source(OTHER, '2026-10-25T15:00:00.000Z')]),
    ];
    expect(lastUpdateLine(maps, new Set([ROBOT]), now)).toMatch(
      /^Updates automatically · last update today /u,
    );
    expect(lastUpdateLine(maps, new Set(), now)).toBe('Updates automatically');
    expect(Object.keys(feedModule).some((name) => /sync|refresh|reimport/iu.test(name))).toBe(
      false,
    );
  });

  it('explains why a feed change did not land', () => {
    expect(feedProblemOf({ kind: 'offline' })).toBe(
      'Connect to the hub to change which floor this map feeds',
    );
    expect(feedProblemOf({ kind: 'refused', message: 'No' })).toBe('No');
    expect(feedProblemOf({ kind: 'done', value: feed(1, 'Ground', null) })).toBeNull();
  });
});

describe('the robot map feed card', () => {
  it('draws the fed floor, the pick list on the current target and sends the picked target', () => {
    const onPick = vi.fn();
    const ground = feed(1, 'Ground', ['home', 'ground']);
    const data = { feeds: [ground], maps: MAPS, targets: feedTargets(MAPS), deviceName: names };
    const drawn = render(
      createElement(FeedCard, { feed: ground, data, busy: false, problem: null, onPick }),
    );
    expect(of(drawn, 'Text').map((text) => text.children)).toEqual([
      'Robot map "Ground"',
      'Robot vacuum · the robot uses it now',
    ]);
    expect(of(drawn, 'IsoStill')).toHaveLength(1);
    const select = of(drawn, 'SelectRow')[0];
    expect(select?.['value']).toBe('home/ground');
    picker.change('studio/studio-floor');
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'studio/studio-floor', label: 'Studio' }),
    );
  });

  it('shows a placeholder for an unused robot map and the problem when a change failed', () => {
    const garage = feed(3, 'Garage', null);
    const data = { feeds: [garage], maps: MAPS, targets: feedTargets(MAPS), deviceName: names };
    const drawn = render(
      createElement(FeedCard, {
        feed: garage,
        data,
        busy: true,
        problem: 'No',
        onPick: vi.fn(),
      }),
    );
    expect(of(drawn, 'IsoStill')).toHaveLength(0);
    expect(of(drawn, 'Icon')[0]?.['name']).toBe('route');
    expect(of(drawn, 'SelectRow')[0]).toMatchObject({ value: 'none', disabled: true });
    expect(of(drawn, 'Text').map((text) => text.children)).toContain('No');
  });
});
