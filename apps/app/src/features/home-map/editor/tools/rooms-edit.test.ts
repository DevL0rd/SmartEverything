import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP_ROOM_WRITE, type HomeMapRoom } from '@smarteverything/domain';
import {
  EDIT_OVERLAY,
  type EditEvent,
  type EditHit,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { RoomsEdit } from './rooms-edit';
import { REFUSAL_TEXT, type CutLine, type RoomsEditMode } from './rooms-edit-model';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

interface KeyHook {
  active: boolean;
  handle: ((press: { key: string; shift: boolean; mod: boolean }) => boolean) | null;
}

const seen = vi.hoisted(() => new Array<Seen>());

const tick = vi.hoisted(() => vi.fn());

const keys = vi.hoisted((): KeyHook => ({ active: false, handle: null }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'new-room' }));
vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../../components/number-stepper', () => ({
  NumberStepper: stub('NumberStepper'),
}));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../components/text-field', () => ({ TextField: stub('TextField') }));
vi.mock('../../../../design/size-class', () => ({ useIsPhone: (): boolean => true }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: tick }));
vi.mock('../../../../store/selectors', () => ({ useRooms: (): readonly object[] => [] }));
vi.mock('../list-editor/list-parts', () => ({ ShapeThumb: stub('ShapeThumb') }));
vi.mock('../manipulate/document-keys', () => ({
  useDocumentKeys: (active: boolean, handle: KeyHook['handle']): void => {
    keys.active = active;
    keys.handle = handle;
  },
}));

const { CUT_LINE_ID, EDIT_HINTS, roomsEditEvent, roomsEditNotice, roomsEditOverlay } =
  await import('./rooms-mount');
const { RoomsEditPanel, SPLIT_HINT } = await import('./rooms-edit-panel');
const { roomHandles } = await import('./rooms-edit-geometry');

const HUB = '6f1c2a40-0000-4000-8000-000000000001';

const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

function room(id: string, x: number, extra: Partial<HomeMapRoom> = {}): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id,
    name: null,
    homeRoomId: null,
    polygon: { outer: rect(x, 0, 4, 3), holes: [] },
    labelAt: { x: x + 2, y: 1.5 },
    colourSlot: 1,
    floorMaterial: { kind: 'plain', variant: null, tint: null },
    wallPaint: null,
    ceilingHeight: null,
    origin: { kind: 'hand' },
    ...extra,
  });
}

const living = room('living', 0);
const study = room('study', 4, { name: 'Study' });

function editOf(mode: RoomsEditMode, extra: Partial<RoomsEdit> = {}): RoomsEdit {
  return {
    mode,
    refusal: null,
    linkNote: null,
    floor: { id: 'f', rooms: [living, study], walls: [] },
    room: living,
    corner: null,
    readOnly: false,
    start: vi.fn(),
    cancel: vi.fn(),
    line: vi.fn(),
    cut: vi.fn(),
    merge: vi.fn(),
    link: vi.fn(),
    rename: vi.fn(),
    pickCorner: vi.fn(),
    setCorner: vi.fn(),
    removeCorner: vi.fn(),
    addCorner: vi.fn(),
    pushSide: vi.fn(),
    resize: vi.fn(),
    moveRoom: vi.fn(),
    ...extra,
  };
}

const IDLE: RoomsEditMode = { kind: 'idle' };

const NONE: EditHit = { kind: 'none' };

function tap(x: number, y: number, hit: EditHit = NONE): EditEvent {
  return { seq: 1, type: 'tap', point: { x, y }, floorId: 'f', hit, metresPerPx: 0.01 };
}

function handleId(index: number): string {
  const handle = roomHandles(living)[index];
  if (handle === undefined) throw new Error(`no handle ${String(index)}`);
  return handle.handle.id;
}

function lineOf(edit: RoomsEdit): CutLine {
  const calls = vi.mocked(edit.line).mock.calls;
  const [line] = calls[calls.length - 1] ?? [];
  if (line === undefined) throw new Error('no line');
  return line;
}

