import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  API_ENDPOINTS as E,
  HOME_MAP_WRITE,
  type HomeMap,
  type HomeMapFloor,
  HOME_MAP_OP,
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
const call = vi.hoisted(() => vi.fn());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

const HUB = vi.hoisted(() => '00000000-0000-4000-8000-0000000000a1');
const LAMP = vi.hoisted(() => '00000000-0000-4000-8000-0000000000d1');
const SPEAKER = vi.hoisted(() => '00000000-0000-4000-8000-0000000000d2');
const FAN = vi.hoisted(() => '00000000-0000-4000-8000-0000000000d3');

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('react-native-svg', () => ({ default: stub('Svg'), Path: stub('Path') }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
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
vi.mock('../../../device-visuals', () => ({ deviceIcon: (): string => 'plug' }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({ call }) }));
vi.mock('../tools/openings-panel', () => ({
  centimetres: (value: number): number => Math.round(value * 100),
}));
vi.mock('../../../../store/selectors', async () => {
  const { deviceFixture } = await import('../../../../store/device-fixture');
  const devices = [
    deviceFixture(1, { id: SPEAKER, name: 'Speaker', room_id: HUB }),
    deviceFixture(2, { id: LAMP, name: 'Lamp', room_id: HUB }),
    deviceFixture(3, { id: FAN, name: 'Fan', room_id: null }),
  ];
  return {
    useRooms: (): readonly object[] => [{ id: HUB, name: 'Kitchen', position: 0 }],
    useDevices: (): typeof devices => devices,
  };
});

import { deviceFixture } from '../../../../store/device-fixture';
import type { ItemsContext } from './objects-devices-model';

const { ObjectsDevicesList } = await import('./objects-devices');
const { ObjectItem } = await import('./object-item');
const { PlacedDeviceItem, UnplacedDeviceRow } = await import('./device-item');
const model = await import('./objects-devices-model');

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';

const ROOM = {
  id: 'room-1',
  name: null,
  homeRoomId: HUB,
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
};

const SOFA = {
  id: 'obj-sofa',
  modelId: 'cat.sofa.three_seat',
  finish: null,
  params: { width: 2, depth: 0.9 },
  at: { x: 1, y: 1 },
  rotation: 0,
  elevation: 0,
  label: null,
  locked: false,
  origin: { kind: 'hand' },
};

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
        ROOM,
        {
          ...ROOM,
          id: 'room-2',
          name: 'Study',
          homeRoomId: null,
          polygon: {
            outer: [
              { x: 4, y: 0 },
              { x: 8, y: 0 },
              { x: 8, y: 3 },
              { x: 4, y: 3 },
            ],
            holes: [],
          },
          labelAt: { x: 6, y: 1.5 },
        },
      ],
      walls: [],
      openings: [],
      objects: [SOFA, { ...SOFA, id: 'obj-plant', label: 'Big plant', locked: true }],
      placements: [
        {
          deviceId: LAMP,
          floorId: FLOOR_ID,
          at: { x: 3, y: 2 },
          rotation: 0,
          height: 0,
          tilt: 0,
          mount: 'floor',
          auto: true,
          camera: null,
        },
      ],
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

function all(kind: string, label: string): readonly Props[] {
  return seen
    .filter((item) => item.kind === kind && item.props['label'] === label)
    .map((item) => item.props);
}

function find(kind: string, label: string, key = 'label'): Props {
  const hit = seen.find((item) => item.kind === kind && item.props[key] === label)?.props;
  if (hit === undefined) throw new Error(`no ${kind} ${label}`);
  return hit;
}

function isCallable(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === 'function';
}

function press(props: Props, key: string, ...args: readonly unknown[]): void {
  const handler = props[key];
  if (!isCallable(handler)) throw new Error(`no ${key}`);
  handler(...args);
}

function texts(): readonly unknown[] {
  return seen.filter((item) => item.kind === 'Text').map((item) => item.props.children);
}

interface TestContext extends ItemsContext {
  readonly apply: Mock<(ops: readonly HomeMapOp[]) => void>;
  readonly place: Mock<(ids: readonly string[]) => void>;
}

function context(): TestContext {
  return {
    floor: floor(),
    rooms: floor().rooms.map((room) => ({ room, title: room.name ?? 'Kitchen' })),
    readOnly: false,
    apply: vi.fn(),
    place: vi.fn(),
  };
}

function renderList(send: (ops: readonly HomeMapOp[]) => void, readOnly = false): void {
  seen.length = 0;
  renderToStaticMarkup(
    createElement(ObjectsDevicesList, {
      map: MAP,
      floor: floor(),
      actor: 'profile:me',
      readOnly,
      send,
    }),
  );
}

