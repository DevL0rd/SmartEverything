import { readFileSync } from 'node:fs';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HOME_MAP_WRITE, VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { StageLiveProps } from '../../../../components/house-map/live-visibility/stage-host';
import type { StageInput } from './map-view-model';

interface Props {
  readonly children?: ReactNode;
  readonly fallback?: ReactNode;
  readonly action?: ReactNode;
  readonly onPickRoom?: (roomId: string | null) => void;
  readonly onPickDevice?: (deviceId: string) => void;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

const pushed = vi.hoisted(() => new Array<unknown>());

const LOOK = vi.hoisted(() => ({ showOnHome: true, showFurniture: true, showDeviceModels: true }));
const FEED = vi.hoisted(() => ({ overlay: 'overlay', lighting: 'lighting' }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? props.fallback ?? null;
  };
}

vi.mock('../../../home-map', async () => ({
  ...(await import('../../../home-map/components/stage/stage')),
  HomeMap3d: stub('HomeMap3d'),
  StageStillView: stub('StageStillView'),
  useHomeMapLive: (): typeof FEED => FEED,
}));
vi.mock('expo-router', () => ({
  useRouter: (): { push: (target: unknown) => void } => ({
    push: (target): void => {
      pushed.push(target);
    },
  }),
}));
vi.mock('../../../../store/store-context', () => ({
  useStoreSelector: (): typeof LOOK => LOOK,
}));
vi.mock('../../../../store/prefs', () => ({
  PREFS: { homeMapLook: {} },
  prefValueOf: (): typeof LOOK => LOOK,
}));
vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../device-visuals', () => ({ useVacuumFinish: (): string => 'default' }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/empty-state', () => ({
  EmptyState: (props: Props): ReactNode => {
    seen.push({ kind: 'EmptyState', props });
    return props.action;
  },
}));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/skeleton', () => ({ Skeleton: stub('Skeleton') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../data/use-vacuum-pose', () => ({
  useVacuumPose: (): { ok: true; value: null } => ({ ok: true, value: null }),
  useVacuumLivePose: (): { ok: true; value: null } => ({ ok: true, value: null }),
}));
vi.mock('./map-3d-view', () => ({ Map3dView: stub('Map3dView') }));
vi.mock('../../../home-map/components/stage/stage-chrome', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  StageTools: stub('StageTools'),
  StatusPill: stub('StatusPill'),
}));
vi.mock('../data/map-demand', () => ({ useVacuumMapDemand: (): void => undefined }));
vi.mock('../../../../components/house-map/live-visibility/stage-host', () => ({
  StageHost: stub('StageHost'),
}));

const { MapStage, stageContentOf } = await import('./vacuum-stage');
const { planStage } = await import('./map-view-model');
const { unifiedMapOf, unifiedPlaceOf } = await import('../model/unified-map');

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(new URL('../model/scene-geometry.fixture.json', import.meta.url), 'utf8'),
  ),
);

const input: StageInput = {
  online: true,
  webgl: true,
  requested: '3d',
  hasMapVersion: true,
  scene,
  unreadable: false,
  lastSeenAt: '2026-10-24T14:02:00.000Z',
  timeZone: 'UTC',
  fault: null,
  notAccepted: null,
};

const handlers = {
  onNoWebgl: vi.fn(),
  onPickRoom: vi.fn(),
  onMapHome: vi.fn(),
  mapHomeDisabled: false,
  onRetry: vi.fn(),
};

type StageProps = Parameters<typeof MapStage>[0];

function stageProps(change: Partial<StageInput> = {}, stage: Partial<StageProps> = {}): StageProps {
  return {
    deviceId: 'robot',
    plan: planStage({ ...input, ...change }),
    status: 'cleaning',
    selection: [],
    turretRaised: 0,
    camera: createElement('div'),
    handlers,
    onViewChange: () => undefined,
    ...stage,
  };
}

function render(change: Partial<StageInput> = {}, stage: Partial<StageProps> = {}): Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(MapStage, stageProps(change, stage)));
  return [...seen];
}

function find(entries: readonly Seen[], kind: string): Props {
  const found = entries.find((entry) => entry.kind === kind);
  if (found === undefined) {
    throw new Error(`no ${kind} rendered`);
  }
  return found.props;
}

function has(entries: readonly Seen[], kind: string): boolean {
  return entries.some((entry) => entry.kind === kind);
}

function texts(entries: readonly Seen[]): readonly unknown[] {
  return entries.filter((entry) => entry.kind === 'Text').map((entry) => entry.props.children);
}

function labels(drawn: readonly Seen[]): readonly unknown[] {
  const options = find(drawn, 'Segmented')['options'];
  return Array.isArray(options) ? options.map((option: { label: unknown }) => option.label) : [];
}

