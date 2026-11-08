import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP,
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_WALL_WRITE,
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapVec,
} from '@smarteverything/domain';
import type {
  EditEvent,
  EditHit,
  EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';

interface Props {
  readonly children?: ReactNode;
  readonly title?: unknown;
  readonly label?: unknown;
  readonly onPress?: unknown;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());
const LIVING = '00000000-0000-4000-8000-00000000000a';
const KITCHEN = '00000000-0000-4000-8000-00000000000b';

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../../components/number-stepper', () => ({ NumberStepper: stub('Stepper') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../design/size-class', () => ({ useIsPhone: (): boolean => true }));
vi.mock('../list-editor/list-parts', () => ({ CmField: stub('CmField') }));
vi.mock('../../../../store/selectors', () => ({
  useRooms: (): readonly object[] => [],
  useDevices: (): readonly object[] => [],
  useDeviceValue: (): null => null,
}));

const { WallsOpeningsPanel, wallsOpeningsEdit } = await import('./walls-openings');
const mount = await import('./walls-mount');
const model = await import('./walls-openings-model');

const HAND = { kind: 'hand' };
const USER = { actor: 'profile:alice', at: '2026-10-25T11:00:00.000Z' };
const MPP = 0.01;

const room = (id: string, name: string, ys: readonly [number, number]): object => ({
  ...{ id, name, homeRoomId: null, colourSlot: 1 },
  polygon: {
    outer: [
      { x: 0, y: ys[0] },
      { x: 4, y: ys[0] },
      { x: 4, y: ys[1] },
      { x: 0, y: ys[1] },
    ],
    holes: [],
  },
  ...{ labelAt: { x: 2, y: (ys[0] + ys[1]) / 2 }, wallPaint: null, ceilingHeight: null },
  ...{ floorMaterial: { kind: 'tile', variant: null, tint: null }, origin: HAND },
});

const wallOf = (id: string, from: HomeMapVec, to: HomeMapVec): object => ({
  ...{ id, from, to, thickness: 0.1, height: null, kind: 'solid', origin: HAND },
});

const house = (): HomeMap =>
  HOME_MAP.parse({
    ...{ id: 'home', schemaVersion: 1, revision: 1, name: 'House', north: 0 },
    ...{ updatedAt: '2026-10-25T10:00:00.000Z', sources: [], notices: [] },
    floors: [
      {
        ...{ id: 'f1', name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6 },
        rooms: [room(LIVING, 'Living room', [0, 3]), room(KITCHEN, 'Kitchen', [-3, 0])],
        walls: [
          wallOf('w1', { x: 0, y: 0 }, { x: 4, y: 0 }),
          wallOf('w2', { x: 0, y: 0 }, { x: 0, y: 0.5 }),
        ],
        ...{ openings: [], objects: [], placements: [], annotations: [] },
      },
    ],
  });

const floorOf = (map: HomeMap): HomeMapFloor => {
  const floor = map.floors[0];
  if (floor === undefined) throw new Error('no floor');
  return floor;
};

type Context = Parameters<typeof wallsOpeningsEdit>[0]['context'];

interface Harness {
  readonly sent: HomeMapOp[][];
  readonly commits: { readonly seq: number; readonly ops: readonly HomeMapOp[] }[];
  readonly context: () => Context;
  readonly map: () => HomeMap;
  readonly state: () => typeof model.INITIAL_WALLS_OPENINGS;
  readonly overlay: () => EditOverlay;
  readonly send: (event: EditEvent) => void;
  readonly tap: (point: HomeMapVec, hit?: EditHit) => void;
}

