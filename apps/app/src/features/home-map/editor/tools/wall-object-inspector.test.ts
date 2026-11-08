import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HomeMapObject, ModelCatalogRow } from '@smarteverything/domain';
import type { FurnitureTool } from './furniture';
import { idleManipulation, idleRoomFlow } from './furniture-fixture';
import {
  ATTACHED,
  BOTTOM,
  SHELF,
  SHELF_ID,
  VASE,
  row,
  shelf,
  wallFloor,
  wallSpecOf,
} from './wall-fixture';

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

vi.mock('react-native', () => ({
  View: stub('View'),
  ScrollView: stub('ScrollView'),
  TextInput: stub('TextInput'),
}));
vi.mock('../../../../design/platform', () => ({
  isNative: (): boolean => true,
  useIdiom: (): string => 'touch',
}));
vi.mock('../../../../design/size-class', () => ({ useIsPhone: (): boolean => true }));
vi.mock('react-native-svg', () => ({ default: stub('Svg'), Path: stub('Path'), Text: stub('T') }));
vi.mock('../../../../design/colour', () => ({ useColourResolver: () => (): string => '#000' }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('../../../../store/selectors', () => ({
  useRooms: (): readonly object[] => [],
  useDevices: (): readonly object[] => [],
}));
vi.mock('../../../models', () => ({
  useModelSpecs: (hashes: readonly (string | null)[]): readonly object[] =>
    hashes.map((hash) => ({ status: 'ready', value: hash === 'b'.repeat(64) ? SHELF : VASE })),
  ModelVisual: stub('ModelVisual'),
}));
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

const { FurniturePanel } = await import('./catalogue-panel');
const { ABOVE_FLOOR_LABEL } = await import('./wall-object-inspector');

const SHELF_ROW: ModelCatalogRow = row(SHELF.id, 'Floating shelf', 'b');
const VASE_ROW = row(VASE.id, 'Vase', 'a');

function toolWith(selected: HomeMapObject | null, patch = vi.fn()): FurnitureTool {
  const floor = wallFloor(selected === null ? [] : [shelf({ wall: ATTACHED })]);
  return {
    floor,
    rows: [SHELF_ROW, VASE_ROW],
    readOnly: false,
    selected,
    selectedId: selected?.id ?? null,
    notice: null,
    specOf: wallSpecOf,
    nameOf: (): string => 'Floating shelf',
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

function render(tool: FurnitureTool): void {
  seen.length = 0;
  renderToStaticMarkup(
    createElement(FurniturePanel, {
      tool,
      manipulation: idleManipulation(),
      catalogue: { armed: null, onArm: vi.fn() },
    }),
  );
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

function selectedShelf(): HomeMapObject {
  const object = wallFloor([shelf({ wall: ATTACHED })]).objects[0];
  if (object === undefined) throw new Error('no object');
  return object;
}

describe('the wall objects category and inspector', () => {
  it('offers a Wall objects category made of the wall mounted catalogue models', () => {
    render(toolWith(null));
    expect(find('Interactive', 'Wall objects')['selected']).toBe(false);
    expect(find('Interactive', 'Place Floating shelf')['disabled']).toBe(false);
    const captions = seen.flatMap((item) =>
      item.kind === 'Text' && typeof item.props.children === 'string' ? [item.props.children] : [],
    );
    expect(captions.some((text) => text.startsWith('On the wall · 1.20 m up'))).toBe(true);
  });

  it('shows the wall section instead of the turn buttons for a wall object', () => {
    render(toolWith(selectedShelf()));
    expect(find('NumberStepper', ABOVE_FLOOR_LABEL)['value']).toBe(1.6);
    expect(find('NumberStepper', 'Along the wall')['value']).toBe(2);
    expect(find('Segmented', 'Facing')['options']).toEqual([
      { value: 'left', label: 'Into Living room' },
      { value: 'right', label: 'Other side' },
    ]);
    expect(seen.some((item) => item.props['label'] === 'Turn a quarter')).toBe(false);
    expect(seen.some((item) => item.kind === 'Svg')).toBe(false);
  });

  it('writes the height above the floor to elevation and moves along and across the wall', () => {
    const patch = vi.fn();
    render(toolWith(selectedShelf(), patch));
    call(find('NumberStepper', ABOVE_FLOOR_LABEL), 'onChange', 1.9);
    expect(patch).toHaveBeenLastCalledWith(SHELF_ID, { elevation: 1.9 });
    call(find('Interactive', 'Centre on the wall'), 'onPress');
    expect(patch.mock.lastCall?.[1]).toMatchObject({ wall: { wallId: BOTTOM, offset: 2.5 } });
    call(find('Segmented', 'Facing'), 'onChange', 'right');
    expect(patch.mock.lastCall?.[1]).toMatchObject({ rotation: 270, wall: { side: 'right' } });
  });
});
