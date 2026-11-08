import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP_ROOM_WRITE, type HomeMapRoom } from '@smarteverything/domain';
import { EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import type { RoomsDraw } from './rooms-draw';
import { IDLE_DRAW, chooseShape, type DrawStep, type RoomsDrawState } from './rooms-draw-model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

const tick = vi.hoisted(() => vi.fn());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: tick }));

const {
  DRAW_HINTS,
  RoomsDrawPanel,
  drawBounds,
  roomsDrawEdit,
  roomsDrawNotice,
  roomsDraftOpen,
  roomsDrawOverlay,
  roomsDrawing,
} = await import('./rooms-draw');

const kitchen: HomeMapRoom = HOME_MAP_ROOM_WRITE.parse({
  id: 'kitchen',
  name: null,
  homeRoomId: null,
  polygon: {
    outer: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ],
    holes: [],
  },
  labelAt: { x: 2, y: 2 },
  colourSlot: 1,
  floorMaterial: { kind: 'plain', variant: null, tint: null },
  wallPaint: null,
  ceilingHeight: null,
  origin: { kind: 'hand' },
});

const floor: RenderFloor = {
  id: 'floor-1',
  name: 'Ground',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.5,
  bounds: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  carpets: [],
  markers: [],
  measures: [],
  vacuum: null,
};

interface Held {
  current: RoomsDrawState;
  readonly steps: DrawStep[];
}

function drawOf(
  state: RoomsDrawState,
  options: { readonly rooms?: readonly HomeMapRoom[]; readonly selected?: string | null } = {},
): RoomsDraw & { readonly held: Held } {
  const held: Held = { current: state, steps: [] };
  return {
    held,
    state,
    floor: { id: 'floor-1', rooms: options.rooms ?? [kitchen], walls: [] },
    gridM: 0.1,
    selected: options.selected ?? null,
    readOnly: false,
    apply: (run): void => {
      const step = run(held.current);
      held.current = step.state;
      held.steps.push(step);
    },
  };
}

function polygon(count: number): RoomsDrawState {
  const points = [
    { x: 5, y: 5 },
    { x: 8, y: 5 },
    { x: 8, y: 8 },
  ].slice(0, count);
  return { shape: 'points', draft: { kind: 'polygon', points }, guides: [] };
}

function render(node: ReactNode): void {
  seen.length = 0;
  renderToStaticMarkup(createElement(() => node));
}

function button(label: string): Props {
  const found = seen.find((item) => item.kind === 'Button' && item.props['label'] === label);
  if (found === undefined) throw new Error(`no button ${label}`);
  return found.props;
}

function press(props: Props, key = 'onPress', ...args: unknown[]): void {
  const handler = props[key];
  if (typeof handler !== 'function') throw new Error(`no ${key}`);
  Reflect.apply(handler, undefined, args);
}

function texts(): readonly unknown[] {
  return seen.filter((item) => item.kind === 'Text').map((item) => item.props.children);
}

beforeEach(() => {
  tick.mockClear();
});

describe('RoomsDrawPanel', () => {
  it('keeps Finish room disabled until the shape has three corners', () => {
    render(createElement(RoomsDrawPanel, { draw: drawOf(polygon(2)) }));
    expect(button('Finish room')['disabled']).toBe(true);
    render(createElement(RoomsDrawPanel, { draw: drawOf(polygon(3)) }));
    expect(button('Finish room')['disabled']).toBe(false);
  });

  it('finishes the polygon into one add room op', () => {
    const draw = drawOf(polygon(3));
    render(createElement(RoomsDrawPanel, { draw }));
    press(button('Finish room'));
    expect(draw.held.steps[0]?.ops).toMatchObject([
      { op: 'add', kind: 'room', floorId: 'floor-1' },
    ]);
  });

  it('undoes the last corner with the tonal button', () => {
    const draw = drawOf(polygon(3));
    render(createElement(RoomsDrawPanel, { draw }));
    expect(button('Undo corner')['variant']).toBe('tonal');
    press(button('Undo corner'));
    expect(draw.held.current).toEqual(polygon(2));
  });

  it('switches between Rectangle and Any shape while nothing is drawn', () => {
    const draw = drawOf(IDLE_DRAW);
    render(createElement(RoomsDrawPanel, { draw }));
    const segmented = seen.find((item) => item.kind === 'Segmented');
    expect(segmented?.props['disabled']).toBe(false);
    press(segmented?.props ?? {}, 'onChange', 'points');
    expect(draw.held.current).toEqual(chooseShape('points'));
  });

  it('invites the first room on an empty floor', () => {
    render(createElement(RoomsDrawPanel, { draw: drawOf(IDLE_DRAW, { rooms: [] }) }));
    expect(texts()).toContain('Draw your first room');
  });

  it('shows the area of the selected room', () => {
    render(createElement(RoomsDrawPanel, { draw: drawOf(IDLE_DRAW, { selected: 'kitchen' }) }));
    expect(texts()).toContain('16.0 m²');
  });
});

