import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  HOME_MAP_FLOOR_ID,
  HOME_MAP_WRITE,
  type HomeMap,
  type HomeMapOp,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import type { HomeMapSaveStatus } from '../../data/edits';
import { deviceFixture } from '../../../../store/device-fixture';
import type { DevicesTool } from './devices';
import type { RoomMove } from './devices-model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());
const hub = vi.hoisted(() => ({
  updateDevice: vi.fn(),
  call: vi.fn(),
  presence: vi.fn(),
  models: vi.fn(),
}));

const store = vi.hoisted(() => ({
  devices: new Array<unknown>(),
  rooms: new Array<unknown>(),
}));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../../../../api/devices', () => ({ updateDevice: hub.updateDevice }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({ call: hub.call }) }));
vi.mock('../../../../queries/use-screen-query', () => ({
  useScreenQuery: hub.models,
}));
vi.mock('../../../../plugins/shelly-presence/presence-data', () => ({
  isPhysicalPresence: hub.presence,
  usePresence: (): object => ({ state: 'loading' }),
}));
vi.mock('../../../../plugins/shelly-presence/use-presence-operation', () => ({
  usePresenceOperation: (): object => ({ busy: false }),
}));
for (const [path, name] of [
  ['badge', 'Badge'],
  ['banner', 'Banner'],
  ['button', 'Button'],
  ['error-state', 'ErrorState'],
  ['icon-button', 'IconButton'],
  ['interactive', 'Interactive'],
  ['number-stepper', 'NumberStepper'],
  ['search-field', 'SearchField'],
  ['segmented', 'Segmented'],
  ['skeleton', 'Skeleton'],
  ['switch', 'Switch'],
  ['text', 'Text'],
] as const) {
  vi.doMock(`../../../../components/${path}`, () => ({ [name]: stub(name) }));
}
vi.mock('../../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../../store/selectors', () => ({
  useDeviceValue: (): null => null,
  useDevices: (): readonly unknown[] => store.devices,
  useRooms: (): readonly unknown[] => store.rooms,
}));
vi.mock('../../../../design/colour', () => ({
  useColourResolver: (): (() => string) => () => '#000',
  withAlpha: (): string => '#000',
}));
vi.mock('react-native-svg', () => ({
  default: stub('Svg'),
  Circle: stub('Circle'),
  Line: stub('Line'),
  Path: stub('Path'),
}));
vi.mock('../list-editor/device-item', () => ({ DeviceThumb: stub('DeviceThumb') }));
vi.mock('../list-editor/list-parts', () => ({ CmField: stub('CmField') }));
vi.mock('./devices', () => ({ DeviceWallSection: stub('DeviceWallSection') }));
vi.mock('../list-editor/object-item', () => ({
  DegreeField: stub('DegreeField'),
  TURN_RANGE: [0, 359],
}));

const model = await import('./devices-model');
const { DevicesPanel } = await import('./device-tray');
const { useDeviceRoomFlow } = await import('./device-room-flow');

const FLOOR = HOME_MAP_FLOOR_ID.parse('00000000-0000-4000-8000-0000000000f1');
const LAMP = '00000000-0000-4000-8000-0000000000a1';
const FAN = '00000000-0000-4000-8000-0000000000a2';
const ZONE = '00000000-0000-4000-8000-0000000000a3';
const SPEAKER = '00000000-0000-4000-8000-0000000000a4';
const HALL = '00000000-0000-4000-8000-0000000000b1';
const KITCHEN = '00000000-0000-4000-8000-0000000000b2';

function room(id: string, homeRoomId: string | null, left: number): object {
  const outer = [
    { x: left, y: 0 },
    { x: left + 4, y: 0 },
    { x: left + 4, y: 3 },
    { x: left, y: 3 },
  ];
  return {
    ...{ id, name: null, homeRoomId, polygon: { outer, holes: [] } },
    ...{ labelAt: { x: left + 2, y: 1.5 }, colourSlot: 1, wallPaint: null, ceilingHeight: null },
    ...{ floorMaterial: { kind: 'plain', variant: null, tint: null }, origin: { kind: 'hand' } },
  };
}

const LAMP_AT: HomeMapPlacement = {
  deviceId: LAMP,
  floorId: FLOOR,
  at: { x: 1, y: 1 },
  rotation: 0,
  height: 0,
  tilt: 0,
  mount: 'floor',
  auto: true,
  camera: null,
};

