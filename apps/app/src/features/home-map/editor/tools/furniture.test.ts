import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_WRITE,
  homeMapPointInPolygon,
  type HomeMap,
  type HomeMapObject,
  type HomeMapOp,
  type ModelCatalogRow,
} from '@smarteverything/domain';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { Manipulation } from '../manipulate/use-manipulation';
import type { StageMenu } from '../manipulate/stage-menu';
import type { FurnitureTool, TopAt } from './furniture';
import {
  BIG,
  FLOOR_ID,
  LAMP,
  SOFA,
  SOFA_ID,
  floorWith,
  idleRoomFlow,
  row,
  sofa,
} from './furniture-fixture';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());
const store = vi.hoisted(() => ({ rows: new Array<ModelCatalogRow>(), phone: true }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({
  View: stub('View'),
  ScrollView: stub('ScrollView'),
  TextInput: stub('TextInput'),
}));
vi.mock('../../../../design/animation-gate', () => ({
  useScreenLive: (): { focused: boolean; foreground: boolean } => ({
    focused: true,
    foreground: true,
  }),
}));
vi.mock('../../../../design/platform', () => ({
  isNative: (): boolean => true,
  useIdiom: (): string => 'touch',
}));
vi.mock('../../../../design/size-class', () => ({ useIsPhone: (): boolean => store.phone }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../../../models', () => ({
  useModelCatalog: (): object => ({ rows: store.rows }),
  useModelSpecs: (hashes: readonly (string | null)[]): readonly object[] =>
    hashes.map(() => ({ status: 'ready', value: SOFA })),
  ModelVisual: stub('ModelVisual'),
}));
vi.mock('../manipulate/stage-menu', () => ({
  isPointerEdit: (event: EditEvent): boolean => event.type === 'tap',
  useStageMenu: (): object => ({ onPointer: vi.fn(), layer: null }),
}));
vi.mock('../manipulate/selection-actions', () => ({
  SelectionBar: stub('SelectionBar'),
  useSelectionActions: (): null => null,
}));
vi.mock('./device-tray', () => ({ FlowRow: stub('FlowRow') }));
vi.mock('./wall-object-inspector', () => ({ ObjectWallSection: stub('ObjectWallSection') }));
for (const [path, name] of [
  ['button', 'Button'],
  ['icon', 'Icon'],
  ['icon-button', 'IconButton'],
  ['interactive', 'Interactive'],
  ['number-stepper', 'NumberStepper'],
  ['search-field', 'SearchField'],
  ['segmented', 'Segmented'],
  ['rows', 'SwitchRow'],
  ['text', 'Text'],
  ['text-field', 'TextField'],
] as const) {
  vi.doMock(`../../../../components/${path}`, () => ({ [name]: stub(name) }));
}

const { useFurnitureTool } = await import('./furniture');
const { FurniturePanel } = await import('./catalogue-panel');
const { armedOf, mountFields, placeMiddle } = await import('./furniture-mount');

const SOFA_ROW = row('cat.living.sofa', 'Sofa', 'living');
const LAMP_ROW = row(LAMP.id, 'Table lamp', 'decor');
const FLOOR_TOP: TopAt = () => 0;

function mapWith(objects: Record<string, unknown>[], rooms: boolean): HomeMap {
  const floor = floorWith(objects);
  return HOME_MAP_WRITE.parse({
    ...{ schemaVersion: 1, id: 'home', name: 'Test house', revision: 1, north: 0 },
    updatedAt: '2026-10-25T00:00:00.000Z',
    floors: [rooms ? floor : { ...floor, rooms: [] }],
    sources: [],
    notices: [],
  });
}

interface Run {
  readonly tool: FurnitureTool;
  readonly edit: Mock<(ops: readonly HomeMapOp[]) => Promise<unknown>>;
  readonly onSelect: Mock<(id: string) => void>;
}

interface RunOptions {
  readonly selected?: string | null;
  readonly readOnly?: boolean;
  readonly objects?: Record<string, unknown>[];
  readonly rooms?: boolean;
  readonly armed?: string | null;
}

