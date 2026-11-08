import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_WALL_ID, type HomeMapOp, type HomeMapPlacement } from '@smarteverything/domain';
import { deviceFixture } from '../../../../store/device-fixture';
import type { DevicesTool } from './devices';
import type { PlaceEdit, TapEdit } from './devices-model';
import type { MoveEdit } from '../tool-state';
import { ATTACHED, BOTTOM, FLOOR_ID, RIGHT, wallFloor } from './wall-fixture';

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

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('react-native-svg', () => ({ default: stub('Svg'), Path: stub('P'), Text: stub('T') }));
vi.mock('../../../../design/colour', () => ({ useColourResolver: () => (): string => '#000' }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('../../../../api/devices', () => ({ updateDevice: vi.fn() }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../../../../store/selectors', () => ({
  useRooms: (): readonly object[] => [],
  useDevices: (): readonly object[] => [],
}));
vi.mock('../../../models', () => ({
  useDeviceModel: (): object => ({ spec: { status: 'idle' } }),
  useModelCatalog: (): null => null,
  useModelOverrides: (): null => null,
  modelSubjectOf: (): null => null,
  resolvedModelOf: (): object => ({ resolution: { main: null } }),
}));
for (const [path, name] of [
  ['icon', 'Icon'],
  ['interactive', 'Interactive'],
  ['number-stepper', 'NumberStepper'],
  ['segmented', 'Segmented'],
  ['text', 'Text'],
] as const) {
  vi.doMock(`../../../../components/${path}`, () => ({ [name]: stub(name) }));
}

const { DeviceWallSection } = await import('./devices');
const model = await import('./devices-model');

const LIGHT = '00000000-0000-4000-8000-0000000000a9';

function placement(mount: HomeMapPlacement['mount']): HomeMapPlacement {
  return {
    ...{ deviceId: LIGHT, floorId: wallFloor().id, at: { x: 2, y: 0.05 }, rotation: 90 },
    ...{ height: 1.9, tilt: 0, mount, auto: false, camera: null, wall: ATTACHED },
  };
}

function render(mount: HomeMapPlacement['mount']): readonly HomeMapOp[][] {
  const applied: HomeMapOp[][] = [];
  const floor = wallFloor();
  const tool: Pick<DevicesTool, 'floor' | 'rooms' | 'readOnly' | 'apply'> = {
    floor,
    rooms: [],
    readOnly: false,
    apply: (ops): void => {
      applied.push([...ops]);
    },
  };
  const device = deviceFixture(1, { id: LIGHT, name: 'Wall light' });
  seen.length = 0;
  renderToStaticMarkup(
    createElement(DeviceWallSection, {
      tool,
      device,
      placement: placement(mount),
    }),
  );
  return applied;
}

function find(kind: string, label: string): Props {
  const hit = seen.find((item) => item.kind === kind && item.props['label'] === label);
  if (hit === undefined) throw new Error(`no ${kind} ${label}`);
  return hit.props;
}

function call(props: Props, key: string, ...args: readonly unknown[]): void {
  const handler: unknown = props[key];
  if (typeof handler !== 'function') throw new Error(`no ${key}`);
  Reflect.apply(handler, undefined, args);
}

describe('the wall section for wall mounted devices', () => {
  it('shows nothing for a device that is not on a wall', () => {
    render('floor');
    expect(seen.some((item) => item.kind === 'NumberStepper')).toBe(false);
  });

  it('writes the mount height to the placement height and turns it across the wall', () => {
    const applied = render('wall');
    expect(find('NumberStepper', 'Above floor')['value']).toBe(1.9);
    call(find('NumberStepper', 'Above floor'), 'onChange', 1.5);
    expect(applied[0]?.[0]).toMatchObject({
      ...{ op: 'update', kind: 'placement', floorId: FLOOR_ID, id: LIGHT },
      patch: { height: 1.5 },
    });
    call(find('Segmented', 'Facing'), 'onChange', 'right');
    expect(applied[1]?.[0]).toMatchObject({
      patch: { rotation: 270, wall: { wallId: BOTTOM, side: 'right' } },
    });
  });
});

const WALL_LIGHT = { deviceId: LIGHT, name: 'Wall light', mount: 'wall', height: 1.8 } as const;

function placeEvent(change: Partial<PlaceEdit>): PlaceEdit {
  const base: PlaceEdit = {
    seq: 3,
    type: 'place',
    at: { x: 2, y: 0.05 },
    height: 1.8,
    rotation: 90,
    surface: { kind: 'wall', wallId: BOTTOM },
    wall: ATTACHED,
  };
  return { ...base, ...change };
}

describe('placing a device in 3D', () => {
  it('lands a wall device on the wall the scene seated it on, at the scene height', () => {
    const next = model.spotPlacement(wallFloor(), WALL_LIGHT, null, placeEvent({}));
    expect(next).toMatchObject({ mount: 'wall', height: 1.8, rotation: 90, wall: ATTACHED });
    expect(next.auto).toBe(false);
  });

  it('lifts a ceiling device to the scene height and keeps the turn of a placed one', () => {
    const armed = { ...WALL_LIGHT, mount: 'ceiling', height: 2.6 } as const;
    const base = { ...placement('floor'), rotation: 30 };
    const event = placeEvent({
      height: 2.6,
      rotation: 0,
      surface: { kind: 'ceiling' },
      wall: null,
    });
    const next = model.spotPlacement(wallFloor(), armed, base, event);
    expect(next).toMatchObject({ mount: 'ceiling', height: 2.6, rotation: 30 });
    expect(next.wall).toBeUndefined();
  });

  it('keeps a dragged wall device on a wall, the new one when the drag hopped', () => {
    const move: MoveEdit = {
      ...{ seq: 4, type: 'move', id: LIGHT, at: { x: 4.8, y: 2 }, rotation: 180 },
      ...{ wall: null, height: 1.4, elevation: null, mount: null },
    } as const;
    expect(model.movedPlacement(placement('wall'), move).wall).toStrictEqual(ATTACHED);
    const hop = { ...ATTACHED, wallId: HOME_MAP_WALL_ID.parse(RIGHT) };
    expect(model.movedPlacement(placement('wall'), { ...move, wall: hop }).wall).toBe(hop);
  });

  it('arms with the mount and height and says where to tap', () => {
    const overlay = model.devicesOverlay({
      ...{ floor: wallFloor(), armed: WALL_LIGHT, selected: null, readOnly: false },
    });
    expect([overlay.mode, overlay.place]).toStrictEqual([
      'place',
      { kind: 'device', mount: 'wall', height: 1.8 },
    ]);
    expect(model.armedNotice(WALL_LIGHT)?.text).toBe('Tap a wall to place Wall light.');
  });

  it('gives a selected wall device only the along-wall and up arrows', () => {
    const floor = { ...wallFloor(), placements: [placement('wall')] };
    const overlay = model.devicesOverlay({ floor, armed: null, selected: LIGHT, readOnly: false });
    expect(overlay.gizmo).toMatchObject({ mode: 'move', space: 'local', axes: ['y', 'z'] });
    expect(model.deviceGizmo(placement('floor')).axes).toStrictEqual(['x', 'y']);
  });

  it('picks the nearest device within the touch radius of a tap', () => {
    const far = { ...placement('floor'), deviceId: 'far', at: { x: 2.15, y: 0.05 } };
    const floor = { ...wallFloor(), placements: [far, placement('floor')] };
    const tap: TapEdit = {
      ...{ seq: 1, type: 'tap', point: { x: 2.05, y: 0.05 }, floorId: FLOOR_ID },
      ...{ hit: { kind: 'none' }, metresPerPx: 0.01 },
    } as const;
    expect(model.tappedId(floor, tap)).toBe(LIGHT);
    expect(model.tappedId(floor, { ...tap, metresPerPx: 0.001 })).not.toBe(LIGHT);
  });

  it('asks before a placement in another linked room and saves at once inside its own', () => {
    const base = wallFloor();
    const rooms = base.rooms.map((room) => ({ ...room, homeRoomId: 'hub-living' }));
    const floor = { ...base, rooms };
    const next = placement('floor');
    const device = { id: LIGHT, label: 'Wall light', room_id: 'hub-hall' };
    const hubRooms = [{ id: 'hub-living', name: 'Living room' }];
    const input = { floor, device, base: null, next, rooms: hubRooms };
    const asked = model.settledPlacement(input);
    expect(asked.kind === 'ask' ? asked.move.toName : null).toBe('Living room');
    const own = { ...device, room_id: 'hub-living' };
    expect(model.settledPlacement({ ...input, device: own })).toMatchObject({ kind: 'apply' });
  });
});