function harness(mode: 'walls' | 'openings', readOnly = false): Harness {
  const sent: HomeMapOp[][] = [];
  const commits: { seq: number; ops: readonly HomeMapOp[] }[] = [];
  let map = house();
  let state = model.INITIAL_WALLS_OPENINGS;
  const apply = (ops: readonly HomeMapOp[]): void => {
    map = applyHomeMapEdits(map, ops, USER).map;
  };
  const context = (): Context => ({
    ...{ mode, floor: floorOf(map), state, readOnly },
    dispatch: (event): void => {
      state = model.reduceWallsOpenings(state, event);
    },
    edit: (ops): void => {
      sent.push([...ops]);
      apply(ops);
    },
  });
  const overlay = (): EditOverlay => mount.wallsOverlay(context(), true);
  const send = (event: EditEvent): void => {
    const commit = (seq: number, ops: readonly HomeMapOp[]): void => {
      commits.push({ seq, ops });
      apply(ops);
    };
    wallsOpeningsEdit({ context: context(), commit }, overlay(), event);
  };
  const tap = (point: HomeMapVec, hit: EditHit = { kind: 'none' }): void => {
    send({ seq: 0, type: 'tap', point, floorId: 'f1', hit, metresPerPx: MPP });
  };
  return { sent, commits, context, map: () => map, state: () => state, overlay, send, tap };
}

const isPress = (value: unknown): value is () => void => typeof value === 'function';

function press(kind: string, label: string): void {
  const found = seen.find((item) => item.kind === kind && item.props.label === label);
  const onPress = found?.props.onPress;
  if (!isPress(onPress)) throw new Error(label);
  onPress();
}

function render(tool: Harness): void {
  seen.length = 0;
  renderToStaticMarkup(
    createElement(WallsOpeningsPanel, { context: tool.context(), hubRooms: [] }),
  );
}

const labels = (kind: string): readonly unknown[] =>
  seen.filter((item) => item.kind === kind).map((item) => item.props.label);

beforeEach(() => {
  seen.length = 0;
});

describe('drawing walls', () => {
  it('snaps each tapped corner and finishes on a second tap at the last point', () => {
    const tool = harness('walls');
    tool.tap({ x: 1.03, y: 2.02 });
    tool.tap({ x: 3.98, y: 2.11 });
    tool.tap({ x: 4.04, y: 3.5 });
    expect(tool.state().draft).toEqual([
      { x: 1, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 3.5 },
    ]);
    tool.tap({ x: 4.15, y: 3.6 });
    expect(tool.state().draft).toEqual([]);
    const walls = floorOf(tool.map()).walls.slice(2);
    expect(walls).toHaveLength(2);
    for (const wall of walls) expect(HOME_MAP_WALL_WRITE.safeParse(wall).success).toBe(true);
    expect(walls[1]).toMatchObject({ thickness: 0.1, height: null, to: { x: 4, y: 3.5 } });
  });

  it('closes the outline when the first corner is tapped again', () => {
    const tool = harness('walls');
    tool.context().dispatch({ type: 'style', patch: { wallKind: 'glass' } });
    tool.context().dispatch({ type: 'style', patch: { height: 1.1 } });
    for (const point of [
      { x: 6, y: 6 },
      { x: 8, y: 6 },
      { x: 8, y: 8 },
      { x: 6, y: 8 },
      { x: 6.1, y: 6.1 },
    ]) {
      tool.tap(point);
    }
    const walls = floorOf(tool.map()).walls.slice(2);
    expect(walls).toHaveLength(4);
    expect(walls[3]).toMatchObject({ kind: 'glass', height: 1.1, to: { x: 6, y: 6 } });
  });

  it('draws the draft as an amber band with a centre line, length pills and the finish tip', () => {
    const tool = harness('walls');
    tool.tap({ x: 1, y: 1 });
    expect(tool.overlay().labels.map((label) => label.text)).toEqual([mount.NEXT_TIP]);
    tool.tap({ x: 3, y: 1 });
    const overlay = tool.overlay();
    expect(overlay.mode).toBe('draw-points');
    expect(overlay.ghosts.map((ghost) => [ghost.shape, ghost.tone])).toEqual([
      ['polygon', 'accent'],
      ['polyline', 'accent'],
    ]);
    const bandGhost = overlay.ghosts[0];
    if (bandGhost === undefined || bandGhost.shape === 'wall-face') throw new Error('no band');
    expect(bandGhost.points.map((point) => point.y)).toEqual([1.05, 1.05, 0.95, 0.95]);
    expect(overlay.labels.map((label) => label.text)).toEqual(['2.00 m', mount.FINISH_TIP]);
    expect(overlay.frame).toMatchObject({ key: 'walls:' + LIVING, top: false });
    expect(mount.wallsOverlay(tool.context(), false).frame).toBeNull();
    expect(mount.wallsNotice(tool.context())?.tone).toBe('info');
  });

  it('offers the drawing controls in the panel and undoes the last point', () => {
    const tool = harness('walls');
    tool.tap({ x: 1, y: 1 });
    tool.tap({ x: 3, y: 1 });
    render(tool);
    expect(labels('Stepper')).toEqual(['Thickness']);
    expect(labels('CmField')).toEqual(['Height']);
    expect(labels('Segmented')).toEqual(['Wall kind']);
    expect(labels('Button')).toEqual(['Undo point', 'Finish wall']);
    press('Button', 'Undo point');
    expect(tool.state().draft).toHaveLength(1);
  });

  it('does not draw while read only', () => {
    const tool = harness('walls', true);
    tool.tap({ x: 1, y: 1 });
    expect(tool.state().draft).toEqual([]);
  });
});