describe('MapStage on the robot map', () => {
  it('mounts the live robot 3D view with the still as its fallback', () => {
    const drawn = render();
    const view = find(drawn, 'Map3dView');
    expect(view).toMatchObject({ deviceId: 'robot', preset: 'angled', turretRaised: 0 });
    expect(String(view['label'])).toMatch(/^Map of .+, \d+ rooms?/u);
    expect(view['onUnavailable']).toBe(handlers.onNoWebgl);
    expect(isValidElement(view.fallback)).toBe(true);
    expect(find(drawn, 'StageTools')['tools3d']).toBe(true);
  });

  it('offers only 3D and Camera, every option selectable', () => {
    const drawn = render({ webgl: false });
    expect(labels(drawn)).toEqual(['3D', 'Camera']);
    expect(JSON.stringify(find(drawn, 'Segmented')['options'])).not.toContain('disabled');
  });

  it('keeps the face clear of the camera chip and draws no view switcher there', () => {
    const drawn = render({ requested: '3d' }, { variant: 'face', reserveBottom: true });
    expect(has(drawn, 'Segmented')).toBe(false);
    expect(find(drawn, 'Map3dView')['insets']).toEqual({ top: 8, bottom: 56 });
    expect(has(render({}, { variant: 'face', onLocate: vi.fn() }), 'StageTools')).toBe(false);
  });

  it('shows only a short no map line on a face', () => {
    const drawn = render({ scene: null, hasMapVersion: false }, { variant: 'face' });
    expect(has(drawn, 'EmptyState')).toBe(false);
    expect(texts(drawn)).toContain('No map yet');
  });

  it('fits the whole plan by default and offers follow on the robot map', () => {
    const drawn = render({}, { pill: { text: 'Cleaning', tone: 'working' } });
    expect(find(drawn, 'Map3dView')['follow']).toBe(false);
    expect(find(drawn, 'StageTools')['follow']).toMatchObject({ on: false });
  });

  it('keeps 3D selected over the still with a note when WebGL is missing', () => {
    const drawn = render({ webgl: false });
    expect(find(drawn, 'Segmented')['value']).toBe('3d');
    expect(has(drawn, 'Map3dView')).toBe(false);
    expect(find(drawn, 'StageStillView')['name']).toBe(scene.name);
    expect(texts(drawn)).toContain("3D isn't available on this device");
  });

  it('dims the last 3D map and says it is not reachable when offline', () => {
    const drawn = render({ online: false });
    expect(has(drawn, 'Map3dView')).toBe(true);
    expect(drawn.some((entry) => String(entry.props['className']).includes('opacity-60'))).toBe(
      true,
    );
    expect(texts(drawn).some((text) => String(text).startsWith('Not reachable · last seen'))).toBe(
      true,
    );
  });

  it('shows a loading state while the scene is on its way', () => {
    const drawn = render({ scene: null });
    expect(drawn.some((e) => e.props['accessibilityLabel'] === 'Loading the map')).toBe(true);
    expect(has(drawn, 'Map3dView')).toBe(false);
  });

  it('offers a quick mapping when there is no map yet, disabled while unreachable', () => {
    expect(find(render({ scene: null, hasMapVersion: false }), 'Button')).toMatchObject({
      label: 'Run a quick mapping',
      disabled: false,
      onPress: handlers.onMapHome,
    });
    const offline = render(
      { scene: null, hasMapVersion: false, online: false },
      { handlers: { ...handlers, mapHomeDisabled: true } },
    );
    expect(find(offline, 'Button')['disabled']).toBe(true);
  });

  it('shows the last good map with a retry when the newer map cannot be read', () => {
    const drawn = render({ unreadable: true });
    expect(has(drawn, 'Map3dView')).toBe(true);
    expect(drawn.find((e) => e.props['label'] === 'Try again')?.props['onPress']).toBe(
      handlers.onRetry,
    );
  });

  it('shows the camera in place of the map when chosen', () => {
    const drawn = render({ requested: 'camera' }, { onLocate: vi.fn() });
    expect(has(drawn, 'Map3dView')).toBe(false);
    expect(has(drawn, 'StageTools')).toBe(false);
    expect(find(drawn, 'Segmented')['value']).toBe('camera');
  });
});

const HOST = { id: 'home-map.vacuum-page.robot:page:r1', covered: false } as const;

const CONTEXT = {
  variant: 'page',
  view3d: { preset: 'angled', fitSeq: 0, follow: false },
  chrome: [],
  chromeInsets: { top: 4, bottom: 6 },
  focus: { kind: 'none' },
} as const;

const LIVE: StageLiveProps = {
  active: true,
  quality: { renderScale: 1, splatScale: 1, lodBias: 0, decalLightShare: 0, animationDivisor: 1 },
  onReady: vi.fn(),
  onFrameTime: () => undefined,
  onUnavailable: () => undefined,
};

function hosted(props: StageProps): Seen[] {
  const content = stageContentOf(props);
  if (content.kind !== 'live') {
    throw new Error('the map is not hosted');
  }
  seen.length = 0;
  renderToStaticMarkup(createElement('div', null, content.render(CONTEXT, LIVE)));
  return [...seen];
}

const ROBOT = '44444444-4444-4444-8444-444444444444';

const RING = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

