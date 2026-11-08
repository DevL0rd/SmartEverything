import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as StageView from '../../home-map/model/stage-view';

interface Floor {
  readonly id: string;
  readonly name: string;
  readonly rooms: readonly unknown[];
}

interface MapState {
  readonly map: {
    readonly id: string;
    readonly name: string;
    readonly floors: Floor[];
    readonly sources: readonly unknown[];
    readonly notices: readonly { readonly detail: string }[];
    readonly scan?: unknown;
  } | null;
  readonly loading: boolean;
  readonly failure: Error | null;
}

const probe = vi.hoisted(() => {
  const state: MapState = { map: null, loading: true, failure: null };
  const picked: Picked = { remembered: undefined, lastFloor: null, stage: null };
  return {
    state,
    ...picked,
    shown: true,
    viewport: { width: 400, height: 800 },
    viewStyles: new Array<unknown>(),
    hide: (): void => undefined,
    entries: new Array<unknown>(),
    menus: new Array<readonly { readonly label: string; readonly onPress: () => void }[]>(),
    stages: new Array<string>(),
    demands: new Array<unknown>(),
    still: new Array<Record<string, unknown>>(),
    notices: new Array<string>(),
    solid: new Array<Solid>(),
    setView: vi.fn(),
    setFloor: vi.fn(),
    pages: new Array<string>(),
    pushed: new Array<unknown>(),
  };
});

interface Solid extends Record<string, unknown> {
  readonly onPickDevice?: (deviceId: string) => void;
  readonly fallback?: ReactNode;
}

interface Picked {
  remembered: StageView.StageViews['view'] | undefined;
  lastFloor: string | null;
  stage: StageProbe | null;
}

interface StageProbe {
  readonly content: {
    readonly kind: string;
    readonly id?: string;
    readonly render: (context: unknown, live?: unknown) => ReactNode;
  };
  readonly views: readonly { readonly value: string }[];
  readonly view: string;
  readonly onViewChange: unknown;
  readonly tools: { readonly tools3d: boolean } | null;
  readonly floors?: { readonly value: string; readonly onChange: unknown };
}

function View({
  children,
  style,
}: {
  readonly children?: ReactNode;
  readonly style?: unknown;
}): ReactNode {
  if (style !== undefined) probe.viewStyles.push(style);
  return children ?? null;
}
const none = (): null => null;

