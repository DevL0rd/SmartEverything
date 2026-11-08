import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP,
  applyHomeMapEdits,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOp,
} from '@smarteverything/domain';
import type { EditEvent } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import type { MountArgs } from '../mount-edit';

interface Props {
  readonly children?: ReactNode;
  readonly value?: unknown;
  readonly label?: unknown;
  readonly onPress?: () => void;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'new-mark' }));
vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../components/text-field', () => ({ TextField: stub('TextField') }));

const { MeasureNotesPanel } = await import('./measure-notes');
const { useMeasureNotesMount } = await import('./measure-notes-mount');
const model = await import('./measure-notes-model');

const HAND = { kind: 'hand' };
const USER = { actor: 'profile:alice', at: '2026-10-25T11:00:00.000Z' };
const FREE = { fine: false, free: true };

const house = (): HomeMap =>
  HOME_MAP.parse({
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

const floorOf = (map: HomeMap): HomeMapFloor => {
  const floor = map.floors[0];
  if (floor === undefined) throw new Error('no floor');
  return floor;
};

type Context = Parameters<typeof model.measureNotesTap>[0];

interface Harness {
  readonly sent: HomeMapOp[][];
  readonly context: () => Context;
  readonly floor: () => HomeMapFloor;
  readonly state: () => typeof model.INITIAL_MEASURE_NOTES;
}

function harness(mode: 'measure' | 'notes', readOnly = false): Harness {
  const sent: HomeMapOp[][] = [];
  let map = house();
  let state = model.INITIAL_MEASURE_NOTES;
  let next = 0;
  const context = (): Context => ({
    mode,
    floor: floorOf(map),
    state,
    readOnly,
    newId: (): string => `a-${String((next += 1))}`,
    dispatch: (event): void => {
      state = model.reduceMeasureNotes(state, event);
    },
    edit: (ops): void => {
      sent.push([...ops]);
      map = applyHomeMapEdits(map, ops, USER).map;
    },
  });
  return { sent, context, floor: () => floorOf(map), state: () => state };
}

beforeEach(() => {
  seen.length = 0;
});

describe('measure', () => {
  it('measures between two taps and keeps the line as an annotation', () => {
    const h = harness('measure');
    model.measureNotesTap(h.context(), { x: 0, y: 0 }, FREE);
    model.measureNotesTap(h.context(), { x: 3, y: 4 }, FREE);
    expect(h.state().to).toEqual({ x: 3, y: 4 });
    model.keepMeasure(h.context());
    const [mark] = h.floor().annotations;
    expect(mark).toMatchObject({ kind: 'measure', text: '5.00 m', from: { x: 0, y: 0 } });
    expect(h.state().from).toBeNull();
  });

  it('a third tap starts a new measurement', () => {
    const h = harness('measure');
    for (const x of [0, 2, 1]) model.measureNotesTap(h.context(), { x, y: 0 }, FREE);
    expect(h.state()).toMatchObject({ from: { x: 1, y: 0 }, to: null });
  });

  it('measures offline but never writes while read only', () => {
    const h = harness('measure', true);
    model.measureNotesTap(h.context(), { x: 0, y: 0 }, FREE);
    model.measureNotesTap(h.context(), { x: 1, y: 0 }, FREE);
    model.keepMeasure(h.context());
    expect(h.sent).toEqual([]);
    expect(h.state().to).toEqual({ x: 1, y: 0 });
  });
});

describe('notes and pins', () => {
  it('a tap on empty map adds the chosen mark and picks it, a tap on it picks it', () => {
    const h = harness('notes');
    h.context().dispatch({ type: 'markKind', kind: 'pin' });
    model.measureNotesTap(h.context(), { x: 1, y: 1 }, FREE);
    expect(h.floor().annotations[0]).toMatchObject({ id: 'a-1', kind: 'pin', text: '' });
    h.context().dispatch({ type: 'pick', id: null });
    model.measureNotesTap(h.context(), { x: 1.1, y: 1 }, FREE);
    expect(h.sent).toHaveLength(1);
    expect(h.state().picked).toBe('a-1');
  });

  it('read only taps add nothing', () => {
    const h = harness('notes', true);
    model.measureNotesTap(h.context(), { x: 1, y: 1 }, FREE);
    expect(h.sent).toEqual([]);
  });

  it('the panel edits the picked note text and deletes it', () => {
    const h = harness('notes');
    model.measureNotesTap(h.context(), { x: 1, y: 1 }, FREE);
    renderToStaticMarkup(createElement(MeasureNotesPanel, { context: h.context() }));
    const field = seen.find((item) => item.kind === 'TextField');
    expect(field?.props.value).toBe(model.NEW_NOTE_TEXT);
    const remove = seen.find((item) => item.kind === 'Button' && item.props.label === 'Delete');
    remove?.props.onPress?.();
    expect(h.floor().annotations).toEqual([]);
  });
});

describe('panel list', () => {
  it('lists measures and notes in both modes with their room and deletes from the row', () => {
    const h = harness('notes');
    model.measureNotesTap(h.context(), { x: 1, y: 1 }, FREE);
    h.context().edit([model.measureOp('f1', { x: 0, y: 1 }, { x: 3, y: 1 }, 'm-1')]);
    renderToStaticMarkup(
      createElement(MeasureNotesPanel, { context: { ...h.context(), mode: 'measure' } }),
    );
    const rows = seen.filter((item) => item.kind === 'ListRow').map((item) => item.props);
    expect(rows.map((row) => [row['title'], row['subtitle']])).toEqual([
      ['New note', 'Note · Kitchen'],
      ['3.00 m', 'Measure · Kitchen'],
    ]);
    const note = rows.find((row) => row['title'] === 'New note');
    const trailing = note?.['trailing'];
    if (!isValidElement(trailing)) throw new Error('no delete button');
    renderToStaticMarkup(trailing);
    const trash = seen.find(
      (item) => item.kind === 'IconButton' && item.props.label === 'Delete New note',
    );
    trash?.props.onPress?.();
    expect(h.floor().annotations.map((mark) => mark.id)).toEqual(['m-1']);
    expect(h.state().picked).toBeNull();
  });
});

describe('scene overlay', () => {
  it('draws a saved measure as a line with two end ticks and its length pill', () => {
    const h = harness('measure');
    h.context().edit([model.measureOp('f1', { x: 0, y: 0 }, { x: 2, y: 0 }, 'm-1')]);
    const overlay = model.marksOverlay(h.context());
    expect(overlay.mode).toBe('draw-points');
    const [ruler, tickA, tickB] = overlay.ghosts;
    expect(ruler).toEqual({
      shape: 'polyline',
      points: [
        { x: 0, y: 0, height: 0 },
        { x: 2, y: 0, height: 0 },
      ],
      tone: 'neutral',
    });
    expect(tickA?.shape === 'polyline' ? tickA.points : []).toEqual([
      { x: 0, y: -model.TICK_HALF_M, height: 0 },
      { x: 0, y: model.TICK_HALF_M, height: 0 },
    ]);
    expect(tickB?.shape === 'polyline' ? tickB.points.map((point) => point.x) : []).toEqual([2, 2]);
    expect(overlay.labels).toContainEqual({
      at: { x: 1, y: 0, height: 0 },
      text: '2.00 m',
      tone: 'neutral',
    });
  });

  it('shows the room sizes and the live measurement in amber while measuring', () => {
    const h = harness('measure');
    model.measureNotesTap(h.context(), { x: 0, y: 0 }, FREE);
    const started = model.marksOverlay(h.context());
    expect(started.ghosts.every((ghost) => ghost.tone === 'accent')).toBe(true);
    expect(started.ghosts).toHaveLength(2);
    model.measureNotesTap(h.context(), { x: 0, y: 2 }, FREE);
    const live = model.marksOverlay(h.context());
    expect(live.labels).toEqual([
      { at: { x: 2, y: 1.5, height: 0 }, text: '4.00 × 3.00 m · 12.0 m²', tone: 'neutral' },
      { at: { x: 0, y: 1, height: 0 }, text: '2.00 m', tone: 'accent' },
    ]);
  });

  it('pins every note as an amber disc with its text pill, the picked one in amber', () => {
    const h = harness('notes');
    model.measureNotesTap(h.context(), { x: 1, y: 1 }, FREE);
    h.context().dispatch({ type: 'markKind', kind: 'pin' });
    h.context().dispatch({ type: 'pick', id: null });
    model.measureNotesTap(h.context(), { x: 3, y: 2 }, FREE);
    const overlay = model.marksOverlay(h.context());
    expect(overlay.mode).toBe('none');
    expect(overlay.ghosts.map((ghost) => [ghost.shape, ghost.tone])).toEqual([
      ['polygon', 'accent'],
      ['polygon', 'accent'],
    ]);
    expect(overlay.labels).toEqual([
      { at: { x: 1, y: 1, height: 0 }, text: model.NEW_NOTE_TEXT, tone: 'neutral' },
    ]);
    h.context().dispatch({ type: 'pick', id: 'a-1' });
    expect(model.marksOverlay(h.context()).labels[0]?.tone).toBe('accent');
  });

  it('names the next step in the notice chip', () => {
    const h = harness('measure');
    expect(model.marksNotice(h.context()).text).toBe(model.MEASURE_FIRST);
    model.measureNotesTap(h.context(), { x: 0, y: 0 }, FREE);
    expect(model.marksNotice(h.context()).text).toBe(model.MEASURE_SECOND);
    model.measureNotesTap(h.context(), { x: 1, y: 0 }, FREE);
    expect(model.marksNotice(h.context()).text).toBe(model.MEASURE_KEEP);
    expect(model.marksNotice({ ...h.context(), mode: 'notes' }).text).toBe(model.NOTES_HINT);
  });
});

type Mounted = ReturnType<ReturnType<typeof useMeasureNotesMount>>;

const tapAt = (x: number, y: number): EditEvent => ({
  seq: 0,
  type: 'tap',
  point: { x, y },
  floorId: 'f1',
  hit: { kind: 'none' },
  metresPerPx: 0.02,
});

const SCENE_FLOOR: RenderFloor = {
  ...{ id: 'f1', name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6, bounds: null },
  ...{ rooms: [], walls: [], openings: [], objects: [], placements: [] },
  ...{ carpets: [], markers: [], measures: [], vacuum: null },
};

const argsFor = (tool: MountArgs['tool']): MountArgs => ({
  ...{ floor: SCENE_FLOOR, name: 'House', placing: true, tool },
});

describe('measure and notes mount', () => {
  function mountOf(tool: MountArgs['tool'], readOnly: boolean, sent: HomeMapOp[][]): Mounted {
    const mounted: Mounted[] = [];
    function Host(): ReactNode {
      const mount = useMeasureNotesMount({
        ...{ map: house(), floorId: 'f1', readOnly },
        edit: (ops) => {
          sent.push([...ops]);
          return Promise.resolve();
        },
      });
      mounted.push(mount(argsFor(tool)));
      return null;
    }
    renderToStaticMarkup(createElement(Host));
    const [first] = mounted;
    if (first === undefined) throw new Error('not mounted');
    return first;
  }

  it('drives the scene overlay, notice and panel', () => {
    const mount = mountOf('measure', false, []);
    expect(mount).toMatchObject({
      draft: false,
      notice: { text: model.MEASURE_FIRST, tone: 'info' },
      overlay: { mode: 'draw-points' },
    });
  });

  it('adds a note through the editing edit on a scene tap in Notes, never while read only', () => {
    const sent: HomeMapOp[][] = [];
    mountOf('notes', false, sent).onEdit?.(tapAt(1, 1));
    expect(sent).toEqual([
      [
        {
          op: 'add',
          kind: 'annotation',
          floorId: 'f1',
          element: { id: 'new-mark', kind: 'note', at: { x: 1, y: 1 }, text: 'New note' },
        },
      ],
    ]);
    const locked: HomeMapOp[][] = [];
    mountOf('notes', true, locked).onEdit?.(tapAt(1, 1));
    expect(locked).toEqual([]);
  });
});
