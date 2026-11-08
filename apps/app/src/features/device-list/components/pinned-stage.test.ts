import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP, HOME_MAP_SUMMARY, type HomeMapSummary } from '@smarteverything/domain';
import type { IsoStillProps } from '../../../components/house-map/iso/iso-still';
import { floorOf, placement, room } from '../../../components/house-map/lighting-fixture';
import type { StageLiveProps } from '../../../components/house-map/live-visibility/stage-host';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import type { StageContext, StageProps } from '../../home-map';
import type { PinnedBodyProps } from './pinned-body';

interface Three {
  readonly selection: readonly string[];
  readonly fallback: ReactNode;
  readonly label: string;
  readonly onPickRoom: (roomId: string | null) => void;
  readonly onPickDevice: (deviceId: string) => void;
}

const seen = vi.hoisted(() => ({
  stage: new Array<StageProps<string>>(),
  still: new Array<IsoStillProps>(),
  map3d: new Array<Three>(),
  savedFloor: new Array<string>(),
}));

const none = (): null => null;

const FLOOR: RenderFloor = {
  ...floorOf([placement('lamp', 1, 1, { roomId: 'r-1' })]),
  rooms: [{ ...room('r-1', 'Kitchen', 0, 4), homeRoomId: 'kitchen' }],
};

const MAP = HOME_MAP.parse({
  id: 'cabin',
  schemaVersion: 1,
  revision: 1,
  name: 'Cabin',
  north: 0,
  updatedAt: '2026-10-25T00:00:00.000Z',
  sources: [],
  notices: [],
  floors: [],
});

const SCENE: RenderScene = {
  key: 'cabin:1',
  source: 'home_map',
  bounds: FLOOR.bounds,
  floors: [FLOOR],
  issues: [],
};

