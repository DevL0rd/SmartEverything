import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ROW } from '@smarteverything/domain';
import { deviceOf } from '../../../store/state';

interface Props {
  readonly children?: ReactNode;
  readonly header?: ReactNode;
  readonly banner?: ReactNode;
  readonly maxWidth?: string;
}

function screen(): (props: Props) => ReactNode {
  function Screen(props: Props): ReactNode {
    return createElement(
      'main',
      { 'data-width': props.maxWidth },
      props.header,
      props.banner,
      props.children,
    );
  }
  return Screen;
}

const size = vi.hoisted(() => ({ width: 'compact' }));

function part(name: string): (props: Props) => ReactNode {
  function Part(props: Props): ReactNode {
    return createElement('section', { 'data-part': name }, props.children);
  }
  return Part;
}

interface TabsProps {
  readonly active: string;
  readonly items: readonly { readonly key: string; readonly label: string }[];
}

function tabsBar(props: TabsProps): ReactNode {
  return createElement(
    'nav',
    { 'data-part': 'tabs', 'data-active': props.active },
    props.items.map((item) => item.label).join(','),
  );
}

vi.mock('react-native', () => ({ View: part('view') }));
vi.mock('../../../components/screen', () => ({ Screen: screen() }));
vi.mock('../../../components/tabs-bar', () => ({ TabsBar: tabsBar }));
vi.mock('../../../components/text', () => ({ Text: part('text') }));
vi.mock('./page-reveal', () => ({ RevealBox: part('reveal') }));
vi.mock('./sections/care', () => ({ VacuumCare: part('care') }));
vi.mock('./sections/clean-modes', () => ({ VacuumCleanModes: part('clean-modes') }));
vi.mock('./sections/clean-more', () => ({ VacuumCleanLists: part('clean-lists') }));
vi.mock('./sections/dock', () => ({ VacuumDock: part('dock') }));
vi.mock('./sections/history', () => ({ VacuumHistory: part('history') }));
vi.mock('./sections/rooms', () => ({ VacuumRooms: part('rooms') }));
vi.mock('./sections/schedules', () => ({ VacuumSchedules: part('schedules') }));
vi.mock('./sections/settings', () => ({ VacuumSettings: part('settings') }));
vi.mock('./sections/zones', () => ({ VacuumZones: part('zones') }));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { width: string } => size,
  atLeast: (width: string, floor: string): boolean =>
    floor === 'expanded' ? width === 'expanded' : width !== 'compact',
}));
vi.mock('../detail/device-header', () => ({ DeviceHeader: part('header') }));
vi.mock('../detail/device-overview', () => ({ DeviceBanner: part('banner') }));
vi.mock('../detail/shortcuts', () => ({ Shortcuts: part('shortcuts') }));
vi.mock('./sections/overview', () => ({
  VacuumOverview: part('overview'),
  useVacuumHeadline: (): string => 'Cleaning · Kitchen',
}));

const { VacuumPage } = await import('./page');

const device = deviceOf(
  DEVICE_ROW.parse({
    id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    provider: 'xiaomi',
    external_id: 'vacuum-1',
    parent_id: null,
    kind: 'vacuum',
    name: 'Robot Vacuum',
    display_name: null,
    model: 'vacuum',
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-24T08:00:00.000Z',
    updated_at: '2026-10-24T08:00:00.000Z',
  }),
);

function html(): string {
  return renderToStaticMarkup(createElement(VacuumPage, { device }));
}

beforeEach(() => {
  size.width = 'compact';
});

describe('vacuum page', () => {
  it('puts the map hero first, then the tabs, the Clean tab and the shortcuts', () => {
    const page = html();
    const order = [
      'header',
      'banner',
      'overview',
      'tabs',
      'clean-modes',
      'clean-lists',
      'rooms',
      'zones',
      'shortcuts',
    ].map((name) => page.indexOf(`data-part="${name}"`));
    expect(page.lastIndexOf('data-part="clean-lists"')).toBeGreaterThan(
      page.indexOf('data-part="zones"'),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toStrictEqual(order);
  });

  it('offers the Clean, Schedule, History, Care and Settings tabs and opens on Clean', () => {
    const page = html();
    expect(page).toContain('data-active="clean"');
    expect(page).toContain('Clean,Schedule,History,Care,Settings');
    for (const hidden of ['schedules', 'history', 'care', 'dock', 'settings']) {
      expect(page).not.toContain(`data-part="${hidden}"`);
    }
  });

  it('uses the detail width on a phone, the reading width on medium and two columns when expanded', () => {
    expect(html()).toContain('data-width="detail"');
    size.width = 'medium';
    expect(html()).toContain('data-width="reading"');
    size.width = 'expanded';
    expect(html()).toContain('data-width="detail"');
  });
});