describe('objects and devices list', () => {
  it('lists furniture by name and splits devices into placed and unplaced', () => {
    renderList(vi.fn());
    const titles = seen
      .filter((item) => item.kind === 'Interactive')
      .map((item) => item.props['label']);
    expect(titles).toStrictEqual([
      'Big plant, Kitchen · 0° · locked',
      'Sofa three seat, Kitchen · 0°',
      'Lamp, Kitchen · Floor · placed automatically',
    ]);
    expect(texts()).toContain('Speaker');
    expect(texts()).toContain(model.NOT_ON_MAP_TEXT);
    const buttons = all('Button', 'Place automatically');
    expect(buttons.map((props) => props['disabled'])).toStrictEqual([true, false]);
  });

  it('places one device through the hub placement endpoint for its map', async () => {
    call.mockResolvedValueOnce({ revision: 2, placed: 1 });
    renderList(vi.fn());
    const speaker = all('Button', 'Place automatically')[1];
    if (speaker === undefined) throw new Error('no button');
    press(speaker, 'onPress');
    await vi.waitFor(() => {
      expect(call).toHaveBeenCalledWith(E.placeHomeMapDevices, {
        query: { mapId: 'home' },
        body: { deviceIds: [SPEAKER] },
      });
    });
  });

  it('places every ready device at once and disables it all while read only', () => {
    call.mockResolvedValueOnce({ revision: 2, placed: 1 });
    renderList(vi.fn());
    press(find('Button', 'Place all automatically'), 'onPress');
    expect(call).toHaveBeenLastCalledWith(E.placeHomeMapDevices, {
      query: { mapId: 'home' },
      body: { deviceIds: [SPEAKER] },
    });
    renderList(vi.fn(), true);
    expect(find('Button', 'Place all automatically')['disabled']).toBe(true);
    expect(all('Button', 'Place automatically').every((props) => props['disabled'] === true)).toBe(
      true,
    );
  });

  it('answers the hub result in plain words', async () => {
    call.mockResolvedValueOnce({ revision: 2, placed: 0 });
    await expect(model.placeAutomatically(MAP, [SPEAKER])).resolves.toBe(model.NOTHING_PLACED_TEXT);
    call.mockRejectedValueOnce(new Error('offline'));
    await expect(model.placeAutomatically(MAP, [SPEAKER])).resolves.toBe(model.PLACE_FAILED_TEXT);
  });
});

describe('object fields', () => {
  function renderObject(id: string): TestContext {
    const ctx = context();
    const object = floor().objects.find((each) => each.id === id);
    if (object === undefined) throw new Error('no object');
    seen.length = 0;
    renderToStaticMarkup(
      createElement(ObjectItem, { context: ctx, object, open: true, onToggle: vi.fn() }),
    );
    return ctx;
  }

  it('writes position, rotation, size and room as object updates', () => {
    const ctx = renderObject('obj-sofa');
    press(find('NumberStepper', 'Rotation'), 'onChange', 370);
    press(find('NumberStepper', 'Position across'), 'onChange', 150);
    press(find('NumberStepper', 'Width'), 'onChange', 2.4);
    press(find('ListRow', 'Kitchen', 'title'), 'onPress');
    press(find('ListRow', 'Study', 'title'), 'onPress');
    const patches = ctx.apply.mock.calls.map(([ops]) => ops[0]);
    expect(patches).toStrictEqual([
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: 'obj-sofa', patch: { rotation: 10 } },
      {
        op: 'update',
        kind: 'object',
        floorId: FLOOR_ID,
        id: 'obj-sofa',
        patch: { at: { x: 1.5, y: 1 } },
      },
      {
        op: 'update',
        kind: 'object',
        floorId: FLOOR_ID,
        id: 'obj-sofa',
        patch: { params: { width: 2.4, depth: 0.9 } },
      },
      {
        op: 'update',
        kind: 'object',
        floorId: FLOOR_ID,
        id: 'obj-sofa',
        patch: { at: { x: 6, y: 1.5 } },
      },
    ]);
  });

  it('keeps a locked object still but lets it be unlocked and duplicated', () => {
    const ctx = renderObject('obj-plant');
    expect(find('NumberStepper', 'Rotation')['disabled']).toBe(true);
    expect(find('Button', 'Delete')['disabled']).toBe(true);
    press(find('Button', 'Unlock'), 'onPress');
    press(find('Button', 'Duplicate'), 'onPress');
    const [unlock, copy] = ctx.apply.mock.calls.map(([ops]) => ops[0]);
    expect(unlock).toStrictEqual({
      op: 'update',
      kind: 'object',
      floorId: FLOOR_ID,
      id: 'obj-plant',
      patch: { locked: false },
    });
    expect(copy).toMatchObject({
      op: 'add',
      kind: 'object',
      element: { locked: false, at: { x: 1.3, y: 1.3 }, label: 'Big plant' },
    });
  });

  it('draws the footprint turned with the object', () => {
    const ring = model.footprintRing({ params: { width: 2, depth: 1 }, rotation: 90 });
    expect(
      ring.map((point) => [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10]),
    ).toStrictEqual([
      [0.5, -1],
      [0.5, 1],
      [-0.5, 1],
      [-0.5, -1],
    ]);
  });
});