vi.mock('../../home-map', async () => ({
  ...(await import('../../home-map/data/live-feed')),
  ...(await import('../../home-map/data/map-demand')),
  ...(await import('../../home-map/data/map-scene')),
  ...(await import('../../home-map/data/map-set-query')),
  ...(await import('../../home-map/data/stage-maps')),
  ...(await import('../../home-map/data/home-map-query')),
  ...(await import('../../home-map/components/stage/full-screen')),
  ...(await import('../../home-map/components/stage/stage')),
  ...(await import('../../home-map/components/stage/home-map-3d')),
  ...(await import('../../home-map/components/stage/stage-states')),
  ...(await import('../../home-map/model/selection')),
  ...(await import('../../home-map/model/map-choice')),
  ...(await import('../../home-map/model/stage-view')),
}));
vi.mock('expo-router', () => ({ useRouter: (): { push: () => void } => ({ push: none }) }));
vi.mock('../../../components/house-map/iso/iso-still', () => ({
  IsoStill: (props: IsoStillProps): null => {
    seen.still.push(props);
    return null;
  },
}));
vi.mock('../../../components/icon', () => ({ Icon: none }));
vi.mock('../../home-map/components/stage/home-map-3d', () => ({
  HomeMap3d: (props: Three): null => {
    seen.map3d.push(props);
    return null;
  },
}));
vi.mock('../../home-map/data/live-feed', () => ({
  useHomeMapLive: (): { summary: string } => ({ summary: 'Ground floor' }),
}));
vi.mock('../../../store/store-context', () => ({ useStoreSelector: (): object => ({}) }));
vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: (): RenderScene => SCENE,
}));
vi.mock('../../../store/selectors', () => ({
  useDevices: (): [] => [],
  useRooms: (): [] => [],
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('../../home-map/data/map-demand', () => ({ useHomeMapDemand: none }));
vi.mock('../../home-map/data/stage-maps', () => ({ useStageMaps: (): undefined => undefined }));
vi.mock('../../home-map/components/stage/stage', () => ({
  Stage: (props: StageProps<string>): null => {
    seen.stage.push(props);
    return null;
  },
}));
vi.mock('../../home-map/data/home-map-query', () => ({
  useHomeMap: (): object => ({ map: { id: 'cabin' }, loading: false, failure: null, retry: none }),
}));
interface StageViewModule {
  readonly stageViewsOf: (map: { hasScan: boolean }) => readonly string[];
  readonly shownStageView: (view: undefined, views: readonly string[]) => string;
}

vi.mock('../../home-map/model/stage-view', async (actual) => {
  const real = await actual<StageViewModule>();
  return {
    ...real,
    useLastFloor: (): object => ({
      floorId: null,
      setFloor: (id: string): void => {
        seen.savedFloor.push(id);
      },
    }),
    useStageLights: (): object => ({ on: true, onToggle: none }),
    useStageViews: (_page: string, map: { hasScan: boolean }): object => {
      const views = real.stageViewsOf(map);
      return { views, view: real.shownStageView(undefined, views), setView: none };
    },
  };
});

const { PinnedMap } = await import('./pinned-map');
const { PinnedBody } = await import('./pinned-body');

function summary(hasScan: boolean): HomeMapSummary {
  return HOME_MAP_SUMMARY.parse({
    id: 'cabin',
    name: 'Cabin',
    revision: 1,
    floorNames: ['Ground'],
    roomCount: 2,
    isDefault: true,
    position: 0,
    fedBy: [],
    hasScan,
    updatedAt: '2026-10-25T00:00:00.000Z',
  });
}

function stageOf(change: Partial<Parameters<typeof PinnedMap>[0]> = {}): StageProps<string> {
  seen.stage.length = 0;
  renderToStaticMarkup(
    createElement(PinnedMap, {
      summary: summary(true),
      focus: { kind: 'none' },
      onSelect: none,
      ...change,
    }),
  );
  const [stage] = seen.stage;
  if (stage === undefined) throw new Error('no stage drawn');
  return stage;
}

const CONTEXT: StageContext = {
  variant: 'pinned',
  view3d: { preset: 'angled', fitSeq: 0, follow: false },
  chrome: [],
  chromeInsets: { top: 0, bottom: 0 },
  focus: { kind: 'none' },
};

const LIVE: StageLiveProps = {
  active: true,
  quality: { renderScale: 1, splatScale: 1, lodBias: 0, decalLightShare: 1, animationDivisor: 1 },
  onReady: none,
  onFrameTime: none,
  onUnavailable: none,
};

function body(
  view: PinnedBodyProps['view'],
  onSelect: PinnedBodyProps['onSelect'],
  context: StageContext = CONTEXT,
): void {
  renderToStaticMarkup(
    createElement(PinnedBody, {
      view,
      map: MAP,
      scene: SCENE,
      floor: FLOOR,
      name: 'Cabin',
      dimmed: false,
      context,
      live: LIVE,
      realistic: undefined,
      onSelect,
    }),
  );
}

function picks(): { readonly three: Three; readonly picked: unknown[] } {
  const picked = new Array<unknown>();
  seen.map3d.length = 0;
  body('3d', (selection) => picked.push(selection));
  const [three] = seen.map3d;
  if (three === undefined) throw new Error('no 3D body drawn');
  return { three, picked };
}

describe('the pinned home map on the Devices page', () => {
  it('fills its parent and opens in 3D alone with Lights, Fit, Full screen and Edit', () => {
    const stage = stageOf();
    expect(stage.variant).toBe('pinned');
    expect(stage.style).toBeUndefined();
    expect(stage.view).toBe('3d');
    expect(stage.views.map((view) => view.value)).toEqual(['3d']);
    expect(stage.tools?.tools3d).toBe(true);
    expect(stage.tools?.lights?.on).toBe(true);
    expect(typeof stage.tools?.onFullScreen).toBe('function');
    expect(typeof stage.tools?.onEdit).toBe('function');
    expect(stage.content.kind).toBe('live');
  });

  it('offers 3D | Realistic only for a scanned map with a realistic body', () => {
    const realistic = (): null => null;
    expect(stageOf({ realistic }).views.map((view) => view.value)).toEqual(['3d', 'realistic']);
    expect(stageOf({ realistic, summary: summary(false) }).views).toHaveLength(1);
  });

  it('draws the 3D map for every stored view without a realistic body', () => {
    seen.map3d.length = 0;
    body('3d', none);
    body('realistic', none);
    expect(seen.map3d).toHaveLength(2);
  });

  it('filters the list from a 3D room pick', () => {
    const { three, picked } = picks();
    three.onPickRoom(null);
    three.onPickRoom('r-1');
    expect(picked).toEqual([{ kind: 'room', roomId: 'kitchen' }]);
  });

  it('filters the list from a 3D device pick', () => {
    const { three, picked } = picks();
    three.onPickDevice('lamp');
    expect(picked).toEqual([{ kind: 'device', deviceId: 'lamp' }]);
    expect(three.label).toBe('Ground floor');
  });

  it('hosts the inline stage under the Devices pinned stage id', () => {
    const stage = stageOf();
    expect(stage.content.kind === 'live' ? stage.content.id : null).toBe('home-map.devices-pinned');
  });

  it('hands the selected room to the 3D map', () => {
    seen.map3d.length = 0;
    body('3d', none, { ...CONTEXT, focus: { kind: 'room', roomId: 'kitchen' } });
    expect(seen.map3d[0]?.selection).toEqual(['r-1']);
  });

  it('falls back to the iso still with the selected room and the failure line', () => {
    seen.map3d.length = 0;
    seen.still.length = 0;
    body('3d', none, { ...CONTEXT, focus: { kind: 'device', deviceId: 'lamp' } });
    const markup = renderToStaticMarkup(createElement(() => seen.map3d[0]?.fallback));
    expect(markup).toContain('isn&#x27;t available on this device');
    expect(seen.still).toHaveLength(1);
    expect(seen.still[0]?.input).toEqual({ floor: FLOOR, activeRoomIds: ['r-1'] });
    expect(seen.still[0]?.name).toBe('Cabin');
  });
});
