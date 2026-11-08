import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { DevicePresentation, PresentedCapability } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());
const store = vi.hoisted((): { devices: unknown[]; feeds: unknown } => ({
  devices: [],
  feeds: [],
}));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: stub('EmptyState') }));
vi.mock('../../../components/section', () => ({ List: stub('List') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: stub('SettingsFrame') }));
vi.mock('../../../store/control', () => ({ useControl: (): unknown => ({ pending: false }) }));
vi.mock('../../../store/selectors', () => ({ useDevices: (): unknown => store.devices }));
vi.mock('../../devices', async () => {
  const refs = await vi.importActual<Record<string, unknown>>(
    '../../devices/vacuum/model/presented-refs',
  );
  const run = await vi.importActual<Record<string, unknown>>('../../devices/controls/run-action');
  const model = await vi.importActual<Record<string, unknown>>('../../devices/model/device-model');
  return {
    ...refs,
    deviceModelOf: model['deviceModelOf'],
    argumentsOf: run['argumentsOf'],
    approved: vi.fn(),
    offlineReason: (name: string): string => `${name} is offline`,
    useDisplayName: (): string => 'Robot vacuum',
    useVacuum: vi.fn(),
    MAP_UPLOAD_NOTE: 'upload note',
    CapabilityRow: (props: { readonly presented: PresentedCapability }): ReactNode =>
      stub('SettingRow')({ keyOf: props.presented.role ?? props.presented.key }),
  };
});
vi.mock('../components/robot-map-feed', () => ({
  RobotMapFeed: stub('RobotMapFeed'),
  useFeedData: (): unknown => ({ feeds: store.feeds }),
}));
vi.mock('../settings', () => ({ HOME_MAP_SETTINGS_PAGE: 'home/map' }));

const fixture = await vi.importActual<{
  vacuumDevice: (online?: boolean) => Device;
  vacuumPresentation: (device: Device) => DevicePresentation;
}>('../../devices/vacuum/sections/settings-fixture');
const screen = await import('./robot-maps-screen');
const { RobotMapActions, RobotMapsScreen, mapNowReason, robotsOf, setMapValue } = screen;

function render(node: ReactNode): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(() => node));
  return [...seen];
}

const of = (entries: readonly Seen[], kind: string): readonly Props[] =>
  entries.filter((entry) => entry.kind === kind).map((entry) => entry.props);

const READY = {
  online: true,
  working: false,
  isCurrent: false,
  argumentCount: 1,
  deviceName: 'Robot vacuum',
};

describe('Use this map now', () => {
  it('is offered only when the robot is online, idle, on another map and takes a map id', () => {
    expect(mapNowReason(READY)).toBeNull();
    expect(mapNowReason({ ...READY, online: false })).toBe('Robot vacuum is offline');
    expect(mapNowReason({ ...READY, isCurrent: true })).toBe('The robot uses this map now');
    expect(mapNowReason({ ...READY, working: true })).toBe('Wait until the robot finishes its job');
    expect(mapNowReason({ ...READY, argumentCount: 0 })).toBe(
      'This robot cannot switch maps from here',
    );
  });

  it('sends the robot map id as the action argument', () => {
    const presented = fixture
      .vacuumPresentation(fixture.vacuumDevice())
      .capabilities.find((held) => held.role === 'vacuum_set_map');
    expect(presented).toBeDefined();
    if (presented === undefined) return;
    const withArgument: PresentedCapability = {
      ...presented,
      capability: { ...presented.capability, value: { kind: 'action', arguments: ['map-id'] } },
    };
    expect(setMapValue(withArgument, 4)).toEqual({ 'map-id': 4 });
  });
});