const MAP: HomeMap = HOME_MAP_WRITE.parse({
  ...{ schemaVersion: 1, id: 'home', name: 'Test house', revision: 1, north: 0 },
  updatedAt: '2026-10-25T00:00:00.000Z',
  floors: [
    {
      ...{ id: FLOOR, name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6 },
      rooms: [room('map-hall', HALL, 0), room('map-kitchen', KITCHEN, 4), room('map-x', null, 8)],
      ...{ walls: [], openings: [], objects: [], placements: [LAMP_AT], annotations: [] },
    },
  ],
  sources: [],
  notices: [],
});

const FLOOR_MAP = MAP.floors[0];
const ROOMS = [
  { id: HALL, name: 'Hall', position: 0 },
  { id: KITCHEN, name: 'Kitchen', position: 1 },
];
const lamp = deviceFixture(1, { id: LAMP, name: 'Lamp', room_id: HALL });
const fan = deviceFixture(2, { id: FAN, name: 'Fan', room_id: null });
const zone = deviceFixture(3, { id: ZONE, name: 'Zone', room_id: HALL, parent_id: LAMP });

function editing(kind: 'saved' | 'not_saved' = 'saved'): {
  readonly edit: Mock<(ops: readonly HomeMapOp[]) => Promise<HomeMapSaveStatus>>;
} {
  const status: HomeMapSaveStatus = { kind };
  return { edit: vi.fn((_ops: readonly HomeMapOp[]) => Promise.resolve(status)) };
}

beforeEach(() => {
  hub.updateDevice.mockReset().mockResolvedValue(undefined);
  hub.call.mockReset().mockResolvedValue({ placed: 1 });
  hub.presence.mockReset().mockReturnValue(false);
  hub.models.mockReset().mockReturnValue({ isError: false, error: null, data: undefined });
  seen.length = 0;
});

describe('dropping a device', () => {
  if (FLOOR_MAP === undefined) throw new Error('fixture');

  it('places a tray device by hand where it was dropped', () => {
    const next = model.droppedPlacement(FLOOR_MAP, FAN, null, { x: 9, y: 1 });
    expect(next).toMatchObject({ deviceId: FAN, at: { x: 9, y: 1 }, mount: 'floor', auto: false });
    expect(model.placementOps(null, next)).toHaveLength(1);
  });

  it('asks before a drop into another linked room changes the room', () => {
    const move = model.roomMoveOf(FLOOR_MAP, lamp, { x: 5, y: 1 }, ROOMS);
    expect(move).toMatchObject({
      from: HALL,
      fromName: 'Hall',
      to: KITCHEN,
      toName: 'Kitchen',
    });
    expect(model.roomMoveOf(FLOOR_MAP, lamp, { x: 2, y: 2 }, ROOMS)).toBeNull();
    expect(model.roomMoveOf(FLOOR_MAP, lamp, { x: 9, y: 1 }, ROOMS)).toBeNull();
  });

  it('finds the chosen home room from a map room or a device', () => {
    expect(model.chosenHomeRoom(FLOOR_MAP, [lamp], 'map-kitchen')).toBe(KITCHEN);
    expect(model.chosenHomeRoom(FLOOR_MAP, [lamp], LAMP)).toBe(HALL);
    expect(model.chosenHomeRoom(FLOOR_MAP, [lamp], 'map-x')).toBeNull();
  });
});

function moveOf(fresh: boolean): RoomMove {
  if (FLOOR_MAP === undefined) throw new Error('fixture');
  const base = fresh ? null : LAMP_AT;
  const next = model.droppedPlacement(FLOOR_MAP, LAMP, base, { x: 5, y: 1 });
  return {
    ...{ deviceId: LAMP, name: 'Lamp', from: HALL, fromName: 'Hall', to: KITCHEN },
    ...{ toName: 'Kitchen', ops: model.placementOps(base, next), at: next.at, fresh },
    undo: model.placementOps(next, base),
  };
}