describe('rooms draw in the scene', () => {
  it('draws with taps in metres and frames the floor on phones', () => {
    const overlay = EDIT_OVERLAY.parse(
      roomsDrawOverlay(drawOf(polygon(3)), { floor, framed: true }),
    );
    expect(overlay.mode).toBe('draw-points');
    expect(overlay.handles).toHaveLength(3);
    expect(overlay.frame).toEqual({
      key: 'rooms-draw:floor-1',
      bounds: drawBounds(floor.bounds),
      top: false,
    });
    expect(roomsDrawOverlay(drawOf(IDLE_DRAW), { floor, framed: false }).frame).toBeNull();
  });

  it('shows the example room only on an empty floor', () => {
    const empty = roomsDrawOverlay(drawOf(IDLE_DRAW, { rooms: [] }), { floor, framed: false });
    expect(empty.labels.map((label) => label.text)).toEqual(['Tap here', '5.00 × 4.00 m']);
    expect(roomsDrawOverlay(drawOf(IDLE_DRAW), { floor, framed: false }).labels).toEqual([]);
  });

  it('turns a tap into a corner and a second tap into a room', () => {
    const draw = drawOf(IDLE_DRAW, { rooms: [] });
    const tap = { seq: 1, type: 'tap', floorId: 'floor-1', hit: { kind: 'none' } } as const;
    roomsDrawEdit(draw, { ...tap, point: { x: 1, y: 1 }, metresPerPx: 0.02 });
    expect(draw.held.current.draft).toEqual({ kind: 'rect', from: { x: 1, y: 1 } });
    roomsDrawEdit(draw, { ...tap, point: { x: 3, y: 2 }, metresPerPx: 0.02 });
    expect(draw.held.steps[1]?.ops).toMatchObject([{ op: 'add', kind: 'room' }]);
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('selects the room under a tap instead of drawing', () => {
    const draw = drawOf(IDLE_DRAW);
    roomsDrawEdit(draw, {
      seq: 1,
      type: 'tap',
      floorId: 'floor-1',
      hit: { kind: 'room', id: 'kitchen' },
      point: { x: 2, y: 2 },
      metresPerPx: 0.02,
    });
    expect(draw.held.steps[0]).toMatchObject({ ops: [], select: 'kitchen' });
  });

  it('moves a draft corner from its handle', () => {
    const draw = drawOf(polygon(3));
    const handle = roomsDrawOverlay(draw, { floor, framed: false }).handles[1];
    roomsDrawEdit(draw, {
      seq: 2,
      type: 'vertex',
      handleId: handle?.id ?? '',
      point: { x: 9, y: 5 },
    });
    const draft = draw.held.current.draft;
    expect(draft.kind === 'polygon' ? draft.points[1] : null).toEqual({ x: 9, y: 5 });
  });

  it('ticks when the scene engages a snap', () => {
    roomsDrawEdit(drawOf(IDLE_DRAW), { seq: 3, type: 'snap', engaged: true });
    expect(tick).toHaveBeenCalledOnce();
  });

  it('names the next tap in the notice and keeps the draft open', () => {
    expect(roomsDrawNotice(drawOf(IDLE_DRAW))?.text).toBe(DRAW_HINTS.rect);
    expect(roomsDrawNotice(drawOf(polygon(3)))?.text).toBe(DRAW_HINTS.pointsClose);
    expect(roomsDrawing(drawOf(IDLE_DRAW))).toBe(false);
    expect(roomsDrawing(drawOf(polygon(1)))).toBe(true);
  });

  it('keeps the header Done tonal until the first room exists', () => {
    expect(roomsDraftOpen(drawOf(IDLE_DRAW, { rooms: [] }))).toBe(true);
    expect(roomsDraftOpen(drawOf(IDLE_DRAW))).toBe(false);
    expect(roomsDraftOpen(drawOf(polygon(2)))).toBe(true);
  });

  it('gives an empty floor a drawing sheet and pads a drawn one', () => {
    expect(drawBounds(null)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 8 });
    expect(drawBounds({ minX: 0, minY: 0, maxX: 4, maxY: 3 })).toEqual({
      minX: -1,
      minY: -1,
      maxX: 5,
      maxY: 4,
    });
  });
});
