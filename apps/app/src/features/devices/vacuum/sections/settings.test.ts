import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VACUUM_COUPLINGS,
  type DevicePresentation,
  type PresentedCapability,
} from '@smarteverything/domain';
import { MAP_MOVED_LINE, ROBOT_MAPS_REFS, SETTING_GROUPS } from '../search-items';
import { vacuumDevice, vacuumPresentation } from './settings-fixture';

interface Props {
  readonly children?: ReactNode;
  readonly title?: string;
  readonly footer?: string;
  readonly presented?: PresentedCapability;
  readonly reason?: string | null;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly deviceId?: string;
  readonly variant?: string;
}

interface Hold {
  presentation: DevicePresentation | null;
  confirmed: unknown[];
  accept: boolean;
  rows: Props[];
  buttons: (Props & { readonly label: string })[];
}

const hold = vi.hoisted<Hold>(() => ({
  presentation: null,
  confirmed: [],
  accept: true,
  rows: [],
  buttons: [],
}));

function part(name: string): (props: Props) => ReactNode {
  function Part(props: Props): ReactNode {
    return createElement(
      'section',
      { 'data-part': name, 'data-title': props.title, 'data-footer': props.footer },
      props.children,
    );
  }
  return Part;
}

vi.mock('../../../home-map', async () => ({
  ...(await import('../../../home-map/components/robot-map-feed')),
}));
vi.mock('react-native', () => ({ View: part('view') }));
vi.mock('../../../../components/section', () => ({ List: part('list') }));
vi.mock('./settings-dnd', () => ({ SETTING_GROUP_BODIES: { dnd: part('dnd-body') } }));
vi.mock('./settings-look', () => ({ VacuumLookSettings: part('look') }));
vi.mock('./settings-about', () => ({
  useSystemRows: (): ReactNode => createElement('section', { 'data-part': 'about' }),
  ReadingRow: (props: Props): ReactNode =>
    createElement('section', { 'data-part': 'reading', 'data-key': props.presented?.key }),
}));
vi.mock('../../../../components/list-row', () => ({
  ListRow: (props: Props): ReactNode => {
    hold.rows.push(props);
    return createElement(
      'section',
      { 'data-part': 'list-row', 'data-title': props.title },
      props.trailing,
    );
  },
}));
vi.mock('../../../../components/button', () => ({
  Button: (props: Props & { readonly label: string }): ReactNode => {
    hold.buttons.push(props);
    return createElement('section', { 'data-part': 'button', 'data-title': props.label });
  },
}));
vi.mock('../../../home-map/components/robot-map-feed', () => ({
  RobotMapFeed: (props: Props): ReactNode =>
    createElement('section', {
      'data-part': 'feed',
      'data-title': props.title,
      'data-device': props.deviceId,
      'data-variant': props.variant,
    }),
}));
vi.mock('../../../../components/empty-state', () => ({ EmptyState: part('empty') }));
vi.mock('../../../../components/icon', () => ({ Icon: part('icon') }));
vi.mock('../../../../components/text', () => ({ Text: part('text') }));
vi.mock('../../../../components/rows', () => ({
  SwitchRow: part('switch'),
  SelectRow: part('select'),
  NavRow: part('nav'),
  ValueRow: part('value'),
}));
vi.mock('../../../../app-shell/hrefs', () => ({
  href: { settings: { device: (id: string, page: string): string => `/${id}/${page}` } },
}));
vi.mock('../../../../components/confirm-store', () => ({
  confirm: (request: unknown): Promise<boolean> => {
    hold.confirmed.push(request);
    return Promise.resolve(hold.accept);
  },
}));
vi.mock('../../controls/capability-row', () => ({
  CapabilityRow: (props: Props): ReactNode =>
    createElement('section', {
      'data-part': 'capability',
      'data-key': props.presented?.key,
      'data-reason': props.reason ?? '',
    }),
}));
vi.mock('../../controls/guard', () => ({
  Guard: part('guard'),
  offlineReason: (name: string): string => `${name} is offline`,
}));
vi.mock('../../controls/use-device-control', () => ({
  useDeviceControl: (): { value: undefined; set: () => Promise<boolean> } => ({
    value: undefined,
    set: () => Promise.resolve(true),
  }),
}));
vi.mock('../../model/device-model', () => ({
  useDeviceModel: (): { presentation: DevicePresentation | null } => ({
    presentation: hold.presentation,
  }),
  shownValue: (): string => '',
}));
vi.mock('../../model/display-name', () => ({ useDisplayName: (): string => 'Robot' }));

