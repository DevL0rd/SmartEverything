import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabItem } from '../../../components/tabs-bar';
import type { DeviceSection } from './sections';

interface Props {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface Scene {
  family: string;
  width: string;
  details: boolean;
  selfScrolling: boolean;
  tabs: readonly TabItem[];
}

const scene = vi.hoisted((): Scene => ({
  family: 'plug',
  width: 'compact',
  details: false,
  selfScrolling: false,
  tabs: [],
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() }));

function marker(name: string): (props: Props) => ReactNode {
  function Marker(props: Props): ReactNode {
    return createElement('div', { 'data-part': name }, props.children);
  }
  return Marker;
}

function box(): (props: Props) => ReactNode {
  function Box(props: Props): ReactNode {
    return createElement('div', { 'data-class': props.className }, props.children);
  }
  return Box;
}

vi.mock('react-native', () => ({ View: box(), ScrollView: marker('scroll') }));
vi.mock('expo-router', () => ({
  Redirect: marker('redirect'),
  useRouter: (): typeof router => router,
}));
vi.mock('@smarteverything/domain', () => ({ isCamera: (): boolean => false }));
vi.mock('../../../components/after-paint', () => ({ AfterPaint: marker('after-paint') }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({
    title,
    action,
  }: {
    readonly title: string;
    readonly action: ReactNode;
  }): ReactNode => createElement('div', null, title, action),
}));
vi.mock('../../../components/screen', () => ({
  Screen: ({
    header,
    banner,
    children,
  }: {
    readonly header: ReactNode;
    readonly banner?: ReactNode;
    readonly children: ReactNode;
  }): ReactNode =>
    createElement(
      'div',
      { 'data-part': 'screen' },
      header,
      banner === undefined ? null : createElement('div', { 'data-part': 'banner-slot' }, banner),
      children,
    ),
}));
vi.mock('../../../components/tabs-bar', () => ({
  TabsBar: ({
    items,
    active,
  }: {
    readonly items: readonly TabItem[];
    readonly active: string;
  }): ReactNode => {
    scene.tabs = items;
    return createElement('div', { 'data-part': 'tabs', 'data-active': active });
  },
}));
vi.mock('../../../components/use-lifecycle-log', () => ({
  useLifecycleLog: (): void => undefined,
}));
vi.mock('../../../app-shell/hrefs', () => ({ href: { device: (): string => '/device' } }));
vi.mock('../../../design/size-class', () => ({
  atLeast: (width: string, floor: string): boolean => {
    const order = ['compact', 'medium', 'expanded'];
    return order.indexOf(width) >= order.indexOf(floor);
  },
  useSizeClass: (): { width: string } => ({ width: scene.width }),
}));
vi.mock('../../../store/selectors', () => ({
  useDevice: (): { id: string } => ({ id: 'device-1' }),
}));
vi.mock('../model/device-model', () => ({
  useDeviceModel: (device: { readonly id: string }): { family: string; device: typeof device } => ({
    family: scene.family,
    device,
  }),
}));
vi.mock('./device-header', () => ({
  DeviceHeader: ({ titleLines }: { readonly titleLines?: string }): ReactNode =>
    createElement('div', { 'data-part': 'header', 'data-title-lines': titleLines }),
}));
vi.mock('./device-overview', () => ({
  DeviceBanner: marker('banner'),
  Hero: marker('hero'),
  PrimaryCard: marker('primary-card'),
}));
function section(key: string, scrolls = false): DeviceSection {
  return {
    key,
    title: key,
    icon: 'info',
    scrolls,
    render: () => createElement('p', null, 'Section'),
  };
}

vi.mock('./sections', () => ({
  sectionHref: (deviceId: string, key: string): string => `/device/${deviceId}/${key}`,
  sectionsOf: (): readonly DeviceSection[] => [
    section('overview'),
    section('history'),
    section('activity', scene.selfScrolling),
  ],
  useHasOverviewDetails: (): boolean => scene.details,
  OverviewDetails: marker('details'),
}));
vi.mock('./missing-device', () => ({ MissingDevice: marker('missing') }));
vi.mock('./shortcuts', () => ({ Shortcuts: marker('shortcuts') }));
vi.mock('../laundry/page', () => ({ LaundryPage: marker('laundry-page') }));
vi.mock('../television/lead', () => ({ TelevisionLead: marker('tv-lead') }));
vi.mock('../vacuum/page', () => ({ VacuumPage: marker('vacuum-page') }));

