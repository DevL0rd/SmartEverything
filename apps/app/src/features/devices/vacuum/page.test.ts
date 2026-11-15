import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_ROW } from '@smarteverything/domain';
import { deviceOf } from '../../../store/state';

interface Props {
  readonly children?: ReactNode;
  readonly title?: string;
  readonly subtitle?: string;
  readonly banner?: ReactNode;
  readonly tabs?: TabsProps;
}

function shell(props: Props): ReactNode {
  return createElement(
    'main',
    { 'data-subtitle': props.subtitle },
    createElement('header', { 'data-part': 'header' }, props.title),
    props.tabs === undefined ? null : tabsBar(props.tabs),
    props.banner,
    props.children,
  );
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
vi.mock('../../../components/page-shell/page-shell', () => ({ PageShell: shell }));
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
vi.mock('../detail/device-shell', () => ({
  useDeviceShell: (
    _device: unknown,
    _active: string,
    line: string,
  ): { props: Props; schedule: null } => ({
    props: { title: 'Robot Vacuum', subtitle: line },
    schedule: null,
  }),
  DeviceBanners: part('banner'),
}));
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
  it('puts the tabs in the shell and the map hero before the Clean tab', () => {
    const page = html();
    expect(page).toContain('data-subtitle="Cleaning · Kitchen"');
    const order = [
      'header',
      'tabs',
      'banner',
      'overview',
      'clean-modes',
      'clean-lists',
      'rooms',
      'zones',
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
});
