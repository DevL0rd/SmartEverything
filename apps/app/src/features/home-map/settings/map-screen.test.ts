import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP,
  HOME_MAP_MAP_ID,
  HOME_MAP_SCAN,
  type HomeMap,
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
const held = vi.hoisted((): { maps: unknown; map: unknown } => ({ maps: null, map: null }));
const measured = vi.hoisted(() => ({ width: 412, onLayout: vi.fn() }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

function textStub(props: Props): ReactNode {
  seen.push({ kind: 'Text', props });
  return typeof props.children === 'string' ? props.children : null;
}

vi.mock('react-native', () => ({ View: stub('View'), ScrollView: stub('ScrollView') }));
vi.mock('expo-router', () => ({ useRouter: (): unknown => ({ replace: vi.fn() }) }));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/error-state', () => ({ ErrorState: stub('ErrorState') }));
vi.mock('../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../components/section', () => ({ List: stub('List'), Section: stub('Section') }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: stub('Skeleton') }));
vi.mock('../../../components/switch', () => ({ Switch: stub('Switch') }));
vi.mock('../../../components/text', () => ({ Text: textStub }));
vi.mock('../../../components/text-field', () => ({ TextField: stub('TextField') }));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): typeof measured => measured,
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { settings: { page: (path: string): string => `/settings/${path}` } },
}));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: stub('SettingsFrame') }));
vi.mock('../../../design/size-class', () => ({ DETAIL_MIN_WIDTH: 560 }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/people', () => ({ useActiveProfile: (): unknown => ({ id: 'p' }) }));
vi.mock('../data/home-map-query', () => ({
  useHomeMap: (): unknown => ({ map: held.map, failure: null, retry: vi.fn() }),
  useHomeMapEditing: (): unknown => ({
    state: { status: { kind: 'idle' }, connected: true },
    edit: vi.fn(),
  }),
}));
vi.mock('../data/map-set-query', () => ({
  useHomeMapSet: (): unknown => ({ maps: held.maps, failure: null, retry: vi.fn() }),
  useHomeMapSetActions: (): unknown => ({}),
  useHomeMapVersions: (): unknown => [],
}));
vi.mock('../model/create-map', () => ({
  EDITOR_PATH: '/home-map/edit',
  emptyFloorOp: vi.fn(),
}));
vi.mock('../settings', () => ({ HOME_MAPS_PATH: 'home/maps', HOME_MAP_SETTINGS_PAGE: 'home/map' }));
vi.mock('../data/scan-uploads-shared', () => ({
  useScanUploads: (): unknown => ({
    subscribe: (): (() => void) => () => undefined,
    stateOf: (): unknown => ({ kind: 'idle' }),
  }),
}));
vi.mock('../components/robot-map-feed', () => ({ RobotMapFeed: stub('RobotMapFeed') }));
const split = vi.hoisted(() => ({ active: false }));

vi.mock('./maps-list-screen', () => ({
  MapsListScreen: (props: Props & { readonly detail?: ReactNode }): ReactNode =>
    props.detail ?? null,
  useTwoColumns: (): boolean => split.active,
}));

const { MapScreenRoute, MAP_GONE_TEXT } = await import('./map-screen');

const MAP: HomeMap = HOME_MAP.parse({
  id: 'map-a',
  schemaVersion: 1,
  revision: 3,
  name: 'Home',
  north: 0,
  updatedAt: '2026-10-25T00:00:00.000Z',
  sources: [],
  notices: [],
  floors: [],
});

const SUMMARY: HomeMapSummary = {
  id: HOME_MAP_MAP_ID.parse('map-a'),
  name: 'Home',
  revision: 3,
  floorNames: [],
  roomCount: 0,
  isDefault: true,
  position: 0,
  fedBy: [],
  hasScan: false,
  updatedAt: '2026-10-25T00:00:00.000Z',
};

const SCAN = HOME_MAP_SCAN.parse({
  opacity: 1,
  residualM: null,
  uploadedAt: '2026-11-02T00:00:00.000Z',
  uploadedBy: 'profile:p',
  file: { hash: 'a'.repeat(64), format: 'spz', bytes: 10, name: 'home-scan.spz' },
  lod: null,
  transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: true },
  points: [],
});

function render(raw: unknown): void {
  seen.length = 0;
  renderToStaticMarkup(createElement(MapScreenRoute, { raw }));
}

const rowTitles = (): readonly unknown[] =>
  seen.filter((item) => item.kind === 'ListRow').map((item) => item.props['title']);

describe('one map settings page', () => {
  beforeEach(() => {
    held.maps = [SUMMARY];
    held.map = MAP;
    split.active = false;
    measured.width = 412;
  });

  it('shows every part of DESIGN 19.2 for a hand drawn map', () => {
    render('map-a');
    expect(rowTitles()).toEqual([
      'Default map',
      'Add a realistic view',
      'Split a room',
      'Merge two rooms',
      'Delete this map',
    ]);
    const labels = seen.filter((item) => item.kind === 'Button').map((item) => item.props['label']);
    expect(labels).toEqual(['Add floor', 'Save this version']);
    const fields = seen.filter((item) => item.kind === 'TextField');
    expect(fields.map((item) => item.props['value'])).toEqual(['Home']);
  });

  it('keeps the default switch on and locked on the default map', () => {
    render('map-a');
    const row = seen.find(
      (item) => item.kind === 'ListRow' && item.props['title'] === 'Default map',
    );
    const toggle: unknown = row?.props['trailing'];
    expect(toggle).toMatchObject({ props: { value: true, disabled: true } });
  });

  it('stacks readable section groups when the split detail pane is narrow', () => {
    split.active = true;
    render('map-a');
    expect(seen.some(({ kind }) => kind === 'ScrollView')).toBe(true);
    expect(
      seen.filter(({ props }) => props['className'] === 'w-full max-w-reading gap-section-gap'),
    ).toHaveLength(3);
    expect(seen.find(({ kind }) => kind === 'TextField')?.props).toMatchObject({
      label: 'Map name',
      value: 'Home',
    });
  });

  it('lays out three readable groups across the detail pane without changing section order', () => {
    split.active = true;
    measured.width = 2400;
    render('map-a');
    const form = seen.find(({ props }) => props['onLayout'] === measured.onLayout);
    expect(form?.props['className']).toBe('w-full flex-row items-start gap-section-gap pb-6');
    expect(
      seen.filter(
        ({ props }) => props['className'] === 'min-w-0 flex-1 max-w-reading gap-section-gap',
      ),
    ).toHaveLength(3);
    expect(rowTitles()).toEqual([
      'Default map',
      'Add a realistic view',
      'Split a room',
      'Merge two rooms',
      'Delete this map',
    ]);
  });

  it('shows the feed summary of this map and opens the editor from split and merge', () => {
    render('map-a');
    const hrefOf = (title: string): unknown =>
      seen.find((item) => item.kind === 'ListRow' && item.props['title'] === title)?.props['href'];
    const feed = seen.find((item) => item.kind === 'RobotMapFeed');
    expect(feed?.props).toMatchObject({ variant: 'summary', mapId: 'map-a' });
    expect(hrefOf('Split a room')).toEqual({
      pathname: '/home-map/edit',
      params: { mapId: 'map-a', tool: 'rooms' },
    });
  });

  it('opens the editor on the scan align tool of this map from Add a realistic view and Align', () => {
    render('map-a');
    const add = seen.find(
      (item) => item.kind === 'ListRow' && item.props['title'] === 'Add a realistic view',
    );
    const scanTool = { pathname: '/home-map/edit', params: { mapId: 'map-a', tool: 'scan' } };
    expect(add?.props['href']).toEqual(scanTool);
    held.map = { ...MAP, scan: SCAN };
    render('map-a');
    const row = seen.find(
      (item) =>
        item.kind === 'ListRow' && item.props['title'] === 'home-scan.spz · not lined up yet',
    );
    const align: unknown = row?.props['trailing'];
    expect(align).toMatchObject({ props: { label: 'Align', href: scanTool } });
  });

  it('says the map is gone for a deleted or unreadable map id', () => {
    held.maps = [];
    expect(() => {
      render('map-a');
    }).not.toThrow();
    expect(seen.some((item) => item.props.children === MAP_GONE_TEXT)).toBe(true);
    render('');
    expect(seen.some((item) => item.props.children === MAP_GONE_TEXT)).toBe(true);
  });
});
