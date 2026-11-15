import { createElement, use, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionSearchContext } from '../../../plugins/shared/section-search';
import type { DeviceSection } from './sections';

interface Props {
  readonly children?: ReactNode;
  readonly className?: string;
}

interface Shell {
  readonly scroll?: boolean;
  readonly width?: string;
  readonly banner?: ReactNode;
  readonly search?: { readonly value: string; readonly placeholder: string };
  readonly children?: ReactNode;
}

interface Scene {
  family: string;
  bodyWidth: number;
  details: boolean;
  selfScrolling: boolean;
  shell: Shell | null;
  active: string | null;
  searchParam: string | null;
}

const scene = vi.hoisted((): Scene => ({
  family: 'plug',
  bodyWidth: 380,
  details: false,
  selfScrolling: false,
  shell: null,
  active: null,
  searchParam: null,
}));

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

vi.mock('react-native', () => ({ View: box() }));
vi.mock('expo-router', () => ({ Redirect: marker('redirect') }));
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
vi.mock('../../../components/page-shell/page-shell', () => ({
  PageShell: (props: Shell): ReactNode => {
    scene.shell = props;
    return createElement(
      'main',
      { 'data-part': 'shell' },
      createElement('div', { 'data-part': 'banner-slot' }, props.banner),
      props.children,
    );
  },
}));
vi.mock('../../../components/page-shell/body-width', () => ({
  useFrameBodyWidth: (): number => scene.bodyWidth,
}));
vi.mock('../../../components/page-shell/layout', () => ({
  twoFrameColumnsAt: (width: number): boolean => width >= 640,
}));
vi.mock('../../../components/use-section-param', () => ({
  useSectionParam: (): readonly [string | null] => [scene.searchParam],
}));
vi.mock('../../../components/use-lifecycle-log', () => ({
  useLifecycleLog: (): void => undefined,
}));
vi.mock('../../../app-shell/hrefs', () => ({ href: { device: (): string => '/device' } }));
vi.mock('../../../store/selectors', () => ({
  useDevice: (): { id: string } => ({ id: 'device-1' }),
}));
vi.mock('../model/device-model', () => ({
  useDeviceModel: (device: { readonly id: string }): { family: string; device: typeof device } => ({
    family: scene.family,
    device,
  }),
}));
vi.mock('./device-shell', () => ({
  useDeviceShell: (_device: unknown, active: string): object => {
    scene.active = active;
    return { props: { title: 'Device' }, schedule: null };
  },
  DeviceBanners: marker('banner'),
}));
vi.mock('./device-overview', () => ({
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

function SearchedBody(): ReactNode {
  return createElement('p', null, `Searching ${use(SectionSearchContext)?.value ?? 'nothing'}`);
}

function searchedSection(): DeviceSection {
  return {
    key: 'queries',
    title: 'queries',
    icon: 'info',
    scrolls: true,
    search: { placeholder: 'Domain or device' },
    render: () => createElement(SearchedBody),
  };
}

vi.mock('./sections', () => ({
  sectionsOf: (): readonly DeviceSection[] => [
    section('overview'),
    section('history'),
    section('activity', scene.selfScrolling),
    searchedSection(),
  ],
  useHasOverviewDetails: (): boolean => scene.details,
  OverviewDetails: marker('details'),
}));
vi.mock('./missing-device', () => ({ MissingDevice: marker('missing') }));
vi.mock('../laundry/page', () => ({ LaundryPage: marker('laundry-page') }));
vi.mock('../television/lead', () => ({ TelevisionLead: marker('tv-lead') }));
vi.mock('../vacuum/page', () => ({ VacuumPage: marker('vacuum-page') }));

const { DeviceScreen } = await import('./device-screen');

function html(section: string): string {
  return renderToStaticMarkup(createElement(DeviceScreen, { deviceId: 'device-1', section }));
}

beforeEach(() => {
  scene.family = 'plug';
  scene.bodyWidth = 380;
  scene.details = false;
  scene.selfScrolling = false;
  scene.shell = null;
  scene.active = null;
  scene.searchParam = null;
});

describe('device page shell', () => {
  it('puts the device notices in the shell banner and the hero in the body', () => {
    const page = html('overview');
    expect(page).toContain('data-part="banner-slot"><div data-part="banner">');
    expect(page.indexOf('data-part="banner"')).toBeLessThan(page.indexOf('data-part="hero"'));
    expect(scene.shell).toMatchObject({ width: 'detail', scroll: true });
    expect(scene.active).toBe('overview');
  });

  it('shows the overview details beside the lead when the body is wide enough', () => {
    scene.details = true;
    expect(html('overview')).not.toContain('flex-row items-start');
    scene.bodyWidth = 820;
    const page = html('overview');
    expect(page).toContain('gap-section-gap flex-row items-start');
    expect(page).toContain('data-part="details"');
  });

  it('leaves the details out when the device has none', () => {
    expect(html('overview')).not.toContain('data-part="after-paint"');
  });

  it('lets a self-scrolling section own its scroll inside the shell body', () => {
    scene.selfScrolling = true;
    const page = html('activity');
    expect(page).toContain('<p>Section</p>');
    expect(scene.shell?.scroll).toBe(false);
    expect(scene.active).toBe('activity');
  });

  it('scrolls a plain section in the shell', () => {
    expect(html('history')).toContain('<p>Section</p>');
    expect(scene.shell?.scroll).toBe(true);
  });

  it('puts a section search in the top shell and shares its value with the section', () => {
    scene.searchParam = 'ads.example';
    expect(html('queries')).toContain('Searching ads.example');
    expect(scene.shell?.search).toMatchObject({
      value: 'ads.example',
      placeholder: 'Domain or device',
    });
  });

  it('shows no shell search on a section without one', () => {
    expect(html('history')).not.toContain('Searching');
    expect(scene.shell?.search).toBeUndefined();
  });

  it('shows a missing-page state with a path back to the device', () => {
    const page = html('retired');
    expect(page).toContain('This page isn’t here');
    expect(page).toContain('<button>Back to device</button>');
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

  it('keeps the television in one column on a wide body and others in two', () => {
    scene.bodyWidth = 820;
    scene.details = true;
    scene.family = 'television';
    expect(html('overview')).not.toContain('flex-row items-start');
    scene.family = 'plug';
    expect(html('overview')).toContain('flex-row items-start');
  });
});