function run(options: RunOptions = {}): Run {
  const { selected = null, readOnly = false, objects = [sofa()], rooms = true } = options;
  const edit = vi.fn((_ops: readonly HomeMapOp[]): Promise<unknown> => Promise.resolve());
  const onSelect = vi.fn((_id: string): void => undefined);
  const keep = vi.fn((tool: FurnitureTool): FurnitureTool => tool);
  const map = mapWith(objects, rooms);
  const catalogue = { armed: options.armed ?? null, onArm: vi.fn() };
  const onClear = vi.fn();
  const roomFlow = idleRoomFlow();
  function Probe(): ReactNode {
    const tool = keep(
      useFurnitureTool({
        ...{ map, floorId: FLOOR_ID, readOnly, selected, onSelect },
        ...{ edit, onClear, roomFlow },
      }),
    );
    return createElement(FurniturePanel, { tool, manipulation: manipulationOf(), catalogue });
  }
  seen.length = 0;
  renderToStaticMarkup(createElement(Probe));
  const tool = keep.mock.lastCall?.[0];
  if (tool === undefined) throw new Error('no tool');
  return { tool, edit, onSelect };
}

function find(kind: string, label: string): Props {
  const hit = seen.find(
    (item) => item.kind === kind && (item.props['label'] ?? item.props['title']) === label,
  );
  if (hit === undefined) throw new Error(`no ${kind} ${label}`);
  return hit.props;
}

function call(props: Props, key: string, ...args: readonly unknown[]): void {
  const handler: unknown = props[key];
  if (typeof handler !== 'function') throw new Error(`no ${key}`);
  Reflect.apply(handler, undefined, args);
}

function added(edit: Run['edit']): HomeMapObject {
  const op = edit.mock.calls[0]?.[0]?.[0];
  if (op?.op !== 'add' || op.kind !== 'object') throw new Error('not an add');
  return HOME_MAP_OBJECT_WRITE.parse(op.element);
}

function manipulationOf(): Manipulation {
  return {
    gizmo: { mode: 'move', space: 'local', snapping: true, owner: null },
    modes: [],
    locked: false,
    overlay: { ...NO_EDIT_OVERLAY, mode: 'select' },
    notice: null,
    setMode: vi.fn(),
    toggleSnapping: vi.fn(),
    toggleSpace: vi.fn(),
    onEdit: vi.fn(),
  };
}

const MENU: StageMenu = { onPointer: vi.fn(), layer: null };

function placeEvent(x: number, y: number): EditEvent {
  return {
    ...{ seq: 1, type: 'place', at: { x, y }, height: 0, rotation: 0 },
    ...{ surface: { kind: 'ground' }, wall: null },
  };
}

beforeEach(() => {
  store.rows = [SOFA_ROW, row('dev.light.bulb', 'Bulb', 'light')];
  store.phone = true;
});

describe('the furniture catalogue', () => {
  it('lists only catalogue furniture and marks the armed piece', () => {
    run({ armed: SOFA_ROW.id });
    const tile = find('Interactive', 'Place Sofa');
    expect(tile['disabled']).toBe(false);
    expect(tile['selected']).toBe(true);
    expect(String(tile['className'])).toContain('border-primary');
    expect(
      seen.some((item) => item.kind === 'Interactive' && item.props['label'] === 'Place Bulb'),
    ).toBe(false);
    expect(seen.filter((item) => item.kind === 'ModelVisual')).toHaveLength(1);
  });

  it('hands the picked tile to the arming callback', () => {
    const onArm = vi.fn();
    const { tool } = run();
    seen.length = 0;
    renderToStaticMarkup(
      createElement(FurniturePanel, {
        tool,
        manipulation: manipulationOf(),
        catalogue: { armed: null, onArm },
      }),
    );
    expect(find('Interactive', 'Place Sofa')['selected']).toBe(false);
    call(find('Interactive', 'Place Sofa'), 'onPress');
    expect(onArm).toHaveBeenCalledWith(SOFA_ROW, SOFA);
  });

  it('shows no catalogue in Select', () => {
    const { tool } = run();
    seen.length = 0;
    renderToStaticMarkup(
      createElement(FurniturePanel, { tool, manipulation: manipulationOf(), catalogue: null }),
    );
    expect(seen.some((item) => item.props['label'] === 'Place Sofa')).toBe(false);
  });
});

