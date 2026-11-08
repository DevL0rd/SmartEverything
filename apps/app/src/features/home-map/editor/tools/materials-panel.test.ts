import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_WRITE, type HomeMap, type HomeMapOp } from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import type { MountArgs } from '../mount-edit';

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
vi.mock('uniwind', () => ({ useUniwind: (): object => ({ theme: 'light' }) }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/number-stepper', () => ({ NumberStepper: stub('NumberStepper') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../design/colour', () => ({
  useColourResolver: (): ((role: string) => string) => () => '#000000',
}));

const { MaterialsPanel } = await import('./materials');
const { useMaterialsMount } = await import('./materials-mount');
const model = await import('./materials-model');

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';
const ROOM_ID = '00000000-0000-4000-8000-00000000000a';

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
      ceilingHeight: 2.6,
      rooms: [
        {
          id: ROOM_ID,
          name: 'Kitchen',
          homeRoomId: null,
          polygon: {
            outer: [
              { x: 0, y: 0 },
              { x: 3, y: 0 },
              { x: 3, y: 3 },
            ],
            holes: [],
          },
          labelAt: { x: 2, y: 1 },
          colourSlot: 1,
          floorMaterial: { kind: 'tile', variant: 'small', tint: null },
          wallPaint: null,
          ceilingHeight: null,
          origin: { kind: 'hand' },
        },
      ],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  ],
  sources: [],
  notices: [],
});

type Finish = typeof model.INITIAL_FINISH;

interface Rendered {
  readonly edit: ReturnType<typeof vi.fn>;
  readonly picks: Finish[];
}

function render(selectedId: string | null, pick: Finish, readOnly = false): Rendered {
  seen.length = 0;
  const edit = vi.fn((_ops: readonly HomeMapOp[]) => Promise.resolve());
  const picks: Finish[] = [];
  renderToStaticMarkup(
    createElement(MaterialsPanel, {
      ...{ map: MAP, floorId: FLOOR_ID, selectedId, readOnly, edit, pick },
      onPick: (next: Finish): void => {
        picks.push(next);
      },
    }),
  );
  return { edit, picks };
}

function find(kind: string, label: string): Props {
  const hit = seen.find((item) => item.kind === kind && item.props['label'] === label);
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

const press = (props: Props): void => {
  call(props, 'onPress');
};

const radios = (): readonly Props[] =>
  seen.filter((item) => item.kind === 'Interactive').map((item) => item.props);

const CEILINGS: Finish = { ...model.INITIAL_FINISH, surface: 'ceilings' };

describe('MaterialsPanel', () => {
  it('arms a floor finish from the 4 column grid without editing the map', () => {
    const { edit, picks } = render(null, model.INITIAL_FINISH);
    expect(find('Segmented', 'Finish for')['value']).toBe('floors');
    expect(radios().map((props) => props['label'])).toEqual(
      model.FLOOR_CHOICES.map((item) => item.label),
    );
    expect(find('Interactive', 'Light wood')['selected']).toBe(true);
    press(find('Interactive', 'Dark wood'));
    expect(picks[0]?.floor.id).toBe('wood:dark');
    expect(edit).not.toHaveBeenCalled();
  });

  it('switches between Floors, Walls and Ceilings and arms a wall paint', () => {
    const { picks } = render(null, model.INITIAL_FINISH);
    call(find('Segmented', 'Finish for'), 'onChange', 'walls');
    expect(picks[0]?.surface).toBe('walls');
    const walls = render(null, { ...model.INITIAL_FINISH, surface: 'walls' });
    expect(radios().map((props) => props['label'])).toEqual(
      model.WALL_CHOICES.map((item) => item.label),
    );
    press(find('Interactive', 'Graphite'));
    expect(walls.picks[0]?.wall.hex).toBe('#3A3D42');
  });

  it('tints the floor of the room painted last', () => {
    const { edit } = render(ROOM_ID, model.INITIAL_FINISH);
    press(find('Interactive', 'Oak'));
    expect(edit).toHaveBeenCalledWith([
      {
        op: 'update',
        kind: 'room',
        floorId: FLOOR_ID,
        id: ROOM_ID,
        patch: { floorMaterial: { kind: 'tile', variant: 'small', tint: '#B88A5A' } },
      },
    ]);
  });

  it('keeps ceiling heights in the panel for the floor and the tapped room', () => {
    const { edit } = render(null, CEILINGS);
    expect(seen.some((item) => item.props.children === model.CEILING_HINT)).toBe(true);
    call(find('NumberStepper', 'Ceiling height of Ground'), 'onChange', 2.75);
    expect(edit).toHaveBeenCalledWith([
      { op: 'setFloor', floorId: FLOOR_ID, patch: { ceilingHeight: 2.75 } },
    ]);
    const room = render(ROOM_ID, CEILINGS);
    call(find('NumberStepper', 'Ceiling height of Kitchen'), 'onChange', 3);
    expect(room.edit).toHaveBeenCalledWith([
      { op: 'update', kind: 'room', floorId: FLOOR_ID, id: ROOM_ID, patch: { ceilingHeight: 3 } },
    ]);
  });

  it('disables every map edit control while editing is paused', () => {
    render(ROOM_ID, CEILINGS, true);
    const controls = seen.filter((item) => ['NumberStepper', 'Button'].includes(item.kind));
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((item) => item.props['disabled'] === true)).toBe(true);
  });
});