describe('the robot map actions in Robot maps', () => {
  it('renders the moved map rows and the guarded group through the capability rows', () => {
    const drawn = render(
      createElement(RobotMapActions, {
        device: fixture.vacuumDevice(),
        presentation: fixture.vacuumPresentation(fixture.vacuumDevice()),
        deviceName: 'Robot vacuum',
      }),
    );
    const lists = of(drawn, 'List');
    expect(lists.map((list) => list['title'])).toEqual([
      'Robot vacuum · map actions',
      "Erase or replace the robot's map",
    ]);
    expect(lists[1]?.['footer']).toBe(
      'These cannot be undone. Each one asks you to type DELETE first.',
    );
    const rows = of(drawn, 'SettingRow').map((row) => row['keyOf']);
    expect(rows).toEqual(
      expect.arrayContaining([
        'vacuum_build_map',
        'vacuum_save_map',
        'vacuum_auto_partition',
        'vacuum_set_map_name',
        'vacuum_restore_map',
        'vacuum_clear_map',
        'vacuum_delete_map',
      ]),
    );
    expect(rows).not.toContain('vacuum_split_room');
    expect(rows).not.toContain('vacuum_merge_rooms');
    expect(rows.slice(-3)).toEqual(['vacuum_restore_map', 'vacuum_clear_map', 'vacuum_delete_map']);
  });

  it('keeps the typed DELETE guard on the erase actions', () => {
    const guarded = fixture
      .vacuumPresentation(fixture.vacuumDevice())
      .capabilities.filter((held) =>
        ['vacuum_restore_map', 'vacuum_clear_map', 'vacuum_delete_map'].includes(held.role ?? ''),
      );
    expect(guarded.map((held) => held.danger.tier)).toEqual(['typed', 'typed', 'typed']);
  });
});

describe('the Robot maps screen', () => {
  it('lists only robots that have robot maps', () => {
    const robot = fixture.vacuumDevice();
    const feed = {
      deviceId: robot.id,
      robotMapId: 1,
      robotMapName: 'Ground',
      isCurrent: true,
      target: null,
    };
    expect(robotsOf([feed], [robot])).toEqual([robot]);
  });

  it('lists a vacuum that presents robot map rows even with no saved robot map', () => {
    const robot = fixture.vacuumDevice();
    expect(robotsOf([], [robot])).toEqual([robot]);
  });

  it('keeps the map actions reachable for a vacuum with no feeds, loaded or not', async () => {
    const robot = fixture.vacuumDevice();
    const devices = await vi.importMock<{ useVacuum: ReturnType<typeof vi.fn> }>('../../devices');
    devices.useVacuum.mockReturnValue({
      device: robot,
      presentation: fixture.vacuumPresentation(robot),
      snapshot: { values: {} },
    });
    store.devices = [robot];
    for (const feeds of [[], null]) {
      store.feeds = feeds;
      const drawn = render(createElement(RobotMapsScreen));
      expect(of(drawn, 'EmptyState')).toHaveLength(0);
      expect(of(drawn, 'List').map((list) => list['title'])).toEqual([
        'Robot vacuum · map actions',
        "Erase or replace the robot's map",
      ]);
      expect(of(drawn, 'SettingRow').map((row) => row['keyOf'])).toEqual(
        expect.arrayContaining(['vacuum_build_map', 'vacuum_map_switch', 'vacuum_delete_map']),
      );
    }
    store.devices = [];
    store.feeds = [];
  });

  it('shows the intro and the empty state when no robot has a map yet', () => {
    const drawn = render(createElement(RobotMapsScreen));
    expect(of(drawn, 'SettingsFrame')[0]).toMatchObject({
      title: 'Robot maps',
      page: 'home/map',
      contentWidth: 'full',
    });
    expect(of(drawn, 'Text')[0]?.children).toBe(
      'Set this once. Each time the robot finishes a map, the floor it feeds updates on its own.',
    );
    expect(of(drawn, 'EmptyState')[0]).toMatchObject({ title: 'No robot maps yet' });
    expect(of(drawn, 'Button')).toHaveLength(0);
  });
});
