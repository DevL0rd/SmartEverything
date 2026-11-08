import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP, type HomeMap, type HomeMapOp } from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import type { MountEditFields } from '../mount-edit';

interface Props {
  readonly children?: ReactNode;
  readonly readOnly?: boolean;
  readonly selectedId?: string | null;
  readonly floorId?: string | null;
  readonly context?: unknown;
  readonly edit?: (ops: readonly HomeMapOp[]) => Promise<unknown>;
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

vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'new-mark' }));
vi.mock('./materials', () => ({ MaterialsPanel: stub('MaterialsPanel') }));
vi.mock('./measure-notes', () => ({ MeasureNotesPanel: stub('MeasureNotesPanel') }));

const { useMaterialsMount } = await import('./materials-mount');
const { useMeasureNotesMount } = await import('./measure-notes-mount');

const HAND = { kind: 'hand' };

const MAP: HomeMap = HOME_MAP.parse({
  id: 'home',
  schemaVersion: 1,
  revision: 1,
  name: 'House',
  north: 0,
  updatedAt: '2026-10-25T10:00:00.000Z',
  sources: [],
  notices: [],
  floors: [
    {
      id: 'f1',
      name: 'Ground',
      level: 0,
      elevation: 0,
      ceilingHeight: 2.6,
      rooms: [
        {
          id: 'r1',
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
          floorMaterial: { kind: 'tile', variant: null, tint: null },
          wallPaint: null,
          ceilingHeight: null,
          origin: HAND,
        },
      ],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  ],
});

const FLOOR: RenderFloor = {
  ...{ id: 'f1', name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6, bounds: null },
  ...{ rooms: [], walls: [], openings: [], objects: [], placements: [] },
  ...{ carpets: [], markers: [], measures: [], vacuum: null },
};
const ARGS = { floor: FLOOR, name: 'House', placing: true } as const;

function propsOf(kind: string): Props {
  const found = seen.find((item) => item.kind === kind);
  if (found === undefined) throw new Error(`${kind} was not mounted`);
  return found.props;
}

function tap(x: number, y: number, roomId: string | null): EditEvent {
  return {
    ...{ seq: 1, type: 'tap', point: { x, y }, floorId: 'f1', metresPerPx: 0.01 },
    hit: roomId === null ? { kind: 'none' } : { kind: 'room', id: roomId },
  };
}

const PAINT_KITCHEN: EditEvent = {
  seq: 2,
  type: 'paint',
  target: { kind: 'floor', roomId: 'r1' },
};

interface Sent {
  readonly ops: HomeMapOp[][];
  readonly selected: string[];
  readonly mount: MountEditFields & { readonly panel: ReactNode };
}

function renderMaterials(readOnly: boolean, selected: string | null): Sent {
  const ops: HomeMapOp[][] = [];
  const picked: string[] = [];
  const held: { mount: Sent['mount'] | null } = { mount: null };
  function Host(): ReactNode {
    const shown = useMaterialsMount({
      ...{ map: MAP, floorId: 'f1', selected, readOnly },
      edit: (next) => {
        ops.push([...next]);
        return Promise.resolve();
      },
      onSelect: (id) => {
        picked.push(id);
      },
    })({ ...ARGS, tool: 'materials' });
    held.mount = shown;
    return createElement('div', null, shown.panel);
  }
  renderToStaticMarkup(createElement(Host));
  const { mount } = held;
  if (mount === null) throw new Error('the materials mount did not render');
  return { ops, selected: picked, mount };
}

function renderMarks(mode: 'measure' | 'notes', readOnly: boolean): Sent {
  const ops: HomeMapOp[][] = [];
  const held: { mount: Sent['mount'] | null } = { mount: null };
  function Host(): ReactNode {
    const shown = useMeasureNotesMount({
      ...{ map: MAP, floorId: 'f1', readOnly },
      edit: (next) => {
        ops.push([...next]);
        return Promise.resolve();
      },
    })({ ...ARGS, tool: mode });
    held.mount = shown;
    return createElement('div', null, shown.panel);
  }
  renderToStaticMarkup(createElement(Host));
  const { mount } = held;
  if (mount === null) throw new Error('the marks mount did not render');
  return { ops, selected: [], mount };
}

beforeEach(() => {
  seen.length = 0;
});

describe('materials mount', () => {
  it('paints floors in the scene and shows the materials panel for the selected room', () => {
    const { mount } = renderMaterials(false, 'r1');
    expect(mount.overlay).toMatchObject({
      mode: 'paint',
      paint: { surface: 'floor' },
      selection: ['r1'],
      readOnly: false,
    });
    expect(mount.notice).toEqual({ text: 'Tap a floor to apply Light wood', tone: 'info' });
    expect(mount.draft).toBe(false);
    expect(propsOf('MaterialsPanel')).toMatchObject({
      floorId: 'f1',
      selectedId: 'r1',
      readOnly: false,
    });
  });

  it('selects the room under a tap and ignores taps outside every room', () => {
    const sent = renderMaterials(false, null);
    sent.mount.onEdit?.(tap(2, 1, 'r1'));
    sent.mount.onEdit?.(tap(9, 9, null));
    expect(sent.selected).toEqual(['r1']);
    expect(sent.ops).toEqual([]);
  });

  it('applies the picked floor to a painted room and selects it', () => {
    const sent = renderMaterials(false, null);
    sent.mount.onEdit?.(PAINT_KITCHEN);
    expect(sent.ops).toHaveLength(1);
    expect(sent.ops[0]?.[0]).toMatchObject({ op: 'update', kind: 'room', floorId: 'f1', id: 'r1' });
    expect(sent.selected).toEqual(['r1']);
  });

  it('paints nothing while read only and passes read only to the scene and the panel', () => {
    const sent = renderMaterials(true, null);
    sent.mount.onEdit?.(PAINT_KITCHEN);
    expect(sent.ops).toEqual([]);
    expect(sent.mount.overlay?.readOnly).toBe(true);
    expect(propsOf('MaterialsPanel').readOnly).toBe(true);
  });

  it('sends panel edits through the editing edit', () => {
    const sent = renderMaterials(false, null);
    const op: HomeMapOp = { op: 'remove', kind: 'annotation', floorId: 'f1', id: 'x' };
    void propsOf('MaterialsPanel').edit?.([op]);
    expect(sent.ops).toEqual([[op]]);
  });
});

describe('measure and notes mount', () => {
  it('draws points in Measure and only shows marks in Notes', () => {
    const measure = renderMarks('measure', false).mount;
    expect(measure.overlay?.mode).toBe('draw-points');
    expect(measure.notice).toEqual({ text: 'Tap the first point on the floor', tone: 'info' });
    expect(measure.draft).toBe(false);
    expect(propsOf('MeasureNotesPanel').context).toMatchObject({ mode: 'measure' });
    seen.length = 0;
    const notes = renderMarks('notes', false).mount;
    expect(notes.overlay?.mode).toBe('none');
    expect(notes.notice).toEqual({ text: 'Tap the floor to pin a note', tone: 'info' });
    expect(propsOf('MeasureNotesPanel').context).toMatchObject({ mode: 'notes' });
  });

  it('adds a note through the editing edit on a tap in Notes', () => {
    const sent = renderMarks('notes', false);
    sent.mount.onEdit?.(tap(1, 1, 'r1'));
    expect(sent.ops).toEqual([
      [
        {
          op: 'add',
          kind: 'annotation',
          floorId: 'f1',
          element: { id: 'new-mark', kind: 'note', at: { x: 1, y: 1 }, text: 'New note' },
        },
      ],
    ]);
  });

  it('measures without editing, and read only adds no marks', () => {
    const measured = renderMarks('measure', false);
    measured.mount.onEdit?.(tap(1, 1, 'r1'));
    expect(measured.ops).toEqual([]);
    seen.length = 0;
    const locked = renderMarks('notes', true);
    locked.mount.onEdit?.(tap(1, 1, 'r1'));
    expect(locked.ops).toEqual([]);
    expect(locked.mount.overlay?.readOnly).toBe(true);
    expect(propsOf('MeasureNotesPanel').context).toMatchObject({ readOnly: true });
  });
});