const hubRooms = [{ id: HUB, name: 'Lounge' }];

function render(edit: RoomsEdit): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(RoomsEditPanel, { edit, hubRooms }));
  return [...seen];
}

const titles = (list: readonly Seen[], kind: string): readonly unknown[] =>
  list
    .filter((item) => item.kind === kind)
    .map((item) => item.props['title'] ?? item.props['label']);

function find(list: readonly Seen[], kind: string, label: string): Seen {
  const found = list.find(
    (item) => item.kind === kind && (item.props['label'] ?? item.props['title']) === label,
  );
  if (found === undefined) throw new Error(`no ${kind} ${label}`);
  return found;
}

function call(item: Seen, key: string, ...args: unknown[]): void {
  const handler = item.props[key];
  if (typeof handler !== 'function') throw new Error(`no ${key}`);
  Reflect.apply(handler, undefined, args);
}

const texts = (list: readonly Seen[]): readonly unknown[] =>
  list.filter((item) => item.kind === 'Text').map((item) => item.props.children);

beforeEach(() => {
  seen.length = 0;
  tick.mockClear();
  keys.active = false;
  keys.handle = null;
});

describe('rooms edit in the scene', () => {
  it('shows a knob at every corner, a dot at every side middle and lets the room body drag', () => {
    const overlay = EDIT_OVERLAY.parse(roomsEditOverlay(editOf(IDLE)));
    expect(overlay).toMatchObject({ mode: 'select', selection: ['living'], roomDrag: true });
    expect(overlay.handles.map((handle) => handle.kind)).toEqual([
      ...['point', 'point', 'point', 'point'],
      ...['edge', 'edge', 'edge', 'edge'],
    ]);
    expect(overlay.handles[5]).toMatchObject({
      at: { x: 4, y: 1.5, height: 0 },
      target: { kind: 'room-side', roomId: 'living', index: 1 },
    });
  });

  it('puts the size and area pill under the room on its outline', () => {
    const overlay = EDIT_OVERLAY.parse(roomsEditOverlay(editOf(IDLE)));
    expect(overlay.labels).toEqual([
      { at: { x: 2, y: 0, height: 0 }, text: '4.00 × 3.00 m · 12.0 m²', tone: 'neutral' },
    ]);
    expect(overlay.ghosts[0]).toMatchObject({ shape: 'polyline', tone: 'accent' });
  });

  it('labels the selected corner with its position', () => {
    const overlay = roomsEditOverlay(editOf(IDLE, { corner: 1 }));
    expect(overlay?.labels[0]).toEqual({
      at: { x: 4, y: 0, height: 0 },
      text: 'X 4.00  Y 0.00',
      tone: 'accent',
    });
  });

  it('keeps the room body still while offline', () => {
    expect(roomsEditOverlay(editOf(IDLE, { readOnly: true }))).toMatchObject({
      roomDrag: false,
      readOnly: true,
    });
  });

  it('selects a corner with a tap on its knob', () => {
    const edit = editOf(IDLE);
    expect(roomsEditEvent(edit, tap(4.05, 0.02))).toBe(true);
    expect(edit.pickCorner).toHaveBeenCalledWith(1);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('adds a corner with a tap on a side dot', () => {
    const edit = editOf(IDLE);
    expect(roomsEditEvent(edit, tap(2, 0.05))).toBe(true);
    expect(edit.addCorner).toHaveBeenCalledWith(0);
    expect(edit.pickCorner).not.toHaveBeenCalled();
  });

  it('lets a tap away from the handles fall through to drawing and clears the corner', () => {
    const edit = editOf(IDLE, { corner: 2 });
    expect(roomsEditEvent(edit, tap(2, 1.5, { kind: 'room', id: 'living' }))).toBe(false);
    expect(edit.pickCorner).toHaveBeenCalledWith(null);
  });

  it('moves a dragged corner, pushes a dragged side and moves the dragged room', () => {
    const edit = editOf(IDLE);
    roomsEditEvent(edit, { seq: 2, type: 'vertex', handleId: handleId(2), point: { x: 5, y: 4 } });
    roomsEditEvent(edit, { seq: 3, type: 'edge', handleId: handleId(5), offset: 0.5 });
    roomsEditEvent(edit, { seq: 4, type: 'room-move', id: 'living', by: { x: 1, y: -1 } });
    expect(edit.setCorner).toHaveBeenCalledWith(2, { x: 5, y: 4 });
    expect(edit.pushSide).toHaveBeenCalledWith(1, 0.5);
    expect(edit.moveRoom).toHaveBeenCalledWith({ x: 1, y: -1 });
    roomsEditEvent(edit, { seq: 5, type: 'room-move', id: 'study', by: { x: 1, y: 0 } });
    expect(edit.moveRoom).toHaveBeenCalledTimes(1);
  });

  it('cuts with two taps: the first starts the line, the second ends it', () => {
    const first = editOf({ kind: 'split', roomId: 'living', line: null });
    roomsEditEvent(first, tap(1, -1));
    const start = lineOf(first);
    expect(start.from.x).toBeCloseTo(1);
    expect(start.from.y).toBeCloseTo(-1);
    expect(start.to).toEqual(start.from);
    const second = editOf({ kind: 'split', roomId: 'living', line: start });
    roomsEditEvent(second, tap(1, 4));
    const done = lineOf(second);
    expect(done.from).toEqual(start.from);
    expect(done.to.y).toBeCloseTo(4);
  });

  it('shows one draggable end after the first cut tap and both ends after the second', () => {
    const point = { x: 1, y: -1 };
    const started = EDIT_OVERLAY.parse(
      roomsEditOverlay(
        editOf({ kind: 'split', roomId: 'living', line: { from: point, to: point } }),
      ),
    );
    expect(started.handles.map((handle) => handle.target)).toEqual([
      { kind: 'line-end', lineId: CUT_LINE_ID, end: 'to' },
    ]);
    const line = { from: point, to: { x: 1, y: 4 } };
    const drawn = EDIT_OVERLAY.parse(
      roomsEditOverlay(editOf({ kind: 'split', roomId: 'living', line })),
    );
    expect(drawn.handles).toHaveLength(2);
    expect(drawn.shapes).toEqual([{ kind: 'line', id: CUT_LINE_ID, ...line }]);
  });

  it('moves the dragged end of the cut line', () => {
    const line = { from: { x: 1, y: -1 }, to: { x: 1, y: 4 } };
    const edit = editOf({ kind: 'split', roomId: 'living', line });
    roomsEditEvent(edit, {
      seq: 5,
      type: 'vertex',
      handleId: `${CUT_LINE_ID}:from`,
      point: { x: 2, y: -1 },
    });
    expect(edit.line).toHaveBeenCalledWith({ from: { x: 2, y: -1 }, to: line.to });
  });

  it('merges with a tapped room next to it and outlines the rooms it can join', () => {
    const edit = editOf({ kind: 'merge', roomId: 'living' });
    expect(EDIT_OVERLAY.parse(roomsEditOverlay(edit)).ghosts).toHaveLength(1);
    roomsEditEvent(edit, tap(6, 1, { kind: 'room', id: 'study' }));
    expect(edit.merge).toHaveBeenCalledWith('study');
  });

  it('names what to do next in the notice chip', () => {
    expect(roomsEditNotice(editOf(IDLE))?.text).toBe(EDIT_HINTS.room);
    expect(roomsEditNotice(editOf(IDLE, { corner: 0 }))?.text).toBe(EDIT_HINTS.corner);
    expect(roomsEditNotice(editOf({ kind: 'split', roomId: 'living', line: null }))?.text).toBe(
      EDIT_HINTS.split,
    );
    expect(roomsEditNotice(editOf(IDLE, { readOnly: true }))).toBeNull();
  });
});

describe('RoomsEditPanel', () => {
  it('offers width, depth, split, merge, the home room list and a name for an unlinked room', () => {
    const shown = render(editOf(IDLE));
    expect(titles(shown, 'NumberStepper')).toEqual(['Width', 'Depth']);
    expect(titles(shown, 'Button')).toEqual(['Split room', 'Merge']);
    expect(titles(shown, 'ListRow')).toEqual(['Not linked', 'Lounge']);
    expect(titles(shown, 'TextField')).toEqual(['Room name']);
    expect(texts(shown)).toContain('12.0 m²');
  });

  it('resizes the room from the width field', () => {
    const edit = editOf(IDLE);
    call(find(render(edit), 'NumberStepper', 'Width'), 'onChange', 5);
    expect(edit.resize).toHaveBeenCalledWith('x', 5);
  });

  it('shows the selected corner with X and Y fields and Remove corner', () => {
    const edit = editOf(IDLE, { corner: 1 });
    const shown = render(edit);
    expect(texts(shown)).toContain('Corner 2 of 4');
    expect(titles(shown, 'NumberStepper')).toEqual(['X', 'Y']);
    call(find(shown, 'NumberStepper', 'X'), 'onChange', 5);
    expect(edit.setCorner).toHaveBeenCalledWith(1, { x: 5, y: 0 });
    const remove = find(shown, 'Button', 'Remove corner');
    expect(remove.props['variant']).toBe('destructive');
    call(remove, 'onPress');
    expect(edit.removeCorner).toHaveBeenCalledTimes(1);
  });

  it('removes the selected corner with the Delete key', () => {
    const edit = editOf(IDLE, { corner: 1 });
    render(edit);
    expect(keys.active).toBe(true);
    expect(keys.handle?.({ key: 'a', shift: false, mod: false })).toBe(false);
    expect(keys.handle?.({ key: 'Delete', shift: false, mod: false })).toBe(true);
    expect(edit.removeCorner).toHaveBeenCalledTimes(1);
  });

  it('keeps the last three corners of a room', () => {
    const triangle = HOME_MAP_ROOM_WRITE.parse({
      ...living,
      polygon: { outer: rect(0, 0, 4, 3).slice(0, 3), holes: [] },
    });
    const shown = render(editOf(IDLE, { room: triangle, corner: 0 }));
    expect(keys.active).toBe(false);
    expect(find(shown, 'Button', 'Remove corner').props['disabled']).toBe(true);
  });

  it('hides the name for a linked room and links through the list', () => {
    const edit = editOf(IDLE, { room: { ...living, homeRoomId: HUB } });
    const shown = render(edit);
    expect(titles(shown, 'TextField')).toEqual([]);
    call(find(shown, 'ListRow', 'Not linked'), 'onPress');
    expect(edit.link).toHaveBeenCalledWith(null);
  });

  it('splits only once the cut line has two ends and says why a cut was refused', () => {
    const open = render(
      editOf({ kind: 'split', roomId: 'living', line: null }, { refusal: 'no_cut' }),
    );
    expect(texts(open)).toContain(SPLIT_HINT);
    expect(texts(open)).toContain(REFUSAL_TEXT.no_cut);
    expect(find(open, 'Button', 'Split room').props['disabled']).toBe(true);
    const line = { from: { x: 1, y: -1 }, to: { x: 1, y: 4 } };
    const edit = editOf({ kind: 'split', roomId: 'living', line });
    const ready = find(render(edit), 'Button', 'Split room');
    expect(ready.props['disabled']).toBe(false);
    call(ready, 'onPress');
    expect(edit.cut).toHaveBeenCalledTimes(1);
  });

  it('lists the touching rooms to merge with', () => {
    const edit = editOf({ kind: 'merge', roomId: 'living' });
    call(find(render(edit), 'ListRow', 'Study'), 'onPress');
    expect(edit.merge).toHaveBeenCalledWith('study');
  });

  it('turns off every button and field while offline', () => {
    const shown = render(editOf(IDLE, { readOnly: true }));
    const controls = shown.filter(
      (item) => item.kind === 'Button' || item.kind === 'NumberStepper',
    );
    expect(controls.every((item) => item.props['disabled'] === true)).toBe(true);
  });
});