describe('device fields', () => {
  function renderLamp(): TestContext {
    const ctx = context();
    const placement = floor().placements[0];
    if (placement === undefined) throw new Error('no placement');
    seen.length = 0;
    renderToStaticMarkup(
      createElement(PlacedDeviceItem, {
        context: ctx,
        entry: { device: deviceFixture(2, { id: LAMP, name: 'Lamp', room_id: HUB }), placement },
        open: true,
        onToggle: vi.fn(),
      }),
    );
    return ctx;
  }

  it('marks every list edit of a device as placed by hand', () => {
    const ctx = renderLamp();
    press(find('NumberStepper', 'Height'), 'onChange', 120);
    press(find('NumberStepper', 'Tilt'), 'onChange', -15);
    const patches = ctx.apply.mock.calls.map(([ops]) => ops[0]);
    expect(patches).toStrictEqual([
      {
        op: 'update',
        kind: 'placement',
        floorId: FLOOR_ID,
        id: LAMP,
        patch: { height: 1.2, auto: false },
      },
      {
        op: 'update',
        kind: 'placement',
        floorId: FLOOR_ID,
        id: LAMP,
        patch: { tilt: -15, auto: false },
      },
    ]);
    press(find('Button', 'Take it off the map'), 'onPress');
    expect(ctx.apply.mock.lastCall?.[0]).toStrictEqual([
      { op: 'remove', kind: 'placement', floorId: FLOOR_ID, id: LAMP },
    ]);
  });

  it.each([
    ['floor', 0],
    ['table', 0.75],
    ['wall', 1.5],
    ['ceiling', 2.6],
  ] as const)(
    'switches a ceiling-height device to %s with the same mount rules',
    (mount, height) => {
      const ctx = context();
      const placement = floor().placements[0];
      if (placement === undefined) throw new Error('no placement');
      seen.length = 0;
      renderToStaticMarkup(
        createElement(PlacedDeviceItem, {
          context: ctx,
          entry: {
            device: deviceFixture(2, { id: LAMP }),
            placement: { ...placement, mount: mount === 'wall' ? 'table' : 'wall', height: 2.2 },
          },
          open: true,
          onToggle: vi.fn(),
        }),
      );
      press(find('Segmented', 'Mount'), 'onChange', mount);
      expect(ctx.apply.mock.calls[0]?.[0]?.[1]).toMatchObject({
        element: { mount, height, auto: false },
      });
    },
  );

  it('places a device whose room is not linked by choosing a map room by hand', () => {
    const ctx = context();
    seen.length = 0;
    renderToStaticMarkup(
      createElement(UnplacedDeviceRow, {
        context: ctx,
        entry: { device: deviceFixture(3, { id: FAN, name: 'Fan', room_id: null }), onMap: false },
      }),
    );
    expect(find('Button', 'Place automatically')['disabled']).toBe(true);
    const study = find('ListRow', 'Study', 'title');
    expect(study['disabled']).toBe(false);
    press(study, 'onPress');
    const ops = ctx.apply.mock.lastCall?.[0] ?? [];
    expect(ops).toStrictEqual([
      {
        op: 'add',
        kind: 'placement',
        floorId: FLOOR_ID,
        element: {
          deviceId: FAN,
          floorId: FLOOR_ID,
          at: { x: 6, y: 1.5 },
          rotation: 0,
          height: 0,
          tilt: 0,
          mount: 'floor',
          auto: false,
          camera: null,
        },
      },
    ]);
    expect(ops.every((op) => HOME_MAP_OP.safeParse(op).success)).toBe(true);
  });

  it('sends only edits the domain accepts', () => {
    const send = vi.fn((_ops: readonly HomeMapOp[]) => undefined);
    renderList(send);
    expect(send).not.toHaveBeenCalled();
  });
});