describe('a selected wall', () => {
  const onWall: EditHit = { kind: 'wall', id: 'w1', offset: 2 };

  it('selects the tapped wall with end knobs, a middle handle and a length pill', () => {
    const tool = harness('walls');
    tool.tap({ x: 2, y: 0 }, onWall);
    const overlay = tool.overlay();
    expect(overlay).toMatchObject({ mode: 'none', selection: ['w1'] });
    expect(overlay.handles.map((handle) => [handle.kind, handle.target])).toEqual([
      ['point', { kind: 'wall-end', wallId: 'w1', end: 'from' }],
      ['point', { kind: 'wall-end', wallId: 'w1', end: 'to' }],
      ['plane', { kind: 'wall-middle', wallId: 'w1' }],
    ]);
    expect(overlay.labels.map((label) => label.text)).toEqual(['4.00 m']);
    tool.tap({ x: 9, y: 9 });
    expect(tool.state().picked).toBeNull();
  });

  it('starts a wall instead when the tap is on the end of a wall', () => {
    const tool = harness('walls');
    tool.tap({ x: 3.9, y: 0 }, { kind: 'wall', id: 'w1', offset: 3.9 });
    expect(tool.state().picked).toBeNull();
    expect(tool.state().draft).toEqual([{ x: 4, y: 0 }]);
  });

  it('commits an end drag and a sideways push as one batch each with the drag seq', () => {
    const tool = harness('walls');
    tool.tap({ x: 2, y: 0 }, onWall);
    tool.send({ seq: 4, type: 'vertex', handleId: 'w1:to', point: { x: 5, y: 0 } });
    tool.send({ seq: 5, type: 'edge', handleId: 'w1:middle', offset: 0.5 });
    expect(tool.commits.map((commit) => commit.seq)).toEqual([4, 5]);
    expect(floorOf(tool.map()).walls[0]).toMatchObject({
      from: { x: 0, y: 0.5 },
      to: { x: 5, y: 0.5 },
    });
  });

  it('names the rooms on both sides, splits the wall and deletes it with its openings', () => {
    const tool = harness('walls');
    tool.tap({ x: 2, y: 0 }, onWall);
    render(tool);
    const title = seen.find((item) => item.kind === 'Text')?.props.children;
    expect(title).toBe('Wall · Living room and Kitchen');
    expect(labels('CmField')).toEqual(['Length', 'Height']);
    expect(labels('Button')).toEqual(['Split wall', 'Delete wall']);
    press('Button', 'Split wall');
    const walls = floorOf(tool.map()).walls;
    expect(walls).toHaveLength(3);
    expect(walls[0]).toMatchObject({ id: 'w1', to: { x: 2, y: 0 } });
    expect(walls[2]).toMatchObject({ from: { x: 2, y: 0 }, to: { x: 4, y: 0 } });
    tool.context().edit(model.removeWallOps(floorOf(tool.map()), 'w1'));
    expect(floorOf(tool.map()).walls.map((wall) => wall.id)).not.toContain('w1');
  });

  it('moves openings on the far half to the new wall and never cuts through a door', () => {
    const floor = floorOf(house());
    const wall = floor.walls[0];
    if (wall === undefined) throw new Error('no wall');
    const split = (offset: number): readonly HomeMapOp[] =>
      model.splitWallOps(
        { ...floor, openings: [HOME_MAP_OPENING_WRITE.parse(doorAt(offset))] },
        wall,
        () => 'w9',
      );
    expect(split(2.5).at(-1)).toMatchObject({ id: 'd1', patch: { wallId: 'w9', offset: 0.5 } });
    const across = split(1.8);
    expect(across[0]).toMatchObject({ patch: { to: { x: 2.6, y: 0 } } });
    expect(across).toHaveLength(2);
  });
});