describe('the room change', () => {
  it('Move saves the spot, then changes the room, and Undo reverses both', async () => {
    const edits = editing();
    const move = moveOf(false);
    expect(await model.moveRoom(edits, move)).toStrictEqual({ ...model.CALM, moved: move });
    expect(hub.updateDevice).toHaveBeenLastCalledWith(LAMP, { room_id: KITCHEN });
    expect(await model.undoRoom(edits, move)).toStrictEqual(model.CALM);
    expect(hub.updateDevice).toHaveBeenLastCalledWith(LAMP, { room_id: HALL });
    const ops: readonly (readonly HomeMapOp[])[] = edits.edit.mock.calls.map(([sent]) => sent);
    expect(ops).toStrictEqual([move.ops, move.undo]);
  });

  it('puts the spot back when the room change fails, so map and rooms agree', async () => {
    hub.updateDevice.mockRejectedValueOnce(new Error('offline'));
    const edits = editing();
    const move = moveOf(false);
    expect(await model.moveRoom(edits, move)).toStrictEqual(model.noted(model.MOVE_FAILED_TEXT));
    expect(edits.edit).toHaveBeenLastCalledWith(move.undo);
  });

  it('never changes the room when the map did not save', async () => {
    const result = await model.moveRoom(editing('not_saved'), moveOf(false));
    expect(result.note).toBe(model.NOT_SAVED_TEXT);
    expect(hub.updateDevice).not.toHaveBeenCalled();
  });

  it('Keep places a tray device in its own room and leaves a placed one alone', async () => {
    expect(await model.keepRoom(MAP, moveOf(false))).toStrictEqual(model.CALM);
    expect(hub.call).not.toHaveBeenCalled();
    expect(await model.keepRoom(MAP, moveOf(true))).toStrictEqual(model.CALM);
    expect(hub.call).toHaveBeenCalledTimes(1);
  });
});

function tool(change: Partial<DevicesTool>): DevicesTool {
  const nothing = vi.fn();
  return {
    ...{ map: MAP, floor: FLOOR_MAP ?? null, devices: [lamp, fan, zone], rooms: ROOMS },
    ...{ readOnly: false, selected: null, armed: null, ...model.CALM },
    ...{ select: nothing, arm: nothing, onEdit: nothing, apply: nothing, moveTo: nothing },
    ...{ confirmMove: nothing, keep: nothing, undoMove: nothing, dismiss: nothing },
    placeAll: nothing,
    ...change,
  };
}

function isAction(value: unknown): value is () => void {
  return typeof value === 'function';
}

function labels(kind: string): readonly unknown[] {
  return seen.filter((item) => item.kind === kind).map((item) => item.props['label']);
}