describe('placing a piece', () => {
  it('lands the piece where the floor was tapped and selects it', () => {
    const { tool, edit, onSelect } = run({ objects: [] });
    const at = { x: 1.2, y: 3.4 };
    const request = { row: SOFA_ROW, spec: SOFA, at, rotation: 30, topAt: FLOOR_TOP };
    expect(tool.place(request)).toBe(true);
    const element = added(edit);
    expect(element).toMatchObject({ modelId: SOFA.id, at, rotation: 30, elevation: 0 });
    expect(element.finish).toBe('oat');
    expect(onSelect).toHaveBeenCalledWith(element.id);
  });

  it('without a tap lands the piece in the middle of the room', () => {
    const { tool, edit } = run({ objects: [] });
    tool.place({ row: SOFA_ROW, spec: SOFA, at: null, rotation: 0, topAt: FLOOR_TOP });
    expect(added(edit).at).toEqual({ x: 2.5, y: 2.5 });
  });

  it('moves the middle spot off a piece already standing there', () => {
    const middle = { ...sofa(), at: { x: 2.5, y: 2.5 } };
    const { tool, edit } = run({ objects: [middle] });
    tool.place({ row: SOFA_ROW, spec: SOFA, at: null, rotation: 0, topAt: FLOOR_TOP });
    const room = floorWith([]).rooms.find((item) => item.id === BIG);
    if (room === undefined) throw new Error('no room');
    const { at } = added(edit);
    expect(at).not.toEqual({ x: 2.5, y: 2.5 });
    expect(homeMapPointInPolygon(room.polygon, at)).toBe(true);
  });

  it('asks for a room first when the floor has none and sends nothing', () => {
    const { tool, edit } = run({ objects: [], rooms: false });
    const request = { row: SOFA_ROW, spec: SOFA, at: null, rotation: 0, topAt: FLOOR_TOP };
    expect(tool.place(request)).toBe(false);
    expect(edit).not.toHaveBeenCalled();
  });

  it('sets a table piece on the surface under the tap and a floor piece on the floor', () => {
    const top: TopAt = () => 0.8;
    const lamp = run();
    lamp.tool.place({ row: LAMP_ROW, spec: LAMP, at: { x: 2, y: 2 }, rotation: 0, topAt: top });
    expect(added(lamp.edit).elevation).toBeCloseTo(0.8);
    const chair = run();
    chair.tool.place({ row: SOFA_ROW, spec: SOFA, at: { x: 2, y: 2 }, rotation: 0, topAt: top });
    expect(added(chair.edit).elevation).toBe(0);
  });

  it('sends nothing while editing is paused', () => {
    const { tool, edit } = run({ readOnly: true, objects: [] });
    const request = { row: SOFA_ROW, spec: SOFA, at: { x: 1, y: 1 }, rotation: 0 };
    expect(tool.place({ ...request, topAt: FLOOR_TOP })).toBe(false);
    tool.patch(SOFA_ID, { locked: true });
    expect(edit).not.toHaveBeenCalled();
  });
});