const SCENE_FLOOR: RenderFloor = {
  ...{ id: FLOOR_ID, name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6, bounds: null },
  ...{ rooms: [], walls: [], openings: [], objects: [], placements: [] },
  ...{ carpets: [], markers: [], measures: [], vacuum: null },
};

const ARGS: MountArgs = { floor: SCENE_FLOOR, name: 'House', placing: true, tool: 'materials' };

interface Mounted {
  readonly mount: ReturnType<ReturnType<typeof useMaterialsMount>>;
  readonly ops: HomeMapOp[][];
  readonly selected: string[];
}

function mountMaterials(readOnly: boolean): Mounted {
  const ops: HomeMapOp[][] = [];
  const selected: string[] = [];
  const mounts: Mounted['mount'][] = [];
  function Host(): ReactNode {
    const mount = useMaterialsMount({
      ...{ map: MAP, floorId: FLOOR_ID, selected: null, readOnly },
      edit: (sent) => {
        ops.push([...sent]);
        return Promise.resolve();
      },
      onSelect: (id) => {
        selected.push(id);
      },
    });
    mounts.push(mount(ARGS));
    return null;
  }
  renderToStaticMarkup(createElement(Host));
  const [mount] = mounts;
  if (mount === undefined) throw new Error('not mounted');
  return { mount, ops, selected };
}

const paintFloor: EditEvent = {
  seq: 1,
  type: 'paint',
  target: { kind: 'floor', roomId: ROOM_ID },
};

describe('materials mount', () => {
  it('paints the floor under the pointer in the 3D scene and names the finish', () => {
    const { mount, ops, selected } = mountMaterials(false);
    expect(mount).toMatchObject({
      overlay: { mode: 'paint', paint: { surface: 'floor' } },
      notice: { text: 'Tap a floor to apply Light wood', tone: 'info' },
    });
    mount.onEdit?.(paintFloor);
    expect(ops).toEqual([
      [
        {
          op: 'update',
          kind: 'room',
          floorId: FLOOR_ID,
          id: ROOM_ID,
          patch: { floorMaterial: { kind: 'wood', variant: 'light', tint: null } },
        },
      ],
    ]);
    expect(selected).toEqual([ROOM_ID]);
  });

  it('picks a tapped room and never paints while read only', () => {
    const { mount, ops, selected } = mountMaterials(true);
    mount.onEdit?.(paintFloor);
    mount.onEdit?.({
      ...{ seq: 2, type: 'tap', point: { x: 1, y: 1 }, floorId: FLOOR_ID },
      ...{ hit: { kind: 'room', id: ROOM_ID }, metresPerPx: 0.02 },
    });
    expect(ops).toEqual([]);
    expect(selected).toEqual([ROOM_ID]);
  });
});
