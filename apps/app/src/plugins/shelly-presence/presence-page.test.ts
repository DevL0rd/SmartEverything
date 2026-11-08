import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { deviceFixture } from '../../store/device-fixture';

interface Probe {
  view: object | null;
  map: object | null;
  stage: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
  readonly drawn: string[];
}

const probe = vi.hoisted((): Probe => ({
  view: null,
  map: null,
  stage: null,
  input: null,
  drawn: [],
}));

const pass = ({ children }: { readonly children?: ReactNode }): ReactNode => children ?? null;
const none = (): null => null;
const mark = (name: string) => (): null => {
  probe.drawn.push(name);
  return null;
};

vi.mock('react-native', () => ({
  View: pass,
  useWindowDimensions: (): { height: number } => ({ height: 800 }),
}));
vi.mock('expo-router', () => ({ useRouter: (): { push: () => void } => ({ push: none }) }));
vi.mock('@smarteverything/shelly', () => ({ SHELLY_PAGES: [] }));
vi.mock('../../app-shell/hrefs', () => ({
  href: { settings: { device: (): string => '/settings' } },
}));
vi.mock('../../components/card', () => ({ Card: pass }));
vi.mock('../../components/empty-state', () => ({ EmptyState: none }));
vi.mock('../../components/skeleton', () => ({ Skeleton: none }));
vi.mock('../../components/text', () => ({ Text: none }));
vi.mock('../../components/house-map/live-visibility/registry', () => ({
  visibilityRegistry: {
    subscribeStage: (): (() => void) => none,
    getStage: (): { live: boolean } => ({ live: true }),
  },
}));
vi.mock('../../design/size-class', () => ({ useIsPhone: (): boolean => true }));
vi.mock('../../features/devices/device-settings/settings-frame', () => ({
  DeviceSettingsFrame: pass,
}));
vi.mock('../../features/home-map/data/home-map-query', () => ({
  useHomeMap: (): { map: object | null } => ({ map: probe.map }),
}));
vi.mock('../../features/home-map/components/stage/no-map-entry', () => ({
  mapIsBlank: (map: { readonly blank?: boolean } | null): boolean => map?.blank === true,
  NoMapEntry: mark('create-a-map'),
}));
vi.mock('../../features/home-map/components/stage/stage', () => ({
  Stage: (props: Record<string, unknown>): null => {
    probe.stage = props;
    probe.drawn.push('stage');
    return null;
  },
}));
vi.mock('../../features/home-map/components/stage/stage-states', () => ({
  stageDimmed: none,
  stageIdOf: none,
  stageNotices: none,
  stageNoticesNode: none,
}));
vi.mock('../../features/home/model/hero', () => ({
  HOME_MAP_EDITOR: '/home-map/edit',
  heroFrameStyle: (): object => ({}),
  heroViewFacts: (): object => ({ hasScan: false }),
}));
vi.mock('../../features/home-map/model/stage-view', () => ({
  useStageLights: (): object => ({ on: true, onToggle: none }),
  useStageViews: (): object => ({ views: [], view: '3d', setView: none }),
}));
vi.mock('./presence-stage', () => ({ SHELLY_STAGE_PAGE: 'shelly' }));
vi.mock('../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('./catalogue-page', () => ({ CataloguePage: none }));
vi.mock('./live-room-map', () => ({ LiveRoomMap: mark('sensor-view') }));
vi.mock('./presence-data', () => ({
  usePresence: (): { state: string; value: object } => ({
    state: 'ready',
    value: { externalId: 'shelly-1', name: 'Hall sensor' },
  }),
  useTracked: none,
}));
vi.mock('./presence-map', () => ({
  describeSensorMap: none,
  sensorStageContent: (input: Record<string, unknown>): string => {
    probe.input = input;
    return 'sensor-stage';
  },
  sensorTrackDraws: (): [] => [],
  useSensorView: (): object | null => probe.view,
  useTrackHistory: none,
}));
vi.mock('./room-settings', () => ({ RoomSettings: none }));
vi.mock('./use-tracking-lease', () => ({
  useTrackingLease: (): object => ({ tracking: false, failed: null, retry: none }),
}));

const { PresencePageHero } = await import('./presence-page');

function render(view: object | null, map: object | null = null): readonly string[] {
  probe.view = view;
  probe.map = map;
  probe.drawn.length = 0;
  renderToStaticMarkup(createElement(PresencePageHero, { device: deviceFixture(0) }));
  return [...probe.drawn];
}

describe('shelly page hero', () => {
  it('shows only the existing sensor view without a map or placement', () => {
    expect(render(null)).toEqual(['sensor-view']);
  });

  it('offers Create a map above the sensor view when the map has nothing drawn', () => {
    expect(render(null, { blank: true })).toEqual(['create-a-map', 'sensor-view']);
  });

  it('puts the focused map above the sensor view when the sensor is placed', () => {
    expect(render({ spot: {} })).toEqual(['stage', 'sensor-view']);
  });

  it('opens the placed sensor on the 3D map in Top, in the remembered view', () => {
    render({ spot: {} });
    expect(probe.stage).toMatchObject({
      content: 'sensor-stage',
      view: '3d',
      camera: { preset: 'top' },
    });
    expect(probe.input).toMatchObject({ view: { spot: {} }, shown: '3d', dimmed: null });
  });
});