function doorAt(offset: number): object {
  return {
    ...{ id: 'd1', wallId: 'w1', offset, kind: 'door', width: 0.8, sillHeight: 0 },
    ...{ headHeight: 2, hinge: 'left', swing: 'in', contactDeviceId: null },
    ...{ lockDeviceId: null, origin: HAND },
  };
}

describe('doors and windows', () => {
  const onWall: EditHit = { kind: 'wall', id: 'w1', offset: 2 };

  it('drops a door centred on the tapped wall spot and picks it on the next tap', () => {
    const tool = harness('openings');
    tool.tap({ x: 2, y: 0.4 }, onWall);
    const door = floorOf(tool.map()).openings[0];
    expect(HOME_MAP_OPENING_WRITE.safeParse(door).success).toBe(true);
    expect(door).toMatchObject({ wallId: 'w1', kind: 'door', offset: 1.6, width: 0.8 });
    expect(tool.state().picked).toEqual({ kind: 'opening', id: door?.id });
    tool.tap({ x: 2, y: 0 }, { kind: 'opening', id: door?.id ?? '' });
    expect(floorOf(tool.map()).openings).toHaveLength(1);
    tool.tap({ x: 9, y: 9 });
    expect(tool.state().picked).toBeNull();
  });

  it('refuses a door on a wall that is too short and says why in the notice', () => {
    const tool = harness('openings');
    tool.tap({ x: 0, y: 0.3 }, { kind: 'wall', id: 'w2', offset: 0.3 });
    expect(tool.sent).toEqual([]);
    expect(mount.wallsNotice(tool.context())).toMatchObject({ tone: 'warning' });
    expect(mount.wallsNotice(tool.context())?.text).toContain('0.80 m');
  });

  it('shows the band, end bars kept one target from the middle and the slide arrow', () => {
    const tool = harness('openings');
    tool.tap({ x: 2, y: 0 }, onWall);
    const overlay = tool.overlay();
    expect(overlay.selection).toEqual([floorOf(tool.map()).openings[0]?.id]);
    expect(overlay.handles.map((handle) => [handle.kind, handle.target.kind])).toEqual([
      ['side', 'opening'],
      ['side', 'opening'],
      ['axis-x', 'opening'],
    ]);
    const [from, to, body] = overlay.handles;
    expect(from?.at.x).toBeCloseTo(1.56);
    expect(to?.at.x).toBeCloseTo(2.44);
    expect(body?.at.y).toBeGreaterThan(0);
    expect(overlay.ghosts.map((ghost) => ghost.shape)).toEqual(['polygon', 'polyline', 'polyline']);
    expect(overlay.labels.map((label) => label.text)).toEqual(['0.80 m']);
  });

  it('commits a slide along the wall with its seq', () => {
    const tool = harness('openings');
    tool.tap({ x: 2, y: 0 }, onWall);
    const id = floorOf(tool.map()).openings[0]?.id ?? '';
    tool.send({ seq: 7, type: 'slide', id, offset: 2.5, width: 1.2 });
    expect(tool.commits).toEqual([
      { seq: 7, ops: [expect.objectContaining({ patch: { offset: 2.5, width: 1.2 } })] },
    ]);
  });
});