const { DeviceScreen } = await import('./device-screen');

function html(section: string): string {
  return renderToStaticMarkup(createElement(DeviceScreen, { deviceId: 'device-1', section }));
}

beforeEach(() => {
  vi.clearAllMocks();
  scene.family = 'plug';
  scene.width = 'compact';
  scene.details = false;
  scene.selfScrolling = false;
  scene.tabs = [];
});

describe('device detail width', () => {
  it('wraps the stacked overview title and places its notice in the content flow', () => {
    const page = html('overview');
    expect(page).toContain('data-part="header" data-title-lines="wrap"');
    expect(page).toContain('data-part="banner"');
    expect(page).not.toContain('data-part="banner-slot"');
    expect(page.indexOf('data-part="banner"')).toBeLessThan(page.indexOf('data-part="hero"'));
  });

  it('uses the available viewport for the wide overview split', () => {
    scene.width = 'expanded';
    scene.details = true;
    const page = html('overview');
    expect(page).toContain('data-class="w-full flex-1 px-gutter flex-row gap-section-gap"');
    expect(page).not.toContain('max-w-detail');
    expect(page).toContain('data-part="tabs"');
  });

  it('aligns self-scrolling sections to the same frame without adding a scroll view', () => {
    scene.selfScrolling = true;
    const page = html('activity');
    expect(page).toContain('data-class="w-full flex-1 px-gutter"');
    expect(page).toContain('<p>Section</p>');
    expect(page).not.toContain('data-part="scroll"');
  });
});

describe('device section routes', () => {
  beforeEach(() => {
    scene.width = 'expanded';
    scene.details = true;
  });

  it('shows a missing-page state with a path back to the device on wide screens', () => {
    const page = html('retired');
    expect(page).toContain('This page isn’t here');
    expect(page).toContain('<button>Back to device</button>');
    expect(page).not.toContain('data-part="tabs"');
  });

  it('pushes a section from Overview and replaces it when switching to another section', () => {
    expect(html('overview')).toContain('data-active="overview"');
    scene.tabs.find(({ key }) => key === 'history')?.onPress?.();
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/device/device-1/history');

    expect(html('history')).toContain('data-active="history"');
    scene.tabs.find(({ key }) => key === 'history')?.onPress?.();
    scene.tabs.find(({ key }) => key === 'activity')?.onPress?.();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/device/device-1/activity');
  });

  it('returns to the canonical device overview when selecting Overview from a section', () => {
    expect(html('activity')).toContain('data-active="activity"');
    scene.tabs.find(({ key }) => key === 'overview')?.onPress?.();
    expect(router.dismissTo).toHaveBeenCalledExactlyOnceWith('/device');
  });
});

describe('family page registry', () => {
  it('opens the laundry page on the overview and nothing else', () => {
    scene.family = 'laundry';
    expect(html('overview')).toContain('data-part="laundry-page"');
    expect(html('overview')).not.toContain('vacuum-page');
  });

  it('opens the vacuum page on the overview', () => {
    scene.family = 'vacuum';
    expect(html('overview')).toContain('data-part="vacuum-page"');
    expect(html('overview')).not.toContain('laundry-page');
  });

  it('keeps the generic sub-pages for the other sections of a family with a page', () => {
    scene.family = 'vacuum';
    expect(html('history')).not.toContain('vacuum-page');
    scene.family = 'laundry';
    expect(html('history')).not.toContain('laundry-page');
  });

  it('puts the television lead where the generic hero and primary card go', () => {
    scene.family = 'television';
    const page = html('overview');
    expect(page).toContain('data-part="tv-lead"');
    expect(page).not.toContain('data-part="hero"');
    expect(page).not.toContain('data-part="primary-card"');
  });

  it('keeps the generic hero and primary card for every other family', () => {
    const page = html('overview');
    expect(page).toContain('data-part="hero"');
    expect(page).toContain('data-part="primary-card"');
    expect(page).not.toContain('tv-lead');
  });

  it('keeps the television single column on a medium window and others in two columns', () => {
    scene.width = 'medium';
    scene.details = true;
    scene.family = 'television';
    expect(html('overview')).not.toContain('flex-row items-start');
    scene.family = 'plug';
    expect(html('overview')).toContain('flex-row items-start');
  });
});