const {
  VacuumSettings,
  confirmedSet,
  couplingBody,
  couplingChanges,
  isGuardedValue,
  settingsGroupsOf,
} = await import('./settings');
const { presentedFor: rowFor } = await import('../model/presented-refs');

const device = vacuumDevice();
const presentation = vacuumPresentation(device);

function presented(ref: string): PresentedCapability {
  const found = rowFor(presentation, ref);
  if (found === undefined) {
    throw new Error(`No row for ${ref}`);
  }
  return found;
}

beforeEach(() => {
  hold.rows.length = 0;
  hold.buttons.length = 0;
  hold.confirmed.length = 0;
  hold.accept = true;
});

describe('settingsGroupsOf', () => {
  const groups = settingsGroupsOf(presentation);
  const keys = groups.flatMap((group) => [...group.rows, ...group.guarded].map((row) => row.key));

  it('resolves every row of every group on the pv11gl and shows each group', () => {
    const wanted = SETTING_GROUPS.flatMap((spec) => [...spec.rows, ...(spec.guarded?.rows ?? [])]);
    expect(wanted.filter((ref) => rowFor(presentation, ref) === undefined)).toStrictEqual([]);
    expect(groups.map((group) => group.spec.id)).toStrictEqual(
      SETTING_GROUPS.map((spec) => spec.id),
    );
  });

  it('shows each capability once', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('leaves every map management row to Robot maps in Settings', () => {
    const roles = groups.flatMap((group) =>
      [...group.rows, ...group.readings, ...group.guarded].map((row) => row.role),
    );
    expect(ROBOT_MAPS_REFS.filter((ref) => roles.some((role) => role === ref))).toStrictEqual([]);
    expect(SETTING_GROUPS.map((spec) => spec.id)).not.toContain('map');
  });

  it('offers no map action that needs typed input, so no map or room name can be typed', () => {
    const roles = groups.flatMap((group) =>
      [...group.rows, ...group.guarded].map((row) => row.role),
    );
    for (const role of [
      'vacuum_set_map_name',
      'vacuum_split_room',
      'vacuum_merge_rooms',
      'vacuum_rotate_map',
      'vacuum_set_map',
    ]) {
      expect(roles).not.toContain(role);
    }
  });

  it('shows the camera video switch only as a read-only status the app drives', () => {
    const camera = groups.find((group) => group.spec.id === 'camera');
    expect(camera?.readings.map((row) => row.role)).toStrictEqual(['vacuum_video_on']);
    expect(camera?.rows.map((row) => row.role)).not.toContain('vacuum_video_on');
  });

  it('leaves station settings, the clean modes, find robot and find robot to their own homes', () => {
    const roles = groups.flatMap((group) =>
      [...group.rows, ...group.guarded].map((row) => row.role),
    );
    for (const role of [
      'vacuum_mop_wash_water',
      'vacuum_roller_auto_wash',
      'vacuum_auto_dust',
      'vacuum_worry_free',
      'vacuum_sweep_route',
      'vacuum_identify',
    ]) {
      expect(roles).not.toContain(role);
    }
  });

  it('never offers the video password, consumable resets, factory modes or firmware updates', () => {
    const labels = groups
      .flatMap((group) => [...group.rows, ...group.guarded])
      .map((row) => row.label);
    expect(
      labels.filter((label) => /password|reset|factory|check mode|update/i.test(label)),
    ).toStrictEqual([]);
  });
});

describe('couplings', () => {
  it('names what worry-free mode rewrites', () => {
    const coupling = VACUUM_COUPLINGS['raw:2.83'];
    if (coupling === undefined) {
      throw new Error('no coupling');
    }
    const changes = couplingChanges(presentation, coupling);
    expect(changes).toStrictEqual([
      'Suction',
      'Cleaning times',
      'Mop washing water output',
      'Auto dust collection',
    ]);
    expect(couplingBody(changes, coupling)).toContain('It also changes: Suction, Cleaning times');
  });

  it('shows that turning off AI detection also turns off real scene capture', () => {
    const coupling = VACUUM_COUPLINGS['raw:2.45'];
    if (coupling === undefined) {
      throw new Error('no coupling');
    }
    expect(couplingChanges(presentation, coupling)).toStrictEqual(['Real scene capture']);
    expect(coupling.note).toContain('also turns off real-scene capture');
  });
});

describe('guarded values', () => {
  it('guards worry-free mode and the camera video switch, not plain settings or actions', () => {
    expect(isGuardedValue(presented('vacuum_worry_free'))).toBe(true);
    expect(isGuardedValue(presented('vacuum_video_on'))).toBe(true);
    expect(isGuardedValue(presented('vacuum_carpet_boost'))).toBe(false);
    expect(isGuardedValue(presented('vacuum_delete_map'))).toBe(false);
  });

  it('asks before sending a confirm-tier change and sends only when accepted', async () => {
    const send = vi.fn(() => Promise.resolve(true));
    const asked = await confirmedSet({
      presented: presented('vacuum_worry_free'),
      deviceName: 'Robot',
      note: 'It rewrites suction.',
      send,
    });
    expect(asked).toBe(true);
    expect(hold.confirmed).toMatchObject([{ body: 'It rewrites suction.', tone: 'destructive' }]);
    expect(send).toHaveBeenCalledTimes(1);
    hold.accept = false;
    expect(
      await confirmedSet({
        presented: presented('vacuum_video_on'),
        deviceName: 'Robot',
        note: null,
        send,
      }),
    ).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks for the typed word on typed-tier changes and nothing on plain ones', async () => {
    const send = vi.fn(() => Promise.resolve(true));
    await confirmedSet({
      presented: presented('vacuum_delete_map'),
      deviceName: 'Robot',
      note: null,
      send,
    });
    expect(hold.confirmed).toMatchObject([{ typed: 'DELETE' }]);
    hold.confirmed.length = 0;
    await confirmedSet({
      presented: presented('vacuum_carpet_boost'),
      deviceName: 'Robot',
      note: null,
      send,
    });
    expect(hold.confirmed).toStrictEqual([]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('VacuumSettings', () => {
  const onShowRooms = vi.fn();
  function render(): string {
    hold.presentation = presentation;
    return renderToStaticMarkup(createElement(VacuumSettings, { device, onShowRooms }));
  }

  it('renders the groups in order with the guarded map list and the coupling notes', () => {
    const html = render();
    const titles = [...html.matchAll(/data-part="list" data-title="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(titles).toStrictEqual([
      'Cleaning preferences',
      'Carpets',
      'Obstacles and AI',
      'Camera and privacy',
      'Voice and sound',
      'Child lock',
      'Firmware and diagnostics',
      'Map',
    ]);
    expect(html).toContain('Turning off AI detection also turns off real-scene capture');
    expect(html).toContain('Also changes: Real scene capture');
    expect(html).toContain('Live view only. Nothing from the robot');
    expect(html.indexOf('data-part="look"')).toBeGreaterThan(
      html.indexOf('Firmware and diagnostics'),
    );
  });

  it('shows the camera switch as a reading, the robot facts in Firmware and plain rows elsewhere', () => {
    const html = render();
    expect(html).toContain('data-part="reading" data-key="raw:21.6"');
    expect(html).toContain('data-part="about"');
    expect(html).toContain('data-key="raw:2.20"');
    expect(html).not.toContain('data-key="raw:2.83"');
    expect(html).not.toContain('data-key="raw:2.1"');
  });

  it('blocks the rows with the offline reason when the robot is offline', () => {
    hold.presentation = presentation;
    const offline = vacuumDevice(false);
    const html = renderToStaticMarkup(
      createElement(VacuumSettings, { device: offline, onShowRooms }),
    );
    expect(html).toContain('data-reason="Robot is offline"');
  });

  it('shows an empty state when the robot reports no settings', () => {
    hold.presentation = { family: 'vacuum', capabilities: [] };
    const html = renderToStaticMarkup(createElement(VacuumSettings, { device, onShowRooms }));
    expect(html).toContain('data-part="empty"');
    expect(html).toContain('data-part="feed"');
    expect(html).toContain('data-part="look"');
  });

  it('holds only the feed row and Link rooms in the Map group, with the moved line', () => {
    const html = render();
    const start = html.indexOf('data-title="Map"');
    const group = html.slice(start, html.indexOf('data-part="look"'));
    expect(group).toContain(`data-footer="${MAP_MOVED_LINE}"`);
    expect(group).toContain(
      'data-part="feed" data-title="Which robot map feeds which map and floor" data-device="' +
        device.id +
        '" data-variant="summary"',
    );
    expect([...group.matchAll(/data-part="(list-row|capability|switch|select)"/g)]).toHaveLength(1);
    expect(hold.rows.map((row) => row.title)).toStrictEqual(['Link rooms']);
    for (const ref of ['vacuum_delete_map', 'vacuum_build_map', 'vacuum_map_switch']) {
      expect(html).not.toContain(`data-key="${rowFor(presentation, ref)?.key ?? ref}"`);
    }
  });

  it('opens the Rooms card from Link rooms', () => {
    render();
    expect(hold.buttons.map((button) => button.label)).toStrictEqual(['Rooms card']);
    hold.buttons[0]?.onPress?.();
    expect(onShowRooms).toHaveBeenCalledTimes(1);
  });
});
