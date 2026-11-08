import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createVisibilityRegistry } from '../../../components/house-map/live-visibility/registry';

interface Room {
  readonly id: string;
  readonly homeRoomId: string | null;
  readonly hidden: boolean;
  readonly polygons: readonly {
    readonly outer: readonly { readonly x: number; readonly y: number }[];
    readonly holes: readonly never[];
  }[];
}

interface Floor {
  readonly id: string;
  readonly name: string;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly rooms: readonly Room[];
}

interface Solid extends Record<string, unknown> {
  readonly floor: Floor;
  readonly scene: { readonly floors: readonly Floor[] };
  readonly selection: readonly string[];
  readonly frameRooms: readonly string[];
  readonly onPickRoom: (roomId: string | null) => void;
  readonly onPickDevice: (deviceId: string) => void;
  readonly fallback: ReactNode;
}

interface StageProbe {
  readonly content: {
    readonly kind: string;
    readonly id: string;
    readonly modalCovered: boolean;
    readonly render: (context: unknown, live: unknown) => ReactNode;
  };
  readonly views: readonly { readonly value: string }[];
  readonly tools: { readonly tools3d: boolean } | null;
  readonly camera: { readonly preset: string; readonly onPreset: (preset: string) => void };
}

interface Probe {
  scene: { readonly floors: readonly Floor[] } | null;
  stage: StageProbe | null;
  readonly solid: Solid[];
  readonly still: Record<string, unknown>[];
  readonly pushed: unknown[];
}

const probe = vi.hoisted((): Probe => ({
  scene: null,
  stage: null,
  solid: [],
  still: [],
  pushed: [],
}));