describe('the furniture mount while a piece is armed', () => {
  it('arms only in the furniture tool, with no piece selected and editing allowed', () => {
    const piece = { row: SOFA_ROW, spec: SOFA };
    expect(armedOf(run().tool, piece, true)).toBe(piece);
    expect(armedOf(run().tool, piece, false)).toBeNull();
    expect(armedOf(run({ selected: SOFA_ID }).tool, piece, true)).toBeNull();
    expect(armedOf(run({ readOnly: true }).tool, piece, true)).toBeNull();
  });

  it('puts the scene in place mode with the piece footprint and the tap hint', () => {
    const { tool } = run();
    const held = { tool, piece: { row: SOFA_ROW, spec: SOFA }, topAt: FLOOR_TOP, disarm: vi.fn() };
    const fields = mountFields(held, manipulationOf(), MENU);
    expect(fields.overlay).toMatchObject({
      mode: 'place',
      gizmo: null,
      selection: [],
      place: { kind: 'object', footprint: { w: 2, d: 0.9 }, rotation: 0 },
    });
    expect(fields.notice).toEqual({ text: 'Tap the floor to place the sofa', tone: 'info' });
    expect(fields.layer).toBeNull();
  });

  it('lands the piece on the place event and disarms', () => {
    const { tool, edit } = run({ objects: [] });
    const disarm = vi.fn();
    const held = { tool, piece: { row: SOFA_ROW, spec: SOFA }, topAt: FLOOR_TOP, disarm };
    mountFields(held, manipulationOf(), MENU).onEdit?.(placeEvent(1, 4));
    expect(added(edit).at).toEqual({ x: 1, y: 4 });
    expect(disarm).toHaveBeenCalledTimes(1);
  });

  it('ignores other scene events while armed', () => {
    const { tool, edit } = run({ objects: [] });
    const held = { tool, piece: { row: SOFA_ROW, spec: SOFA }, topAt: FLOOR_TOP, disarm: vi.fn() };
    mountFields(held, manipulationOf(), MENU).onEdit?.({ seq: 3, type: 'cancel' });
    expect(edit).not.toHaveBeenCalled();
  });

  it('stays armed when the piece has no room to land in', () => {
    const { tool, edit } = run({ objects: [], rooms: false });
    const disarm = vi.fn();
    placeMiddle({ tool, piece: { row: SOFA_ROW, spec: SOFA }, topAt: FLOOR_TOP, disarm });
    expect(edit).not.toHaveBeenCalled();
    expect(disarm).not.toHaveBeenCalled();
  });

  it('hands the scene the selection overlay and gizmo edits when nothing is armed', () => {
    const manipulation = manipulationOf();
    const fields = mountFields(null, manipulation, MENU);
    expect(fields.overlay).toBe(manipulation.overlay);
    fields.onEdit?.({
      ...{ seq: 2, type: 'move', id: SOFA_ID, at: { x: 1, y: 1 }, rotation: 0 },
      ...{ wall: null, height: null, elevation: null, mount: null },
    });
    expect(manipulation.onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('the selected piece', () => {
  it('opens the inspector: size, colour, reset, lock and remove', () => {
    const { edit } = run({ selected: SOFA_ID });
    const width = seen.find(
      (item) => item.kind === 'TextInput' && item.props['accessibilityLabel'] === 'Width',
    );
    expect(width?.props['editable']).toBe(true);
    expect(find('Button', 'Reset the sofa to its standard look')['disabled']).toBe(false);
    call(find('Interactive', 'Slate'), 'onPress');
    expect(edit.mock.calls[0]?.[0]).toEqual([
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, patch: { finish: 'slate' } },
    ]);
    call(find('SwitchRow', 'Lock in place'), 'onChange', true);
    expect(edit.mock.calls[1]?.[0]?.[0]).toMatchObject({ patch: { locked: true } });
    call(find('Button', 'Remove'), 'onPress');
    expect(edit.mock.calls[2]?.[0]).toEqual([
      { op: 'remove', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID },
    ]);
  });

  it('nudges the piece with the phone buttons as one move', () => {
    const { edit } = run({ selected: SOFA_ID });
    call(find('IconButton', 'Nudge right by 10 cm'), 'onPress');
    expect(edit.mock.calls[0]?.[0]).toEqual([
      { op: 'move', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, dx: 0.1, dy: 0 },
    ]);
  });

  it('keeps the nudge buttons off larger screens and disabled on a locked piece', () => {
    store.phone = false;
    run({ selected: SOFA_ID });
    expect(seen.some((item) => item.props['label'] === 'Nudge right by 10 cm')).toBe(false);
    store.phone = true;
    run({ selected: SOFA_ID, objects: [sofa(true)] });
    expect(find('IconButton', 'Nudge right by 10 cm')['disabled']).toBe(true);
  });

  it('turns the piece by the fine step', () => {
    const { edit } = run({ selected: SOFA_ID });
    call(find('IconButton', 'Turn left 15 degrees'), 'onPress');
    expect(edit.mock.calls[0]?.[0]?.[0]).toMatchObject({ patch: { rotation: 345 } });
  });
});
