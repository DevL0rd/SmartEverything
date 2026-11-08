import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP_ROOM_WRITE, type HomeMapRoom } from '@smarteverything/domain';
import type { RoomsDraw } from '../tools/rooms-draw';
import { IDLE_DRAW, type DrawStep, type RoomsDrawState } from '../tools/rooms-draw-model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));

const { RoomsNudge, nudgeOp, nudgeVector, nudgeTitle } = await import('./nudge');

const kitchen: HomeMapRoom = HOME_MAP_ROOM_WRITE.parse({
  id: 'kitchen',
  name: 'Kitchen',
  homeRoomId: null,
  polygon: {
    outer: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ],
    holes: [],
  },
  labelAt: { x: 2, y: 1.5 },
  colourSlot: 1,
  floorMaterial: { kind: 'plain', variant: null, tint: null },
  wallPaint: null,
  ceilingHeight: null,
  origin: { kind: 'hand' },
});

const apply = vi.fn((_run: (state: RoomsDrawState) => DrawStep) => undefined);

function drawOf(selected: string | null, readOnly = false): RoomsDraw {
  return {
    state: IDLE_DRAW,
    floor: { id: 'floor-1', rooms: [kitchen], walls: [] },
    gridM: 0.1,
    selected,
    readOnly,
    apply,
  };
}

function render(node: ReactNode): void {
  seen.length = 0;
  renderToStaticMarkup(createElement(() => node));
}

beforeEach(() => {
  apply.mockClear();
});

describe('nudge', () => {
  it('moves a whole room by one centimetre steps without float noise', () => {
    const by = nudgeVector('up', 'cm1');
    expect(by).toEqual({ x: 0, y: 0.01 });
    const op = nudgeOp('floor-1', { kind: 'room', room: kitchen }, nudgeVector('right', 'cm10'));
    expect(op).toMatchObject({
      op: 'update',
      kind: 'room',
      id: 'kitchen',
      patch: {
        polygon: {
          outer: [
            { x: 0.1, y: 0 },
            { x: 4.1, y: 0 },
            { x: 4.1, y: 3 },
            { x: 0.1, y: 3 },
          ],
        },
      },
    });
  });

  it('moves one corner and refuses a nudge that breaks the shape', () => {
    const op = nudgeOp('floor-1', { kind: 'corner', room: kitchen, index: 2 }, { x: 0.01, y: 0 });
    expect(op).toMatchObject({ patch: { polygon: { outer: [{}, {}, { x: 4.01, y: 3 }, {}] } } });
    const flat = HOME_MAP_ROOM_WRITE.parse({
      ...kitchen,
      polygon: {
        outer: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 0.1 },
        ],
        holes: [],
      },
    });
    expect(
      nudgeOp('floor-1', { kind: 'corner', room: flat, index: 2 }, { x: 0, y: -0.1 }),
    ).toBeNull();
    expect(nudgeTitle(null)).toBe('Select a room to nudge it');
  });

  it('shifts the holes with a whole-room nudge and keeps them for a corner nudge', () => {
    const hole = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    const holed = HOME_MAP_ROOM_WRITE.parse({
      ...kitchen,
      polygon: { outer: kitchen.polygon.outer, holes: [hole] },
    });
    const moved = nudgeOp('floor-1', { kind: 'room', room: holed }, nudgeVector('down', 'cm10'));
    expect(moved).toMatchObject({
      patch: {
        polygon: {
          holes: [
            [
              { x: 1, y: 0.9 },
              { x: 2, y: 0.9 },
              { x: 2, y: 1.9 },
            ],
          ],
        },
      },
    });
    const corner = nudgeOp('floor-1', { kind: 'corner', room: holed, index: 2 }, { x: 0.01, y: 0 });
    expect(corner).toMatchObject({ patch: { polygon: { holes: [hole] } } });
  });

  it('sends the nudge of the selected room through the draw apply', () => {
    render(createElement(RoomsNudge, { draw: drawOf('kitchen') }));
    const arrows = seen.filter((item) => item.kind === 'IconButton');
    expect(arrows.map((item) => item.props['label'])).toEqual([
      'Nudge left by 10 cm',
      'Nudge up by 10 cm',
      'Nudge down by 10 cm',
      'Nudge right by 10 cm',
    ]);
    const onPress = arrows[1]?.props['onPress'];
    if (typeof onPress !== 'function') throw new Error('not pressable');
    Reflect.apply(onPress, undefined, []);
    const step = apply.mock.calls[0]?.[0](IDLE_DRAW);
    expect(step?.ops).toMatchObject([{ op: 'update', id: 'kitchen' }]);
  });

  it('disables the arrows while offline or with nothing selected', () => {
    render(createElement(RoomsNudge, { draw: drawOf('kitchen', true) }));
    expect(
      seen
        .filter((item) => item.kind === 'IconButton')
        .every((item) => item.props['disabled'] === true),
    ).toBe(true);
    render(createElement(RoomsNudge, { draw: drawOf(null) }));
    expect(
      seen
        .filter((item) => item.kind === 'IconButton')
        .every((item) => item.props['disabled'] === true),
    ).toBe(true);
  });
});