vi.mock('../../home-map', async () => ({
  ...(await import('../../home-map/data/live-feed')),
  ...(await import('../../home-map/data/map-demand')),
  ...(await import('../../home-map/data/map-scene')),
  ...(await import('../../home-map/data/stage-maps')),
  ...(await import('../../home-map/components/stage/full-screen')),
  ...(await import('../../home-map/components/stage/stage')),
  ...(await import('../../home-map/components/stage/home-map-3d')),
  ...(await import('../../home-map/components/stage/stage-states')),
  ...(await import('../../home-map/components/stage/no-map-entry')),
  ...(await import('../../home-map/model/stage-view')),
}));
vi.mock('react-native', () => ({
  View,
  Platform: { OS: 'android' },
  Dimensions: { get: (): typeof probe.viewport => probe.viewport },
  useWindowDimensions: (): typeof probe.viewport => probe.viewport,
}));
vi.mock('react-native-svg', () => ({ default: none, Path: none }));
vi.mock('expo-router', () => ({
  useRouter: (): { push: (target: unknown) => void } => ({
    push: (target): void => {
      probe.pushed.push(target);
    },
  }),
}));
vi.mock('../../../components/button', () => ({ Button: none }));
vi.mock('../../../components/text', () => ({ Text: none }));
vi.mock('../../home-map/components/stage/home-map-3d', () => ({
  HomeMap3d: (props: Solid): null => {
    probe.solid.push(props);
    return null;
  },
}));
vi.mock('../../home-map/data/live-feed', () => ({
  useHomeMapLive: (): unknown => FEED,
}));
vi.mock('../../../components/house-map/iso/iso-still', () => ({
  IsoStill: (props: Record<string, unknown>): null => {
    probe.still.push(props);
    return null;
  },
}));
vi.mock('../../../components/icon', () => ({ Icon: none }));
vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: ({
    map,
  }: {
    readonly map: { readonly floors: Floor[] };
  }): {
    floors: Floor[];
  } => ({ floors: map.floors }),
}));
vi.mock('../../../design/colour', () => ({
  useColourResolver: (): ((role: string) => string) => (role) => role,
}));
vi.mock('../../../store/selectors', () => ({
  useDevices: (): [] => [],
  useRooms: (): [] => [],
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('../../home-map/data/stage-maps', () => ({
  useChosenHomeMap: (): MapState & { retry: () => void; maps: undefined } => ({
    ...probe.state,
    retry: none,
    maps: undefined,
  }),
}));
vi.mock('../../../store/prefs', () => ({ PREFS: {}, prefValueOf: none, savePref: none }));
vi.mock('../../home-map/data/map-demand', () => ({
  useHomeMapDemand: (board: string, map: unknown): void => {
    probe.demands.push([board, map]);
  },
}));
vi.mock('../../home-map/model/create-map', () => ({ useCreateMap: none }));
vi.mock('../../home-map/components/stage/no-map-state', () => ({ NoMapState: none }));
vi.mock('../../home-map/components/stage/full-screen', () => ({ StageFullScreen: none }));
vi.mock('../../home-map/components/stage/stage-chrome', () => ({
  NoticeChip: ({ notice }: { readonly notice: { readonly text: string } }): null => {
    probe.notices.push(notice.text);
    return null;
  },
  SWITCHER_ROW: 'switcher-row',
}));
vi.mock('../../home-map/components/stage/stage', () => ({
  Stage: (props: StageProbe): null => {
    probe.stages.push(props.content.kind);
    probe.stage = props;
    return null;
  },
}));
vi.mock('../../home-map/model/stage-view', async (actual) => {
  const real = await actual<typeof StageView>();
  return {
    ...real,
    useStageLights: (): unknown => ({ on: true, onToggle: none }),
    useLastFloor: (): unknown => ({ floorId: probe.lastFloor, setFloor: probe.setFloor }),
    useStageViews: (page: string, facts: { readonly hasScan: boolean }): unknown => {
      probe.pages.push(page);
      const views = real.stageViewsOf(facts);
      return { views, view: real.shownStageView(probe.remembered, views), setView: probe.setView };
    },
  };
});
vi.mock('../../../plugins/shelly-presence/presence-data', () => ({ isPhysicalPresence: none }));
vi.mock('./hero-live', () => ({
  useHeroLook: (): unknown => ({
    look: { showOnHome: probe.shown, showRobot: true, showPeople: true },
    hide: probe.hide,
  }),
  HeroNoMap: ({
    map,
    menu,
  }: {
    readonly map: unknown;
    readonly menu: (typeof probe.menus)[number];
  }): null => {
    probe.entries.push(map);
    probe.menus.push(menu);
    return null;
  },
}));

const FEED = { overlay: {}, lighting: {}, summary: 'Home, 2 rooms' };

const { HomeMapHero } = await import('./home-map-hero');

function render(state: MapState, realistic?: () => ReactNode): void {
  probe.state = state;
  probe.stage = null;
  probe.entries.length = 0;
  probe.menus.length = 0;
  probe.stages.length = 0;
  probe.viewStyles.length = 0;
  probe.demands.length = 0;
  renderToStaticMarkup(createElement(HomeMapHero, { realistic }));
}

const floor = (rooms: number): Floor => ({
  id: 'ground',
  name: 'Ground',
  rooms: Array.from({ length: rooms }, () => ({})),
});

const mapWith = (...floors: Floor[]): NonNullable<MapState['map']> => ({
  id: 'home',
  name: 'Home',
  floors,
  sources: [],
  notices: [],
});

describe('home top without a drawn map', () => {
  it('shows Create a map for a map with an empty floor instead of an endless skeleton', () => {
    const map = mapWith(floor(0));
    render({ map, loading: false, failure: null });
    expect(probe.entries).toEqual([map]);
    expect(probe.stages).toEqual([]);
  });

  it('shows Create a map for a map with no floors at all', () => {
    const map = mapWith();
    render({ map, loading: false, failure: null });
    expect(probe.entries).toEqual([map]);
  });

  it('keeps the loading stage while reading and after a failed read, never Create a map', () => {
    render({ map: null, loading: true, failure: null });
    expect(probe.entries).toEqual([]);
    expect(probe.stages).toEqual(['direct']);
    render({ map: null, loading: false, failure: new Error('offline') });
    expect(probe.entries).toEqual([]);
    expect(probe.stages).toEqual(['direct']);
  });

  it('shows the live map once a room is drawn', () => {
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    expect(probe.entries).toEqual([]);
    expect(probe.stages).toEqual(['live']);
  });
});

describe('home top setting and demand', () => {
  it('draws nothing and holds no live demand when the map is hidden from Home', () => {
    probe.shown = false;
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    probe.shown = true;
    expect(probe.stages).toEqual([]);
    expect(probe.entries).toEqual([]);
    expect(probe.demands).toEqual([]);
  });

  it('asks for live demand with the shown map', () => {
    const map = mapWith(floor(2));
    render({ map, loading: false, failure: null });
    expect(probe.demands).toEqual([['home', map]]);
  });

  it('offers Hide from Home on the make your map card through the same setting', () => {
    const hide = vi.fn();
    probe.hide = hide;
    render({ map: mapWith(floor(0)), loading: false, failure: null });
    const [menu] = probe.menus;
    expect(menu?.map((item) => item.label)).toEqual(['Hide from Home']);
    menu?.[0]?.onPress();
    expect(hide).toHaveBeenCalledOnce();
  });
});

const CONTEXT = {
  view3d: { preset: 'angled', fitSeq: 0, follow: false },
  chrome: [],
  chromeInsets: { top: 0, bottom: 0 },
};

function body(active: boolean): void {
  probe.still.length = 0;
  probe.solid.length = 0;
  const live = { active, quality: {}, onReady: none, onFrameTime: none, onUnavailable: none };
  const stage = probe.stage;
  if (stage === null) throw new Error('no stage');
  renderToStaticMarkup(createElement(() => stage.content.render(CONTEXT, live)));
}

const upper: Floor = { id: 'upper', name: 'Upper', rooms: [{}] };

describe('home top views', () => {
  it('reserves room for widgets only from the medium-height boundary', () => {
    const viewport = probe.viewport;
    const state = { map: mapWith(floor(2)), loading: false, failure: null };
    try {
      probe.viewport = { ...viewport, height: 479 };
      render(state);
      expect(probe.viewStyles).toContainEqual({ height: 268 });
      probe.viewport = { ...viewport, height: 480 };
      render(state);
      expect(probe.viewStyles).toContainEqual({ height: 221 });
    } finally {
      probe.viewport = viewport;
    }
  });

  it.each([undefined, '3d'] as const)('shows 3D alone with its tools for a %s view', (kept) => {
    probe.remembered = kept;
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    expect(probe.stage?.view).toBe('3d');
    expect(probe.stage?.views.map((view) => view.value)).toEqual(['3d']);
    expect(probe.stage?.tools?.tools3d).toBe(true);
    body(true);
    expect(probe.solid).toHaveLength(1);
    probe.remembered = undefined;
  });

  it('mounts the 3D map inside the live stage host with the live summary and the active flag', () => {
    probe.remembered = undefined;
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    expect(probe.stage?.content.kind).toBe('live');
    expect(probe.stage?.content.id).toBe('home-map.home-hero');
    body(true);
    expect(probe.solid).toHaveLength(1);
    expect(probe.solid[0]).toMatchObject({ label: FEED.summary, live: { active: true } });
    body(false);
    expect(probe.solid[0]).toMatchObject({ live: { active: false } });
  });

  it('opens the device on the Devices page from a 3D device pick', () => {
    probe.remembered = undefined;
    probe.pushed.length = 0;
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    body(true);
    const [solid] = probe.solid;
    if (solid?.onPickDevice === undefined) throw new Error('no device pick');
    solid.onPickDevice('lamp');
    expect(probe.pushed).toHaveLength(1);
    expect(JSON.stringify(probe.pushed[0])).toContain('lamp');
  });

  it('falls back to the iso still of the floor with the failure line', () => {
    probe.remembered = undefined;
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    body(true);
    probe.notices.length = 0;
    renderToStaticMarkup(createElement(() => probe.solid[0]?.fallback));
    expect(probe.notices).toEqual(["3D isn't available on this device"]);
    expect(probe.still).toHaveLength(1);
    expect(probe.still[0]).toMatchObject({ input: { floor: floor(2) }, name: 'Home' });
  });

  it('saves a view change through the remembered view of the Home page', () => {
    render({ map: mapWith(floor(2)), loading: false, failure: null });
    expect(probe.stage?.onViewChange).toBe(probe.setView);
    expect(new Set(probe.pages)).toEqual(new Set(['home']));
  });

  it('offers Realistic only for a scanned map when a realistic body is given', () => {
    const scanned = { ...mapWith(floor(2)), scan: {} };
    render({ map: scanned, loading: false, failure: null }, () => null);
    expect(probe.stage?.views.map((view) => view.value)).toEqual(['3d', 'realistic']);
    render({ map: scanned, loading: false, failure: null });
    expect(probe.stage?.views.map((view) => view.value)).toEqual(['3d']);
  });

  it('switches floors through the remembered floor and keeps the view', () => {
    probe.remembered = 'realistic';
    render({ map: mapWith(floor(2), upper), loading: false, failure: null });
    expect(probe.stage?.floors?.value).toBe('ground');
    expect(probe.stage?.floors?.onChange).toBe(probe.setFloor);
    probe.lastFloor = 'upper';
    render({ map: mapWith(floor(2), upper), loading: false, failure: null });
    expect(probe.stage?.floors?.value).toBe('upper');
    expect(probe.stage?.view).toBe('3d');
    probe.lastFloor = null;
    probe.remembered = undefined;
  });
});