const none = (): null => null;

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children ?? null,
  useWindowDimensions: (): { width: number; height: number } => ({ width: 400, height: 800 }),
}));
vi.mock('expo-router', () => ({
  useRouter: (): { push: (target: unknown) => void } => ({
    push: (target): void => {
      probe.pushed.push(target);
    },
  }),
}));
vi.mock('../../../store/prefs', () => ({ PREFS: {}, prefValueOf: none }));
vi.mock('../../../store/store-context', () => ({
  useStoreSelector: (): unknown => ({ showFurniture: true, showDeviceModels: true }),
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('../../home-map', () => ({
  HomeMap3d: (props: Solid): null => {
    probe.solid.push(props);
    return null;
  },
  Stage: (props: StageProbe): null => {
    probe.stage = props;
    return null;
  },
  StageStillView: (props: Record<string, unknown>): null => {
    probe.still.push(props);
    return null;
  },
  stageDimmed: (): boolean => false,
  stageIdOf: ({ roomId }: { readonly roomId: string }): string => `home-map.room-header.${roomId}`,
  stageNotices: (): readonly never[] => [],
  stageNoticesNode: none,
  useHomeMap: (): unknown => ({
    map: probe.scene === null ? null : {},
    failure: null,
    retry: none,
  }),
  useHomeMapLive: (): unknown => FEED,
  useHomeMapScene: (map: unknown): unknown => (map === null ? null : probe.scene),
  useStageLights: (): unknown => ({ on: true, onToggle: none }),
}));

const FEED = { overlay: {}, lighting: {}, summary: 'Kitchen, 3 devices' };

const { RoomMapHeader, ROOM_HEADER_PRESET } = await import('./room-map-header');

const square = (x: number, y: number): Room['polygons'][number] => ({
  outer: [
    { x, y },
    { x: x + 3, y },
    { x: x + 3, y: y + 3 },
    { x, y: y + 3 },
  ],
  holes: [],
});

const FLOOR: Floor = {
  id: 'ground',
  name: 'Ground',
  bounds: { minX: 0, minY: 0, maxX: 9, maxY: 3 },
  rooms: [
    { id: 'm-kitchen', homeRoomId: 'kitchen', hidden: false, polygons: [square(0, 0)] },
    { id: 'm-hall', homeRoomId: 'hall', hidden: false, polygons: [square(3, 0)] },
    { id: 'm-bath', homeRoomId: 'bath', hidden: false, polygons: [square(6, 0)] },
  ],
};

const CONTEXT = {
  view3d: { preset: 'top', fitSeq: 0, follow: false },
  chrome: [],
  chromeInsets: { top: 0, bottom: 0 },
};

const LIVE = { active: true, quality: {}, onReady: none, onFrameTime: none, onUnavailable: none };

function stageOf(): StageProbe {
  const stage = probe.stage;
  if (stage === null) throw new Error('no stage');
  return stage;
}

function render(roomId: string, covered = false): StageProbe {
  probe.scene = { floors: [FLOOR] };
  probe.stage = null;
  probe.solid.length = 0;
  probe.still.length = 0;
  renderToStaticMarkup(
    createElement(RoomMapHeader, { roomId, roomName: 'Kitchen', covered, sideBySide: false }),
  );
  return stageOf();
}

function solidOf(stage: StageProbe): Solid {
  renderToStaticMarkup(createElement(() => stage.content.render(CONTEXT, LIVE)));
  const [solid] = probe.solid;
  if (solid === undefined) throw new Error('no 3D map');
  return solid;
}

describe('room page header', () => {
  it('draws the room on the live 3D stage, Top first with Angled in the camera control', () => {
    const stage = render('kitchen');
    expect(ROOM_HEADER_PRESET).toBe('top');
    expect(stage.camera.preset).toBe('top');
    expect(typeof stage.camera.onPreset).toBe('function');
    expect(stage.tools?.tools3d).toBe(true);
    expect(stage.views.map((view) => view.value)).toEqual(['3d']);
    expect(stage.content.kind).toBe('live');
    expect(stage.content.id).toBe('home-map.room-header.kitchen');
  });

  it('frames and outlines the room on the whole floor, not a cropped floor', () => {
    const solid = solidOf(render('kitchen'));
    expect(solid.frameRooms).toEqual(['m-kitchen']);
    expect(solid.selection).toEqual(['m-kitchen']);
    expect(solid.floor.bounds).toEqual(FLOOR.bounds);
    expect(solid.floor.rooms).toHaveLength(3);
    expect(solid.scene.floors).toEqual([FLOOR]);
    expect(solid).toMatchObject({ label: FEED.summary, live: { active: true } });
  });

  it('opens the tapped room or device on the Devices page', () => {
    probe.pushed.length = 0;
    const solid = solidOf(render('kitchen'));
    solid.onPickRoom('m-hall');
    solid.onPickDevice('lamp');
    solid.onPickRoom(null);
    expect(probe.pushed).toHaveLength(2);
    expect(JSON.stringify(probe.pushed[0])).toContain('hall');
    expect(JSON.stringify(probe.pushed[1])).toContain('lamp');
  });

  it('falls back to the still of the room with the failure line', () => {
    const solid = solidOf(render('kitchen'));
    probe.still.length = 0;
    renderToStaticMarkup(createElement(() => solid.fallback));
    expect(probe.still).toHaveLength(1);
    expect(probe.still[0]).toMatchObject({
      input: { activeRoomIds: ['m-kitchen'] },
      state: { unavailable: true },
    });
  });

  it('pauses behind a covering sheet and draws nothing for a room off the map', () => {
    expect(render('kitchen', true).content.modalCovered).toBe(true);
    probe.stage = null;
    renderToStaticMarkup(
      createElement(RoomMapHeader, {
        roomId: 'garage',
        roomName: 'Garage',
        covered: false,
        sideBySide: false,
      }),
    );
    expect(probe.stage).toBeNull();
  });

  it('keeps one live WebGL stage with several room pages open', () => {
    const registry = createVisibilityRegistry();
    const ids = ['kitchen', 'hall', 'bath'].map((roomId) => render(roomId).content.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) registry.register(id, { onScreen: true, stillReady: true });
    const [first, second, top] = ids;
    if (first === undefined || second === undefined || top === undefined) throw new Error('ids');
    registry.report(first, { screenFocused: false });
    registry.report(second, { screenFocused: false });
    registry.report(top, { screenFocused: true });
    expect(ids.filter((id) => registry.getStage(id).mounted)).toEqual([top]);
    expect(registry.liveStageIds()).toEqual([top]);
  });

  it('has no 2D map left', () => {
    const source = readFileSync(new URL('./room-map-header.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/house-map\/2d\/|Map2d/u);
  });
});
