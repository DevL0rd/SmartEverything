import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_ROOM_ID,
  type HomeMapFloor,
  type HomeMapPlacement,
} from '@smarteverything/domain';
import { deviceFixture } from '../../../../store/device-fixture';
import { ATTACHED, wallFloor } from './wall-fixture';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());
const preset = vi.hoisted((): { value: unknown } => ({ value: null }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return null;
  };
}

vi.mock('react-native', () => ({ View: (props: Props): ReactNode => props.children ?? null }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('../../../../api/devices', () => ({ updateDevice: vi.fn() }));
vi.mock('../../../../queries/use-screen-query', () => ({ useScreenQuery: (): object => ({}) }));
vi.mock('../../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../../plugins/shelly-presence/presence-data', () => ({
  isPhysicalPresence: (): boolean => false,
  usePresence: (): object => ({ state: 'loading' }),
}));
vi.mock('../../../../plugins/shelly-presence/use-presence-operation', () => ({
  usePresenceOperation: (): object => ({}),
}));
vi.mock('../../../../plugins/shelly-presence/form-model', () => ({ recordOf: (): null => null }));
vi.mock('../../../../plugins/shelly-presence/settings-patch', () => ({
  settingParams: vi.fn(),
  settingsPatch: vi.fn(),
}));
vi.mock('../../../../store/selectors', () => ({
  useDeviceValue: (): object | null =>
    preset.value === null ? null : { value: preset.value, observedAt: '' },
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
vi.mock('../list-editor/list-parts', () => ({ CmField: stub('CmField') }));
vi.mock('../list-editor/object-item', () => ({ DegreeField: stub('DegreeField'), TURN_RANGE: [] }));
vi.mock('./devices', () => ({ DeviceWallSection: stub('DeviceWallSection') }));
vi.mock('./wall-object-inspector', () => ({ ABOVE_FLOOR_LABEL: 'Above floor' }));
for (const [path, name] of [
  ['badge', 'Badge'],
  ['button', 'Button'],
  ['loaded-query', 'LoadedQuery'],
  ['number-stepper', 'NumberStepper'],
  ['segmented', 'Segmented'],
  ['skeleton', 'Skeleton'],
  ['switch', 'Switch'],
  ['text', 'Text'],
] as const) {
  vi.doMock(`../../../../components/${path}`, () => ({ [name]: stub(name) }));
}

const { DeviceInspector } = await import('./device-inspector');
const { CAMERA_POSE_HINT } = await import('./camera-pose');
const { roomSpot } = await import('./device-room-flow');

const LIGHT = '00000000-0000-4000-8000-0000000000a9';
const KITCHEN = '00000000-0000-4000-8000-0000000000b2';

let lastApply = vi.fn();
let lastMoveTo = vi.fn();

function twoRooms(): HomeMapFloor {
  const floor = wallFloor();
  const [living] = floor.rooms;
  if (living === undefined) throw new Error('no room');
  const outer = [
    { x: 5, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 5 },
    { x: 5, y: 5 },
  ];
  const kitchen = {
    ...{ ...living, id: HOME_MAP_ROOM_ID.parse(KITCHEN), name: 'Kitchen' },
    ...{ polygon: { outer, holes: [] }, labelAt: { x: 6.5, y: 2.5 } },
  };
  return { ...floor, rooms: [living, kitchen] };
}

interface Options {
  readonly floor?: HomeMapFloor;
  readonly readOnly?: boolean;
}

function render(
  mount: HomeMapPlacement['mount'],
  device = deviceFixture(1, { id: LIGHT, name: 'Wall light' }),
  options: Options = {},
): HomeMapPlacement {
  const placement: HomeMapPlacement = {
    ...{ deviceId: LIGHT, floorId: wallFloor().id, at: { x: 2, y: 0.05 }, rotation: 90 },
    ...{ height: 1.9, tilt: 0, mount, auto: false, camera: null, wall: ATTACHED },
  };
  const floor = options.floor ?? wallFloor();
  const readOnly = options.readOnly ?? false;
  const tool = { floor, rooms: [], readOnly, apply: vi.fn(), moveTo: vi.fn() };
  seen.length = 0;
  renderToStaticMarkup(createElement(DeviceInspector, { tool, device, placement }));
  lastApply = tool.apply;
  lastMoveTo = tool.moveTo;
  return placement;
}

function labels(kind: string): readonly unknown[] {
  return seen.filter((item) => item.kind === kind).map((item) => item.props['label']);
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

function texts(): readonly unknown[] {
  return seen.filter((item) => item.kind === 'Text').map((item) => item.props.children);
}

const CAMERA = deviceFixture(1, {
  id: LIGHT,
  name: 'Hall camera',
  kind: 'camera',
  capabilities: [
    {
      key: 'ptz_preset',
      label: 'Preset',
      access: 'read_write',
      value: { kind: 'enum', options: ['Door', 'Desk'] },
    },
  ],
});

describe('the device inspector', () => {
  it.each([
    ['floor', 0],
    ['table', 0.75],
    ['ceiling', 2.6],
  ] as const)('moves the camera from a wall to %s at its mounting height', (mount, height) => {
    const placement = render('wall', CAMERA);
    call(find('Segmented', 'Mount'), 'onChange', mount);
    expect(lastApply.mock.calls[0]?.[0]).toMatchObject([
      { op: 'remove', id: LIGHT },
      { op: 'add', element: { mount, height, rotation: placement.rotation, tilt: placement.tilt } },
    ]);
    expect(lastApply.mock.calls[0]?.[0]).not.toHaveProperty('1.element.wall');
  });

  it('uses the room ceiling and keeps explicit height edits after remounting', () => {
    const floor = wallFloor();
    const rooms = floor.rooms.map((room) => ({ ...room, ceilingHeight: 3.1 }));
    render('floor', CAMERA, { floor: { ...floor, rooms } });
    call(find('Segmented', 'Mount'), 'onChange', 'ceiling');
    expect(lastApply.mock.calls[0]?.[0]).toMatchObject([{}, { element: { height: 3.1 } }]);
    call(find('CmField', 'Above floor'), 'onChange', 1.65);
    expect(lastApply.mock.calls[1]?.[0]).toMatchObject([{ patch: { height: 1.65 } }]);
  });

  it('attaches a camera switched to a wall and preserves its camera aim', () => {
    const placement = render('table', CAMERA);
    call(find('Segmented', 'Mount'), 'onChange', 'wall');
    expect(lastApply.mock.calls[0]?.[0]).toMatchObject([
      {},
      {
        element: {
          mount: 'wall',
          height: 2.2,
          wall: ATTACHED,
          tilt: placement.tilt,
          camera: placement.camera,
        },
      },
    ]);
  });

  it('shows the wall section for a wall mounted device instead of the plain height', () => {
    const placement = render('wall');
    const section = seen.find((item) => item.kind === 'DeviceWallSection');
    expect(section?.props['placement']).toBe(placement);
    expect(seen.some((item) => item.kind === 'CmField')).toBe(false);
  });

  it('keeps the height above the floor and no wall section for other mounts', () => {
    render('ceiling');
    expect(seen.some((item) => item.kind === 'DeviceWallSection')).toBe(false);
    expect(labels('CmField')).toStrictEqual(['Above floor']);
    expect(labels('DegreeField')).toStrictEqual(['Rotation', 'Tilt']);
  });

  it('shows Turn, Tilt and Field of view for a camera with the drag hint', () => {
    preset.value = 'Door';
    render('wall', CAMERA);
    expect(labels('DegreeField')).toStrictEqual(['Turn', 'Tilt', 'Field of view']);
    expect(labels('Segmented')).toEqual(expect.arrayContaining(['Pan']));
    expect(texts()).toContain(CAMERA_POSE_HINT);
    preset.value = null;
  });

  it('hides the drag hint when the map is read only', () => {
    render('wall', CAMERA, { readOnly: true });
    expect(texts()).not.toContain(CAMERA_POSE_HINT);
    expect(find('DegreeField', 'Turn')['disabled']).toBe(true);
  });

  it('saves the shown camera defaults with the first turn of a camera without one', () => {
    render('wall', CAMERA);
    call(find('DegreeField', 'Turn'), 'onChange', 45);
    expect(lastApply.mock.calls[0]?.[0]).toMatchObject([
      { op: 'update', patch: { camera: { pan: { mode: 'fixed', yawDeg: 45, presets: {} } } } },
    ]);
  });

  it('writes the tilt with the camera and the field of view as an exact width', () => {
    render('wall', CAMERA);
    call(find('DegreeField', 'Tilt'), 'onChange', 25);
    expect(lastApply.mock.calls[0]?.[0]).toMatchObject([
      { op: 'update', patch: { tilt: 25, camera: { pan: { mode: 'fixed' } } } },
    ]);
    call(find('DegreeField', 'Field of view'), 'onChange', 70);
    expect(lastApply.mock.calls[1]?.[0]).toMatchObject([
      { op: 'update', patch: { camera: { hfovDeg: 70, fovSource: 'exact' } } },
    ]);
  });

  it('moves the device to another room through the room flow', () => {
    render('wall', undefined, { floor: twoRooms() });
    const living = find('Button', 'Living room');
    expect(living['disabled']).toBe(true);
    expect(living['variant']).toBe('filled');
    const kitchen = find('Button', 'Kitchen');
    expect(kitchen['disabled']).toBe(false);
    call(kitchen, 'onPress');
    expect(lastMoveTo).toHaveBeenCalledWith(LIGHT, KITCHEN);
    expect(lastApply).not.toHaveBeenCalled();
  });

  it('lands a moved device at the free spot under the room label', () => {
    expect(roomSpot(twoRooms(), KITCHEN)).toStrictEqual({ x: 6.5, y: 2.5 });
    expect(roomSpot(twoRooms(), 'gone')).toBeNull();
  });

  it('offers no room move when the device already sits in the only room', () => {
    render('wall');
    expect(labels('Button')).not.toContain('Living room');
  });
});