function houseOf(): NonNullable<ReturnType<typeof unifiedMapOf>> {
  const map = HOME_MAP_WRITE.parse({
    id: 'home',
    schemaVersion: 1,
    revision: 1,
    name: 'Synthetic house',
    north: 0,
    updatedAt: '2026-10-25T00:00:00.000Z',
    floors: [
      {
        ...{ id: 'ground', name: 'Ground floor', level: 0, elevation: 0, ceilingHeight: 2.6 },
        ...{ walls: [], openings: [], objects: [], placements: [], annotations: [] },
        rooms: [
          {
            ...{ id: 'house-kitchen', name: 'Kitchen', homeRoomId: null, colourSlot: 2 },
            ...{ polygon: { outer: RING, holes: [] }, labelAt: RING[0], wallPaint: null },
            floorMaterial: { kind: 'tile', variant: null, tint: '#a0a0a0' },
            ceilingHeight: null,
            origin: {
              ...{ kind: 'source', sourceId: 'source', overridden: [] },
              ref: String(scene.rooms[0]?.id),
            },
          },
        ],
      },
    ],
    sources: [
      {
        ...{ id: 'source', kind: 'xiaomi_vacuum', deviceId: ROBOT, floorId: 'ground' },
        transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
        frame: { uid: null, name: null, boundsSignature: 'sig' },
        ...{ lastVersion: null, lastImportedAt: null, tombstones: [] },
        base: { rooms: [], walls: [], openings: [] },
      },
    ],
    notices: [],
  });
  const place = unifiedPlaceOf(map, ROBOT);
  const unified = place === null ? null : unifiedMapOf(place, null, {});
  if (unified === null) throw new Error('no house map');
  return unified;
}

describe('MapStage on the visibility registry', () => {
  it('hosts the drawn map as a registered live stage with the still as its placeholder', () => {
    const content = stageContentOf(stageProps({}, { live: HOST }));
    expect(content).toMatchObject({ kind: 'live', id: HOST.id, modalCovered: false });
    expect(content.kind === 'live' && isValidElement(content.still)).toBe(true);
    expect(find(render({}, { live: HOST }), 'StageHost')['id']).toBe(HOST.id);
    const covered = stageContentOf(stageProps({}, { live: { ...HOST, covered: true } }));
    expect(covered).toMatchObject({ kind: 'live', modalCovered: true });
  });

  it('draws the robot 3D view inside the host and reports ready once it is laid out', () => {
    const drawn = hosted(stageProps({}, { live: HOST }));
    expect(find(drawn, 'Map3dView')['insets']).toEqual(CONTEXT.chromeInsets);
    expect(drawn.some((entry) => entry.props['onLayout'] === LIVE.onReady)).toBe(true);
  });

  it('registers nothing for the camera, a state card or a stage without a host', () => {
    expect(stageContentOf(stageProps({ requested: 'camera' }, { live: HOST })).kind).toBe('direct');
    expect(stageContentOf(stageProps({ scene: null }, { live: HOST })).kind).toBe('direct');
    expect(stageContentOf(stageProps()).kind).toBe('direct');
  });
});

describe('MapStage on the house map', () => {
  it('draws the home 3D stage with the live feed when the robot feeds the home map', () => {
    const unified = houseOf();
    const drawn = hosted(stageProps({ requested: '3d' }, { live: HOST, unified }));
    const stage = find(drawn, 'HomeMap3d');
    expect(stage).toMatchObject({ scene: unified.scene, floor: unified.floor, feed: FEED });
    expect(stage).toMatchObject({ look: LOOK, live: LIVE, insets: CONTEXT.chromeInsets });
    expect(String(stage['label'])).toMatch(/^Map of Ground floor, 1 room/u);
    expect(has(drawn, 'Map3dView')).toBe(false);
  });

  it('selects house rooms and turns room and device picks into robot rooms and device pages', () => {
    const unified = houseOf();
    const robotRoom = scene.rooms[0]?.id ?? -1;
    const props = stageProps({}, { live: HOST, unified, selection: [robotRoom] });
    const stage = find(hosted(props), 'HomeMap3d');
    expect(stage['selection']).toEqual(['house-kitchen']);
    const { onPickRoom, onPickDevice } = stage;
    if (onPickRoom === undefined || onPickDevice === undefined) {
      throw new Error('the house map is not tappable');
    }
    handlers.onPickRoom.mockClear();
    onPickRoom('house-kitchen');
    onPickRoom(null);
    expect(handlers.onPickRoom.mock.calls).toEqual([[robotRoom], [null]]);
    pushed.length = 0;
    onPickDevice('lamp');
    expect(pushed).toHaveLength(1);
  });

  it('offers no follow on the house map and draws the house still without WebGL', () => {
    const unified = houseOf();
    expect(find(render({}, { live: HOST, unified }), 'StageTools')['follow']).toBeUndefined();
    const drawn = hosted(stageProps({ webgl: false }, { live: HOST, unified }));
    expect(find(drawn, 'StageStillView')['name']).toBe('Ground floor');
  });

  it('uses the robot 3D view where the stage has no host', () => {
    expect(has(render({}, { unified: houseOf() }), 'Map3dView')).toBe(true);
  });
});