describe('the devices panel', () => {
  it('docks the confirm row with Move and Keep in the old room', () => {
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ pending: moveOf(false) }) }));
    expect(
      seen.some((item) => item.kind === 'Text' && item.props.children === 'Move Lamp to Kitchen'),
    ).toBe(true);
    expect(labels('Button')).toEqual(expect.arrayContaining(['Move', 'Keep in Hall']));
  });

  it('disables Move and Keep while the editor is read only', () => {
    const pending = moveOf(true);
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ pending, readOnly: true }) }));
    const row = seen.filter((item) => item.kind === 'Button' && item.props['label'] !== undefined);
    const disabled = (label: string): unknown =>
      row.find((item) => item.props['label'] === label)?.props['disabled'];
    expect(disabled('Move')).toBe(true);
    expect(disabled('Keep in Hall')).toBe(true);
  });

  it('offers Undo after the move', () => {
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ moved: moveOf(false) }) }));
    expect(labels('Button')).toContain('Undo');
  });

  it('lists every physical device by room and counts the unplaced ones', () => {
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({}) }));
    expect(labels('Badge')).toStrictEqual(['1']);
    expect(labels('Interactive')).toStrictEqual(['Lamp', 'Fan']);
    expect(labels('SearchField')).toStrictEqual([undefined]);
  });

  it('arms a row with a tap and tags it with where to tap, never a drag', () => {
    const arm = vi.fn();
    const armed = { deviceId: FAN, name: 'Fan', mount: 'wall', height: 1.8 } as const;
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ arm, armed }) }));
    const row = seen.find((item) => item.props['label'] === 'Fan')?.props;
    expect([row?.['selected'], /drag/i.test(String(row?.['hint']))]).toStrictEqual([true, false]);
    expect(labels('Badge')).toContain('Tap a wall');
    const press = row?.['onPress'];
    if (isAction(press)) press();
    expect(arm).toHaveBeenCalledWith(null);
  });

  it('offers Place all automatically as one tonal button while a linked device waits', () => {
    const speaker = deviceFixture(4, { id: SPEAKER, name: 'Speaker', room_id: KITCHEN });
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ devices: [lamp, speaker] }) }));
    const button = seen.find((item) => item.props['label'] === 'Place all automatically');
    expect([button?.props['variant'], button?.props['disabled']]).toStrictEqual(['tonal', false]);
    seen.length = 0;
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ devices: [lamp, fan] }) }));
    expect(labels('Button')).not.toContain('Place all automatically');
  });

  it('puts the chosen room first and marks it', () => {
    const speaker = deviceFixture(4, { id: SPEAKER, name: 'Speaker', room_id: KITCHEN });
    const devices = [lamp, fan, speaker];
    renderToStaticMarkup(
      createElement(DevicesPanel, { tool: tool({ devices, selected: 'map-kitchen' }) }),
    );
    expect(labels('Interactive')).toStrictEqual(['Speaker', 'Lamp', 'Fan']);
    expect(labels('Badge')).toStrictEqual(['2', 'This room']);
  });

  it('inspects the chosen device: mount, height, rotation, tilt and model', () => {
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ selected: LAMP }) }));
    expect(labels('Segmented')).toStrictEqual(['Mount']);
    expect(labels('CmField')).toStrictEqual(['Above floor']);
    expect(labels('DegreeField')).toStrictEqual(['Rotation', 'Tilt']);
    expect(seen.some((item) => item.kind === 'Skeleton')).toBe(true);
  });

  it('shows an error with Retry when the models fail to load', () => {
    const refetch = vi.fn();
    const error = new Error('offline');
    hub.models.mockReturnValue({ isError: true, error, data: undefined, refetch });
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ selected: LAMP }) }));
    const shown = seen.find((item) => item.kind === 'ErrorState');
    expect(shown?.props['error']).toBe(error);
    expect(seen.some((item) => item.kind === 'Skeleton')).toBe(false);
    const retry = shown?.props['retry'];
    if (!isAction(retry)) throw new Error('no retry');
    retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('takes a Shelly height from its own setting, never the placement', () => {
    hub.presence.mockReturnValue(true);
    renderToStaticMarkup(createElement(DevicesPanel, { tool: tool({ selected: LAMP }) }));
    expect(labels('CmField')).toStrictEqual([]);
  });
});

describe('the shared room flow', () => {
  function flowOf(
    edits: ReturnType<typeof editing>,
    onSelect: (id: string) => void,
  ): ReturnType<typeof useDeviceRoomFlow> {
    store.devices = [lamp, fan];
    store.rooms = ROOMS;
    const held: { flow: ReturnType<typeof useDeviceRoomFlow> | null } = { flow: null };
    function Probe(): ReactNode {
      held.flow = useDeviceRoomFlow({
        ...{ map: MAP, floorId: FLOOR, editing: edits, readOnly: false, onSelect },
      });
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    if (held.flow === null) throw new Error('no flow');
    return held.flow;
  }

  it('Move to a linked room saves the spot and changes the room at once', async () => {
    const edits = editing();
    const onSelect = vi.fn();
    flowOf(edits, onSelect).place(LAMP, { x: 5, y: 1 }, 'move');
    await vi.waitFor(() => {
      expect(hub.updateDevice).toHaveBeenCalledWith(LAMP, { room_id: KITCHEN });
    });
    expect(edits.edit).toHaveBeenCalledWith(moveOf(false).ops);
    expect(onSelect).toHaveBeenCalledWith(LAMP);
  });

  it('a drop into another room only asks and changes nothing yet', () => {
    const edits = editing();
    flowOf(edits, vi.fn()).place(LAMP, { x: 5, y: 1 }, 'ask');
    expect(edits.edit).not.toHaveBeenCalled();
    expect(hub.updateDevice).not.toHaveBeenCalled();
  });

  it('a move inside an unlinked room only saves the spot', () => {
    const edits = editing();
    flowOf(edits, vi.fn()).place(LAMP, { x: 9, y: 1 }, 'move');
    expect(edits.edit).toHaveBeenCalledTimes(1);
    expect(hub.updateDevice).not.toHaveBeenCalled();
  });
});
