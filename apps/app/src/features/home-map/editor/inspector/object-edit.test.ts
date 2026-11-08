import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_MODEL_ID,
  HOME_MAP_OBJECT_WRITE,
  HOME_MAP_WALL_ID,
  type HomeMapObject,
  type ModelSpec,
} from '@smarteverything/domain';
import { NO_EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { FurnitureTool } from '../tools/furniture';
import { FINISH_TOKENS } from '../../../../components/models/three/materials';
import type { SelectionActions } from '../manipulate/selection-actions';
import { objectActions } from '../manipulate/object-actions';
import type { Manipulation } from '../manipulate/use-manipulation';
import { GIZMO_START, type GizmoMode } from '../tool-state';
import {
  SHELF,
  SOFA,
  WALL_ID,
  floorWith,
  idleRoomFlow,
  onlyObject,
  sofa,
  specOf,
} from '../tools/furniture-fixture';
import {
  CUSTOM_PRESET,
  NOT_A_NUMBER,
  activePreset,
  commitField,
  objectEditFacts,
  paramPatch,
  presetPatch,
  resetLabel,
  resetPatch,
  transformFields,
  type ObjectEditFacts,
  type TransformField,
} from './object-edit-model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());
const surface = vi.hoisted<{ now: 'bar' | 'menu' }>(() => ({ now: 'bar' }));
const picked = vi.hoisted<{ actions: SelectionActions | null }>(() => ({ actions: null }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return typeof props.children === 'string' ? null : (props.children ?? null);
  };
}

vi.mock('react-native', () => ({ View: stub('View'), TextInput: stub('TextInput') }));
vi.mock('../docked-panel', () => ({ useSelectionSurface: (): string => surface.now }));
vi.mock('../../../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../manipulate/selection-actions', () => ({
  useSelectionActions: (): unknown => picked.actions,
}));
vi.mock('../manipulate/mode-switch', () => ({
  ModeSwitch: stub('ModeSwitch'),
  SnapToggle: stub('SnapToggle'),
  AxesToggle: stub('AxesToggle'),
}));
for (const [path, name] of [
  ['badge', 'Badge'],
  ['button', 'Button'],
  ['icon', 'Icon'],
  ['interactive', 'Interactive'],
  ['number-stepper', 'NumberStepper'],
  ['text', 'Text'],
] as const) {
  vi.doMock(`../../../../components/${path}`, () => ({ [name]: stub(name) }));
}

const { ObjectEdit } = await import('./object-edit');

const OBJECT_PATCH = HOME_MAP_OBJECT_WRITE.partial();

function placed(patch: Partial<HomeMapObject> = {}): HomeMapObject {
  return { ...onlyObject(floorWith([sofa()])), ...patch };
}

const shelf = (): HomeMapObject =>
  placed({
    modelId: HOME_MAP_MODEL_ID.parse(SHELF.id),
    wall: { wallId: HOME_MAP_WALL_ID.parse(WALL_ID), offset: 1, side: 'left' },
    elevation: 1.5,
  });

const BED: ObjectEditFacts = {
  ...objectEditFacts(SOFA),
  presets: [
    { id: 'double', label: 'Double 140 × 200 cm', params: { width: 1.4 } },
    { id: 'king', label: 'King 180 × 200 cm', params: { width: 1.8 } },
  ],
  styles: [
    { name: 'upholstered', label: 'Upholstered' },
    { name: 'platform', label: 'Platform' },
  ],
  defaultStyle: 'upholstered',
  derive: (params) => ({ seats: Math.max(2, Math.round((params['width'] ?? 2) / 0.7)) }),
};

const specs = (id: string): ModelSpec | undefined => (id === SHELF.id ? SHELF : specOf(id));

function toolFor(selected: HomeMapObject, patch = vi.fn(), readOnly = false): FurnitureTool {
  return {
    floor: floorWith([sofa()]),
    rows: [],
    readOnly,
    selected,
    selectedId: selected.id,
    notice: null,
    specOf: specs,
    nameOf: (): string => 'Sofa',
    roomFlow: idleRoomFlow(),
    place: vi.fn(),
    select: vi.fn(),
    send: vi.fn(),
    patch,
    remove: vi.fn(),
    notify: vi.fn(),
    clear: vi.fn(),
  };
}

function manipulationOf(mode: GizmoMode, locked = false): Manipulation {
  return {
    gizmo: { ...GIZMO_START, mode },
    modes: locked ? [] : ['move', 'rotate', 'scale'],
    locked,
    overlay: NO_EDIT_OVERLAY,
    notice: null,
    setMode: vi.fn(),
    toggleSnapping: vi.fn(),
    toggleSpace: vi.fn(),
    onEdit: vi.fn(),
  };
}

function actionsOf(object: HomeMapObject, onAction = vi.fn()): SelectionActions {
  const target = { kind: 'object', object } as const;
  return {
    id: object.id,
    target,
    title: 'Sofa',
    room: 'Living room',
    rooms: [{ key: 'r1', label: 'Kitchen', on: false }],
    looks: [],
    actionsFor: (on) => objectActions(target, on, false),
    onAction,
    onRoom: vi.fn(),
    onLook: vi.fn(),
    onCommand: vi.fn(),
  };
}

let root: Root | null = null;

function unmount(): void {
  act(() => {
    root?.unmount();
  });
  root = null;
}

function render(tool: FurnitureTool, object: HomeMapObject, mode: GizmoMode = 'move'): void {
  unmount();
  seen.length = 0;
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const current = root;
  const manipulation = manipulationOf(mode, object.locked);
  act(() => {
    current.render(createElement(ObjectEdit, { tool, object, manipulation }));
  });
}

function latest(kind: string, key: string, label: string): Props {
  const hit = seen.findLast((item) => item.kind === kind && item.props[key] === label);
  if (hit === undefined) throw new Error(`no ${kind} ${label}`);
  return hit.props;
}

const find = (kind: string, label: string): Props => latest(kind, 'label', label);
const input = (label: string): Props => latest('TextInput', 'accessibilityLabel', label);

function call(props: Props, key: string, ...args: readonly unknown[]): void {
  const handler: unknown = props[key];
  if (typeof handler !== 'function') throw new Error(`no ${key}`);
  act(() => {
    Reflect.apply(handler, undefined, args);
  });
}

function frames(look: string): number {
  const last = new Map<unknown, string>();
  seen.forEach((item, at) => {
    const name = String(item.props['className']);
    if (item.kind !== 'View' || !name.includes('h-11')) return;
    const field = seen.slice(at).find((next) => next.kind === 'TextInput');
    last.set(field?.props['accessibilityLabel'], name);
  });
  return [...last.values()].filter((name) => name.includes(look)).length;
}

function fieldOf(object: HomeMapObject, id: TransformField['id'], spec = SOFA): TransformField {
  const found = transformFields(object, spec).find((each) => each.id === id);
  if (found === undefined) throw new Error(`no field ${id}`);
  return found;
}

beforeEach(() => {
  surface.now = 'bar';
  picked.actions = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe('object edit facts', () => {
  it('splits the model parameters into size fields and part parameters with the model ranges', () => {
    const facts = objectEditFacts(SOFA);
    expect(facts.size).toEqual([
      { name: 'width', label: 'Width', unit: 'm', min: 1.6, max: 3, fallback: 2, axis: 'width' },
    ]);
    expect(facts.parts.map((param) => [param.name, param.min, param.max])).toEqual([
      ['seats', 2, 4],
    ]);
    expect(facts.finishes).toEqual([
      { name: 'oat', label: 'Oat', colour: FINISH_TOKENS['matte-white'].color },
      { name: 'slate', label: 'Slate', colour: FINISH_TOKENS['matte-white'].color },
    ]);
    expect(resetLabel(facts)).toBe('Reset the sofa to its standard look');
  });

  it('keeps other params and updates the derived ones live', () => {
    const object = placed({ params: { seats: 3, depth: 0.95 } });
    const patch = paramPatch(object, BED, 'width', 2.8);
    expect(patch).toEqual({ params: { width: 2.8, seats: 4, depth: 0.95 } });
    expect(OBJECT_PATCH.safeParse(patch).success).toBe(true);
  });

  it('applies a size preset and reads which preset matches the current size', () => {
    const object = placed();
    expect(activePreset(object, BED)).toBe(CUSTOM_PRESET);
    const king = BED.presets[1];
    if (king === undefined) throw new Error('no preset');
    const patch = presetPatch(object, BED, king);
    expect(patch.params).toEqual({ width: 1.8, seats: 3 });
    expect(activePreset(placed(patch), BED)).toBe('king');
  });

  it('resets size, parts, style and colour to the model defaults', () => {
    expect(resetPatch(BED)).toEqual({
      params: { width: 2, seats: 3 },
      finish: 'oat',
      style: 'upholstered',
    });
    expect(resetPatch(objectEditFacts(SOFA))).toEqual({
      params: { width: 2, seats: 3 },
      finish: 'oat',
    });
  });
});

describe('number fields', () => {
  it('lists X, Y, Turn, Width, Depth and Height with their groups, limits and resizable axes', () => {
    const fields = transformFields(placed({ rotation: 30 }), SOFA);
    expect(fields.map((each) => [each.id, each.value, each.group, each.editable])).toEqual([
      ['x', 2, 'move', true],
      ['y', 2, 'move', true],
      ['turn', 30, 'rotate', true],
      ['width', 2, 'scale', true],
      ['depth', 0.9, 'scale', false],
      ['height', 0.8, 'scale', false],
    ]);
    expect([fieldOf(placed(), 'width').min, fieldOf(placed(), 'width').max]).toEqual([1.6, 3]);
  });

  it('adds Above floor for a wall object and leaves its turn to the wall', () => {
    const fields = transformFields(shelf(), SHELF);
    expect(fields.map((each) => each.id)).toEqual([
      'x',
      'y',
      'turn',
      'width',
      'depth',
      'height',
      'above',
    ]);
    expect(fields.find((each) => each.id === 'turn')?.editable).toBe(false);
    const above = fieldOf(shelf(), 'above', SHELF);
    expect(commitField(shelf(), objectEditFacts(SHELF), above, '1.2')).toEqual({
      kind: 'patch',
      patch: { elevation: 1.2 },
    });
    expect(commitField(shelf(), objectEditFacts(SHELF), above, '-0.1')).toEqual({
      kind: 'invalid',
      reason: 'At least 0.00 m',
    });
  });

  it('turns a typed value into one patch and keeps the old value with a reason when it is invalid', () => {
    const object = placed();
    const facts = objectEditFacts(SOFA);
    const commit = (id: TransformField['id'], text: string): unknown =>
      commitField(object, facts, fieldOf(object, id), text);
    expect(commit('width', '2,45')).toEqual({ kind: 'patch', patch: { params: { width: 2.45 } } });
    expect(commit('width', '1')).toEqual({ kind: 'invalid', reason: 'At least 1.60 m' });
    expect(commit('width', '3.5 m')).toEqual({ kind: 'invalid', reason: 'At most 3.00 m' });
    expect(commit('x', 'abc')).toEqual({ kind: 'invalid', reason: NOT_A_NUMBER });
    expect(commit('x', '')).toEqual({ kind: 'invalid', reason: NOT_A_NUMBER });
    expect(commit('x', '2.00')).toEqual({ kind: 'same' });
    expect(commit('x', '-1.5 m')).toEqual({ kind: 'patch', patch: { at: { x: -1.5, y: 2 } } });
    expect(commit('y', '3.25')).toEqual({ kind: 'patch', patch: { at: { x: 2, y: 3.25 } } });
    expect(commit('turn', '-90')).toEqual({ kind: 'patch', patch: { rotation: 270 } });
    expect(commit('turn', '450°')).toEqual({ kind: 'patch', patch: { rotation: 90 } });
    expect(commit('turn', '360')).toEqual({ kind: 'same' });
  });
});

describe('the object edit inspector', () => {
  it('commits a typed value once on Enter and not again on blur', () => {
    const patch = vi.fn();
    render(toolFor(placed(), patch), placed());
    expect(input('Width')['value']).toBe('2.00');
    call(input('Width'), 'onChangeText', '2.45');
    call(input('Width'), 'onSubmitEditing');
    call(input('Width'), 'onBlur');
    expect(patch.mock.calls).toEqual([[expect.any(String), { params: { width: 2.45 } }]]);
    expect(OBJECT_PATCH.safeParse(patch.mock.calls[0]?.[1]).success).toBe(true);
  });

  it('keeps the old value, marks the field invalid and shows the reason', () => {
    const patch = vi.fn();
    render(toolFor(placed(), patch), placed());
    call(input('Width'), 'onChangeText', '0.05');
    call(input('Width'), 'onBlur');
    expect(patch).not.toHaveBeenCalled();
    expect(input('Width')['value']).toBe('2.00');
    expect(input('Width')['aria-invalid']).toBe(true);
    expect(seen.some((item) => item.props.children === 'At least 1.60 m')).toBe(true);
    expect(frames('border-critical')).toBe(1);
    call(input('Width'), 'onChangeText', '2');
    expect(input('Width')['aria-invalid']).toBe(false);
  });

  it('outlines the field group of the gizmo mode in amber', () => {
    render(toolFor(placed()), placed(), 'move');
    expect(frames('border-primary')).toBe(2);
    render(toolFor(placed()), placed(), 'scale');
    expect(frames('border-primary')).toBe(1);
    expect(frames('border-dashed')).toBe(2);
  });

  it('sends the part parameter, the colour and the reset on the phone', () => {
    const patch = vi.fn();
    const object = placed({ finish: 'oat' });
    render(toolFor(object, patch), object);
    call(find('NumberStepper', 'Seats'), 'onChange', 4);
    call(find('Interactive', 'Slate'), 'onPress');
    call(find('Interactive', 'Oat'), 'onPress');
    call(find('Button', 'Reset the sofa to its standard look'), 'onPress');
    expect(patch.mock.calls.map((args: readonly unknown[]) => args[1])).toEqual([
      { params: { seats: 4 } },
      { finish: 'slate' },
      { params: { width: 2, seats: 3 }, finish: 'oat' },
    ]);
    expect(seen.some((item) => item.kind === 'ModeSwitch' || item.kind === 'Badge')).toBe(false);
  });

  it('dashes and disables every field of a locked or read only object', () => {
    const locked = placed({ locked: true });
    render(toolFor(locked), locked);
    expect(input('X')['editable']).toBe(false);
    expect(frames('border-dashed')).toBe(6);
    expect(find('Interactive', 'Slate')['disabled']).toBe(true);
    render(toolFor(placed(), vi.fn(), true), placed());
    expect(input('Width')['editable']).toBe(false);
    expect(find('NumberStepper', 'Seats')['disabled']).toBe(true);
  });

  it('shows the mode row, the Locked chip, Unlock to edit and the action list with keys on wide screens', () => {
    surface.now = 'menu';
    const locked = placed({ locked: true });
    const onAction = vi.fn();
    picked.actions = actionsOf(locked, onAction);
    render(toolFor(locked), locked);
    expect(find('Badge', 'Locked')).toBeDefined();
    call(find('Button', 'Unlock to edit'), 'onPress');
    expect(onAction).toHaveBeenCalledWith('lock');
    expect(latest('ModeSwitch', 'look', 'row')['modes']).toEqual([]);
    expect(find('Interactive', 'Unlock position')['className']).toContain('bg-primary-container');
    for (const key of ['Q', 'F', 'Ctrl+D', 'Ctrl+L', 'Del']) {
      expect(seen.some((item) => item.kind === 'Text' && item.props.children === key)).toBe(true);
    }
    expect(seen.some((item) => item.props['label'] === 'Slate')).toBe(false);
    call(find('Interactive', 'Colour and style'), 'onPress');
    expect(find('Interactive', 'Slate')).toBeDefined();
    call(find('Interactive', 'Delete'), 'onPress');
    expect(onAction).toHaveBeenLastCalledWith('delete');
  });

  it('draws nothing for a model whose spec is not loaded', () => {
    const object = placed({ modelId: HOME_MAP_MODEL_ID.parse('cat.unknown') });
    render(toolFor(object), object);
    expect(seen).toEqual([]);
  });
});
