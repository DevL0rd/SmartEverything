import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  HOME_MAP_WRITE,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOp,
} from '@smarteverything/domain';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('react-native-svg', () => ({ default: stub('Svg'), Path: stub('Path') }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../../components/number-stepper', () => ({ NumberStepper: stub('NumberStepper') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../components/text-field', () => ({ TextField: stub('TextField') }));
vi.mock('../../../../components/disclosure', () => ({
  CollapseRoot: stub('CollapseRoot'),
  CollapseBody: stub('CollapseBody'),
  TurnChevron: stub('TurnChevron'),
}));
vi.mock('../../../../design/colour', () => ({ useColour: (): string => '#336699' }));
vi.mock('../../../../store/selectors', () => ({
  useRooms: (): readonly object[] => [{ id: HUB, name: 'Kitchen', position: 0 }],
  useDevices: (): readonly object[] => [],
}));
vi.mock('../tools/openings-panel', () => ({
  centimetres: (value: number): number => Math.round(value * 100),
  OPENING_KINDS: [
    { value: 'door', label: 'Door', icon: 'door' },
    { value: 'window', label: 'Window', icon: 'square' },
  ],
  OpeningsPanel: stub('OpeningsPanel'),
}));

const HUB = vi.hoisted(() => '00000000-0000-4000-8000-0000000000a1');

import type { ListEditContext } from './rooms-walls-model';

const { RoomsWallsList } = await import('./rooms-walls');
const { RoomItem } = await import('./room-item');
const { WallItem } = await import('./wall-item');
const { RoomSplitMerge, SplitFields } = await import('./room-split-merge');

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';

const MAP: HomeMap = HOME_MAP_WRITE.parse({
  schemaVersion: 1,
  id: 'home',
  name: 'Test house',
  revision: 1,
  updatedAt: '2026-10-25T00:00:00.000Z',
  north: 0,
  floors: [
    {
      id: FLOOR_ID,
      name: 'Ground',
      level: 0,
      elevation: 0,
      rooms: [
        {
          id: 'room-1',
          name: 'Hall',
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
        },
      ],
      walls: [
        {
          id: 'wall-1',
          from: { x: 0, y: 0 },
          to: { x: 4, y: 0 },
          thickness: 0.1,
          height: null,
          kind: 'solid',
          origin: { kind: 'hand' },
        },
      ],
      openings: [
        {
          id: 'door-1',
          wallId: 'wall-1',
          offset: 1,
          width: 0.8,
          kind: 'door',
          sillHeight: 0,
          headHeight: 2,
          hinge: 'left',
          swing: 'in',
          contactDeviceId: null,
          lockDeviceId: null,
          origin: { kind: 'hand' },
        },
      ],
      objects: [],
      placements: [],
      annotations: [],
    },
  ],
  sources: [],
  notices: [],
});

function floor(): HomeMapFloor {
  const first = MAP.floors[0];
  if (first === undefined) throw new Error('fixture has no floor');
  return first;
}

function find(kind: string, label: string, key = 'label'): Props {
  const hit = seen.find((item) => item.kind === kind && item.props[key] === label);
  if (hit === undefined) throw new Error(`no ${kind} ${label}`);
  return hit.props;
}

function isCallable(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === 'function';
}

function call(props: Props, key: string, ...args: readonly unknown[]): void {
  const handler = props[key];
  if (!isCallable(handler)) throw new Error(`no ${key}`);
  handler(...args);
}

interface TestContext extends ListEditContext {
  readonly apply: Mock<(ops: readonly HomeMapOp[]) => void>;
}

function context(): TestContext {
  return { floor: floor(), readOnly: false, apply: vi.fn(), notify: vi.fn() };
}

describe('rooms and walls list', () => {
  it('lists every room and wall with an add action that sends checked ops', () => {
    seen.length = 0;
    const send = vi.fn((_ops: readonly HomeMapOp[]) => undefined);
    renderToStaticMarkup(
      createElement(RoomsWallsList, {
        map: MAP,
        floor: floor(),
        actor: 'profile:tester',
        readOnly: false,
        send,
      }),
    );
    expect(seen.filter((item) => item.kind === 'Interactive')).toHaveLength(2);
    call(find('Button', 'Add room'), 'onPress');
    call(find('Button', 'Add wall'), 'onPress');
    expect(send.mock.calls.map(([ops]) => ops[0]?.op)).toEqual(['add', 'add']);
  });

  it('disables every add action while editing is paused', () => {
    seen.length = 0;
    renderToStaticMarkup(
      createElement(RoomsWallsList, {
        map: MAP,
        floor: floor(),
        actor: 'profile:tester',
        readOnly: true,
        send: vi.fn(),
      }),
    );
    expect(find('Button', 'Add room')['disabled']).toBe(true);
    expect(find('Button', 'Add wall')['disabled']).toBe(true);
  });

  it('shows width and length fields, the name and the hub room picker for a rectangle', () => {
    seen.length = 0;
    const ctx = context();
    const room = floor().rooms[0];
    if (room === undefined) throw new Error('no room');
    renderToStaticMarkup(
      createElement(RoomItem, {
        context: ctx,
        room,
        title: 'Hall',
        hubRooms: [{ id: HUB, name: 'Kitchen' }],
        open: true,
        onToggle: vi.fn(),
      }),
    );
    expect(find('NumberStepper', 'Width')['value']).toBe(400);
    call(find('NumberStepper', 'Length'), 'onChange', 250);
    call(find('ListRow', 'Kitchen', 'title'), 'onPress');
    expect(ctx.apply.mock.calls.map(([ops]) => ops[0]?.op)).toEqual(['update', 'update']);
    expect(find('TextField', 'Room name')['value']).toBe('Hall');
  });

  it('edits a wall and lists its openings with the opening inspector', () => {
    seen.length = 0;
    const ctx = context();
    const wall = floor().walls[0];
    if (wall === undefined) throw new Error('no wall');
    const onOpening = vi.fn();
    renderToStaticMarkup(
      createElement(WallItem, {
        context: ctx,
        wall,
        title: 'Wall 1',
        open: true,
        onToggle: vi.fn(),
        openings: { openingId: 'door-1', onOpening },
      }),
    );
    call(find('NumberStepper', 'Thickness'), 'onChange', 20);
    call(find('Button', 'Add a window'), 'onPress');
    expect(ctx.apply.mock.calls.map(([ops]) => ops[0])).toMatchObject([
      { op: 'update', kind: 'wall', patch: { thickness: 0.2 } },
      { op: 'add', kind: 'opening' },
    ]);
    expect(seen.some((item) => item.kind === 'OpeningsPanel')).toBe(true);
    call(find('Button', 'Delete this wall and its openings'), 'onPress');
    expect(ctx.apply.mock.calls[2]?.[0].map((op) => op.op)).toEqual(['remove', 'remove']);
  });
});

describe('room split and merge in the list', () => {
  const hall = floor().rooms[0];
  if (hall === undefined) throw new Error('no room');
  const side = {
    ...hall,
    id: 'room-2',
    name: 'Study',
    polygon: {
      outer: [
        { x: 4, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 3 },
        { x: 4, y: 3 },
      ],
      holes: [],
    },
  };
  const holed = {
    ...hall,
    id: 'room-3',
    polygon: {
      outer: [
        { x: 10, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 4 },
        { x: 10, y: 4 },
      ],
      holes: [
        [
          { x: 11, y: 1 },
          { x: 12, y: 1 },
          { x: 12, y: 2 },
          { x: 11, y: 2 },
        ],
      ],
    },
  };
  const parsed = HOME_MAP_WRITE.parse({
    ...MAP,
    floors: [{ ...floor(), rooms: [hall, side, holed] }],
  }).floors[0];
  if (parsed === undefined) throw new Error('no floor');
  const holedRoom = parsed.rooms[2];
  if (holedRoom === undefined) throw new Error('no holed room');
  const two = (): TestContext => ({ ...context(), floor: parsed });

  it('lists the touching room under Merge with and merges it', () => {
    seen.length = 0;
    const ctx = two();
    renderToStaticMarkup(createElement(RoomSplitMerge, { context: ctx, room: hall, hubRooms: [] }));
    expect(
      seen.filter((item) => item.kind === 'ListRow').map((item) => item.props['title']),
    ).toEqual(['Study']);
    call(find('ListRow', 'Study', 'title'), 'onPress');
    expect(ctx.apply.mock.calls[0]?.[0]).toMatchObject([
      { op: 'remove', kind: 'room', id: 'room-2' },
      { op: 'update', kind: 'room', id: 'room-1' },
    ]);
    expect(find('Button', 'Split this room')['disabled']).toBe(false);
  });

  it('splits along the cut line and shows the refusal for a room with an opening', () => {
    seen.length = 0;
    const ctx = two();
    const onDone = vi.fn();
    renderToStaticMarkup(createElement(SplitFields, { context: ctx, room: hall, onDone }));
    expect(find('NumberStepper', 'Cut start across')['value']).toBe(200);
    call(find('Button', 'Split along this line'), 'onPress');
    expect(ctx.apply.mock.calls[0]?.[0].map((op) => op.op)).toEqual(['update', 'add']);
    expect(onDone).toHaveBeenCalledTimes(1);
    seen.length = 0;
    renderToStaticMarkup(createElement(SplitFields, { context: ctx, room: holedRoom, onDone }));
    call(find('Button', 'Split along this line'), 'onPress');
    expect(ctx.notify).toHaveBeenCalledWith(
      'This room has an opening inside it, so it cannot be split or merged here.',
    );
    expect(ctx.apply).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
